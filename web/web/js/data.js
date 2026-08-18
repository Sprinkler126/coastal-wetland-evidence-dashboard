/**
 * data.js — manifest-backed data loading, validation, indexes, and formatters.
 * The research presentation remains intentionally simple; the data boundary is explicit.
 */

const DATA = {
    manifest: null,
    global: null,
    byCluster: null,
    dependence: null,
    dependenceSummary: null,
    partialEffect: null,
    partialEffectSummary: null,
    evidenceBundle: null,
    evidenceError: null,
    loaded: false,
};

const DATA_CACHE_VERSION = 'beta-2026-08-18';
const MANIFEST_URL = `./data/manifest.json?v=${DATA_CACHE_VERSION}`;
const EVIDENCE_TYPES = ['ASSOCIATION', 'EXPLORATORY', 'FACT', 'INSUFFICIENT', 'MODEL_ATTRIBUTION'];
const DATASET_KEYS = ['global', 'byCluster', 'dependence', 'dependenceSummary', 'partialEffect', 'partialEffectSummary', 'evidenceBundle'];
const PAGE_DATASETS = Object.freeze({
    overview: ['evidenceBundle'],
    importance: ['global', 'byCluster'],
    dependence: ['dependence'],
    partial: ['partialEffect', 'partialEffectSummary'],
    heterogeneity: ['byCluster', 'dependenceSummary'],
    region: ['evidenceBundle'],
});
const DATA_STATUS = Object.fromEntries([...DATASET_KEYS, 'manifest'].map(key => [key, { status: 'idle', error: null, promise: null }]));

function localizedText(key, fallback, values = {}) {
    try { const translated = t(key, values); if (translated && translated !== key) return translated; } catch (error) { /* safe fallback */ }
    return String(fallback).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}
function localizedLabel(namespace, code, fallback) {
    try { const translated = label(namespace, code); if (translated && translated !== code) return translated; } catch (error) { /* safe fallback */ }
    return fallback || code;
}
function createLocalizedLabels(namespace, fallbacks) {
    return new Proxy(fallbacks, {
        get(target, property) { return typeof property === 'string' ? localizedLabel(namespace, property, target[property]) : Reflect.get(target, property); },
        has(target, property) { return Reflect.has(target, property); },
        ownKeys(target) { return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor(target, property) { return Object.getOwnPropertyDescriptor(target, property); },
    });
}
function evidenceKey(wetland, cluster) { return `${wetland}::${cluster}`; }
function replaceContents(target, values) { target.splice(0, target.length, ...values); }
function syncDimensions(bundle) {
    const enumerations = bundle?.enumerations || {};
    if (Array.isArray(enumerations.wetlands) && enumerations.wetlands.length) replaceContents(WETLAND_TYPES, enumerations.wetlands);
    if (Array.isArray(enumerations.clusters) && enumerations.clusters.length) replaceContents(CLUSTERS, enumerations.clusters);
    if (Array.isArray(enumerations.drivers) && enumerations.drivers.length) replaceContents(FEATURES, enumerations.drivers);
}

function indexEvidenceBundle(bundle) {
    if (!bundle || bundle.schema_version !== '1.0.0') throw new Error('Unsupported evidence bundle schema');
    const wetlands = bundle.enumerations?.wetlands || [];
    const clusters = bundle.enumerations?.clusters || [];
    const summaries = Array.isArray(bundle.cluster_summary) ? bundle.cluster_summary : [];
    const units = Array.isArray(bundle.unit_evidence) ? bundle.unit_evidence : [];
    if (!wetlands.length || !clusters.length || summaries.length !== wetlands.length * clusters.length) throw new Error('Evidence matrix cardinality mismatch');

    const summaryByKey = new Map();
    summaries.forEach(item => {
        const key = evidenceKey(item.wetland_code, item.cluster_code);
        if (summaryByKey.has(key)) throw new Error(`Duplicate evidence key: ${key}`);
        summaryByKey.set(key, item);
    });
    if (summaryByKey.size !== wetlands.length * clusters.length) throw new Error('Evidence matrix is incomplete');

    const unitByKey = new Map();
    const unitsByCluster = new Map();
    const unitsByKey = new Map();
    units.forEach(item => {
        const unitKey = `${item.cluster_code}::${item.city}::${item.wetland_code}`;
        if (unitByKey.has(unitKey)) throw new Error(`Duplicate unit evidence key: ${unitKey}`);
        unitByKey.set(unitKey, item);
        const key = evidenceKey(item.wetland_code, item.cluster_code);
        if (!unitsByKey.has(key)) unitsByKey.set(key, []);
        unitsByKey.get(key).push(item);
        if (!unitsByCluster.has(item.cluster_code)) unitsByCluster.set(item.cluster_code, []);
        unitsByCluster.get(item.cluster_code).push(item);
    });
    unitsByCluster.forEach(items => items.sort((a, b) => String(a.city).localeCompare(String(b.city), getLocale())));

    bundle._summaryByKey = summaryByKey;
    bundle._unitsByKey = unitsByKey;
    bundle._unitsByCluster = unitsByCluster;
    bundle._unitByKey = unitByKey;
    bundle._flagsByEntity = new Map();
    (bundle.quality_flags || []).forEach(flag => {
        const entity = flag.entity || '';
        if (!bundle._flagsByEntity.has(entity)) bundle._flagsByEntity.set(entity, []);
        bundle._flagsByEntity.get(entity).push(flag);
    });
    bundle._flagsById = new Map((bundle.quality_flags || []).map(flag => [flag.flag_id, flag]));
    bundle._modelsByKey = new Map();
    (bundle.model_evidence || []).forEach(item => {
        const key = evidenceKey(item.wetland_code, item.cluster_code);
        if (!bundle._modelsByKey.has(key)) bundle._modelsByKey.set(key, []);
        bundle._modelsByKey.get(key).push(item);
    });
    syncDimensions(bundle);
    return bundle;
}
function getEvidenceSummary(wetland, cluster) { return DATA.evidenceBundle?._summaryByKey?.get(evidenceKey(wetland, cluster)) || null; }
function getEvidenceModels(wetland, cluster) { return DATA.evidenceBundle?._modelsByKey?.get(evidenceKey(wetland, cluster)) || []; }
function formatEvidenceRate(metrics) {
    if (metrics?.relative_change_status === 'undefined_zero_start' || metrics?.relative_change_rate === null || metrics?.relative_change_rate === undefined) return localizedText('common.zeroStart', 'Not computable: start value is 0');
    return formatLocalizedPercent(Number(metrics.relative_change_rate), 1);
}
function formatEvidenceNumber(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return localizedText('common.notComputable', 'Not computable');
    return formatLocalizedNumber(Number(value), digits);
}

const WETLAND_TYPES = ['Mangrove', 'Tidal_Flat', 'Salt_Marsh', 'Marsh'];
const WETLAND_LABELS = createLocalizedLabels('wetland', { Mangrove: 'Mangrove', Tidal_Flat: 'Tidal Flat', Salt_Marsh: 'Salt Marsh', Marsh: 'Marsh' });
const CLUSTERS = ['BBG', 'BYS', 'HX', 'PRD', 'YRD'];
const CLUSTER_LABELS = createLocalizedLabels('cluster', { BBG: 'Beibu Gulf', BYS: 'Bohai Sea', HX: 'West Coast of Taiwan Strait', PRD: 'Pearl River Delta', YRD: 'Yangtze River Delta' });
const PRODUCT_WETLAND_LABELS = WETLAND_LABELS;
const PRODUCT_CLUSTER_LABELS = CLUSTER_LABELS;
const FEATURES = ['Temp_Mean_C', 'Precip_Sum_mm', 'Evap_Sum_mm', 'MODIS_Urban_Area_sqkm', 'Impervious_sqkm', 'Unified_NTL_Index', 'GDP_per_capita', 'Secondary_GDP_Share', 'Total_Population', 'Pop_Density', 'Cropland_sqkm'];
const FEATURE_LABELS = createLocalizedLabels('feature', {
    Temp_Mean_C: 'Mean Temperature', Precip_Sum_mm: 'Precipitation', Evap_Sum_mm: 'Evaporation',
    MODIS_Urban_Area_sqkm: 'Urban Area', Impervious_sqkm: 'Impervious Surface', Unified_NTL_Index: 'Nighttime Light',
    GDP_per_capita: 'GDP per Capita', Secondary_GDP_Share: 'Secondary Industry Share', Total_Population: 'Total Population',
    Pop_Density: 'Population Density', Cropland_sqkm: 'Cropland Area',
});
const FEATURE_GROUPS = {
    Climate: ['Temp_Mean_C', 'Precip_Sum_mm', 'Evap_Sum_mm'],
    Urbanization: ['MODIS_Urban_Area_sqkm', 'Impervious_sqkm', 'Unified_NTL_Index'],
    Economy: ['GDP_per_capita', 'Secondary_GDP_Share'],
    Population: ['Total_Population', 'Pop_Density'], Agriculture: ['Cropland_sqkm'],
};
const FEAT_TO_GROUP = {};
for (const [group, features] of Object.entries(FEATURE_GROUPS)) for (const feature of features) FEAT_TO_GROUP[feature] = group;
const GROUP_COLORS = { Climate: '#e41a1c', Urbanization: '#377eb8', Economy: '#4daf4a', Population: '#984ea3', Agriculture: '#ff7f00' };
const CLUSTER_COLORS = { BBG: '#e41a1c', BYS: '#377eb8', HX: '#4daf4a', PRD: '#984ea3', YRD: '#ff7f00' };

function setStatus(key, status, error = null) { DATA_STATUS[key].status = status; DATA_STATUS[key].error = error; }
function validateManifest(manifest) {
    if (!manifest || manifest.schema_version !== '1.0.0' || !manifest.datasets) throw new Error('Invalid data manifest');
    for (const key of DATASET_KEYS) if (!manifest.datasets[key]?.file) throw new Error(`Manifest missing dataset: ${key}`);
    return manifest;
}
async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return response.json();
}
async function loadManifest() {
    const state = DATA_STATUS.manifest;
    if (state.status === 'loaded') return DATA.manifest;
    if (state.promise) return state.promise;
    state.promise = (async () => {
        setStatus('manifest', 'loading');
        try { DATA.manifest = validateManifest(await fetchJson(MANIFEST_URL)); setStatus('manifest', 'loaded'); return DATA.manifest; }
        catch (error) { setStatus('manifest', 'error', error); throw error; }
        finally { state.promise = null; }
    })();
    return state.promise;
}
function validateDatasetShape(key, payload) {
    const arrayDataset = key === 'dependenceSummary' || key === 'partialEffectSummary';
    if (arrayDataset) {
        if (!Array.isArray(payload)) throw new Error(`Invalid dataset shape: ${key}`);
        return payload;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(`Invalid dataset shape: ${key}`);
    const required = { global: ['cv_results', 'shap_importance'], byCluster: ['cv_results', 'shap_importance', 'top3_features'] }[key] || [];
    required.forEach(field => { if (!(field in payload)) throw new Error(`${key} is missing ${field}`); });
    if (key === 'global' || key === 'byCluster') {
        if (!Array.isArray(payload.cv_results)) throw new Error(`${key}.cv_results must be an array`);
        if (!payload.shap_importance || typeof payload.shap_importance !== 'object') throw new Error(`${key}.shap_importance must be an object`);
    }
    if (key === 'dependence' || key === 'partialEffect') {
        if (!Object.keys(payload).length) throw new Error(`${key} is empty`);
    }
    return payload;
}
async function loadDataset(key) {
    const state = DATA_STATUS[key];
    if (!state) throw new Error(`Unknown dataset: ${key}`);
    if (state.status === 'loaded') return DATA[key];
    if (state.status === 'error') { state.status = 'idle'; state.error = null; }
    if (state.promise) return state.promise;
    state.promise = (async () => {
        setStatus(key, 'loading');
        try {
            const manifest = await loadManifest();
            const entry = manifest.datasets[key];
            const payload = await fetchJson(`./data/${entry.file}?v=${encodeURIComponent(manifest.release_id || DATA_CACHE_VERSION)}`);
            if (key === 'evidenceBundle' && manifest.bundle_id && payload.bundle_id !== manifest.bundle_id) throw new Error('Evidence bundle does not match manifest bundle_id');
            DATA[key] = key === 'evidenceBundle' ? indexEvidenceBundle(payload) : validateDatasetShape(key, payload);
            setStatus(key, 'loaded'); return DATA[key];
        } catch (error) { setStatus(key, 'error', error); if (key === 'evidenceBundle') DATA.evidenceError = error; throw error; }
        finally { state.promise = null; }
    })();
    return state.promise;
}
async function ensureData(keys = []) {
    const results = await Promise.allSettled([...new Set(keys)].map(loadDataset));
    DATA.loaded = DATA_STATUS.evidenceBundle.status === 'loaded';
    return results.every(result => result.status === 'fulfilled');
}
function getDatasetState(key) { return DATA_STATUS[key] || { status: 'unknown', error: null }; }
function getDatasetError(key) { return getDatasetState(key).error; }
function getPageDatasets(pageName) { return PAGE_DATASETS[pageName] || []; }
async function loadAllData() {
    try { await loadManifest(); await ensureData(['evidenceBundle']); }
    catch (error) { DATA.loaded = false; DATA.evidenceError = error; }
    console.log('Dashboard data state.', Object.fromEntries(Object.entries(DATA_STATUS).map(([key, state]) => [key, state.status])));
}
