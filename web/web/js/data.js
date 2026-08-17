/**
 * data.js — data loading, shared constants, and locale-aware formatters.
 */

const DATA = {
    global: null,
    byCluster: null,
    dependence: null,
    dependenceSummary: null,
    partialEffect: null,
    partialEffectSummary: null,
    evidenceBundle: null,
    evidenceError: null,
    aiInputs: null,
    aiInputError: null,
    legacyLoaded: false,
    legacyErrors: [],
    loaded: false,
};

const DATA_CACHE_VERSION = 'figure14-v2';
const EVIDENCE_BUNDLE_URL = `./data/evidence_bundle.json?v=${DATA_CACHE_VERSION}`;
const DAY07_AI_INPUT_URL = `./data/ai_explanation_inputs.json?v=${DATA_CACHE_VERSION}`;
const EVIDENCE_TYPES = ['ASSOCIATION', 'EXPLORATORY', 'FACT', 'INSUFFICIENT', 'MODEL_ATTRIBUTION'];

function localizedText(key, fallback, values = {}) {
    try {
        const translated = t(key, values);
        if (translated && translated !== key) return translated;
    } catch (error) {
        // The supplied i18n layer is expected to load first; retain a safe fallback for isolated use.
    }
    return String(fallback).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

function localizedLabel(namespace, code, fallback) {
    try {
        const translated = label(namespace, code);
        if (translated && translated !== code) return translated;
    } catch (error) {
        // The supplied i18n layer is expected to load first; retain a safe fallback for isolated use.
    }
    return fallback || code;
}

function createLocalizedLabels(namespace, fallbacks) {
    return new Proxy(fallbacks, {
        get(target, property) {
            if (typeof property !== 'string') return Reflect.get(target, property);
            return localizedLabel(namespace, property, target[property]);
        },
        has(target, property) { return Reflect.has(target, property); },
        ownKeys(target) { return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor(target, property) { return Object.getOwnPropertyDescriptor(target, property); },
    });
}

function evidenceKey(wetland, cluster) { return `${wetland}::${cluster}`; }

function indexEvidenceBundle(bundle) {
    if (!bundle || bundle.schema_version !== '1.0.0') throw new Error('Unsupported evidence bundle schema');
    const wetlands = bundle.enumerations?.wetlands || [];
    const clusters = bundle.enumerations?.clusters || [];
    if (wetlands.length !== 4 || clusters.length !== 5 || bundle.cluster_summary?.length !== 20 || bundle.unit_evidence?.length !== 212) {
        throw new Error('Evidence bundle cardinality mismatch');
    }
    const summaryByKey = new Map();
    bundle.cluster_summary.forEach(item => {
        const key = evidenceKey(item.wetland_code, item.cluster_code);
        if (summaryByKey.has(key)) throw new Error(`Duplicate evidence key: ${key}`);
        summaryByKey.set(key, item);
    });
    if (summaryByKey.size !== wetlands.length * clusters.length) throw new Error('Evidence matrix is incomplete');
    bundle._summaryByKey = summaryByKey;
    bundle._unitsByKey = new Map();
    bundle._unitsByCluster = new Map();
    bundle._unitByKey = new Map();
    bundle.unit_evidence.forEach(item => {
        const key = evidenceKey(item.wetland_code, item.cluster_code);
        if (!bundle._unitsByKey.has(key)) bundle._unitsByKey.set(key, []);
        bundle._unitsByKey.get(key).push(item);
        if (!bundle._unitsByCluster.has(item.cluster_code)) bundle._unitsByCluster.set(item.cluster_code, []);
        bundle._unitsByCluster.get(item.cluster_code).push(item);
        bundle._unitByKey.set(`${item.cluster_code}::${item.city}::${item.wetland_code}`, item);
    });
    bundle._unitsByCluster.forEach(items => items.sort((a, b) => a.city.localeCompare(b.city, getLocale())));
    bundle._flagsByEntity = new Map();
    (bundle.quality_flags || []).forEach(flag => {
        const entity = flag.entity || '';
        if (!bundle._flagsByEntity.has(entity)) bundle._flagsByEntity.set(entity, []);
        bundle._flagsByEntity.get(entity).push(flag);
    });
    bundle._modelsByKey = new Map();
    bundle.model_evidence.forEach(item => {
        const key = evidenceKey(item.wetland_code, item.cluster_code);
        if (!bundle._modelsByKey.has(key)) bundle._modelsByKey.set(key, []);
        bundle._modelsByKey.get(key).push(item);
    });
    bundle._flagsById = new Map((bundle.quality_flags || []).map(flag => [flag.flag_id, flag]));
    return bundle;
}

function getEvidenceSummary(wetland, cluster) {
    return DATA.evidenceBundle?._summaryByKey?.get(evidenceKey(wetland, cluster)) || null;
}

function getEvidenceModels(wetland, cluster) {
    return DATA.evidenceBundle?._modelsByKey?.get(evidenceKey(wetland, cluster)) || [];
}

function indexAiInputs(payload) {
    if (!payload || payload.schema_version !== '1.0.0') throw new Error('Unsupported Day 7 AI input schema');
    if (payload.contract_id !== 'wetland-ai-day01-evidence-contract') throw new Error('Day 7 contract mismatch');
    if (!Array.isArray(payload.audience_modes) || !['public', 'ngo_internal', 'funder'].every(mode => payload.audience_modes.includes(mode))) throw new Error('Day 7 audience modes incomplete');
    if (!Array.isArray(payload.input_packets) || !payload.input_packets.length) throw new Error('Day 7 input packets missing');
    if (DATA.evidenceBundle && payload.bundle_id !== DATA.evidenceBundle.bundle_id) throw new Error('Day 7 bundle_id does not match Day 3 evidence bundle');
    payload._packetById = new Map();
    payload._packetsByScope = new Map();
    payload.input_packets.forEach(packet => {
        if (!packet.input_id) throw new Error('Day 7 input packet is missing input_id');
        if (payload._packetById.has(packet.input_id)) throw new Error(`Duplicate Day 7 input_id: ${packet.input_id}`);
        payload._packetById.set(packet.input_id, packet);
        const scope = packet.scope || {};
        const key = `${scope.cluster_code || ''}::${scope.compare_cluster_code || ''}::${scope.unit_code || ''}::${scope.wetland_code || ''}::${packet.question_intent || ''}`;
        if (!payload._packetsByScope.has(key)) payload._packetsByScope.set(key, []);
        payload._packetsByScope.get(key).push(packet);
    });
    return payload;
}

function getAiPacketByScope(cluster, wetland, unit = null) {
    const packets = DATA.aiInputs?.input_packets || [];
    return packets.find(packet => {
        const scope = packet.scope || {};
        return scope.cluster_code === cluster && scope.wetland_code === wetland && (unit ? scope.unit_code === unit : !scope.compare_cluster_code && !scope.unit_code);
    }) || null;
}

function getAiComparisonPacket(wetland, clusterA = 'BYS', clusterB = 'BBG') {
    const packets = DATA.aiInputs?.input_packets || [];
    return packets.find(packet => {
        const scope = packet.scope || {};
        return packet.question_intent === 'compare_regions' && scope.cluster_code === clusterA && scope.compare_cluster_code === clusterB && scope.wetland_code === wetland;
    }) || null;
}

function getAiQuestionTemplates() {
    return DATA.aiInputs?.question_templates || [];
}

function formatEvidenceRate(metrics) {
    if (metrics?.relative_change_status === 'undefined_zero_start' || metrics?.relative_change_rate === null || metrics?.relative_change_rate === undefined) {
        return localizedText('common.zeroStart', 'Not computable: start value is 0');
    }
    return formatLocalizedPercent(Number(metrics.relative_change_rate), 1);
}

function formatEvidenceNumber(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return localizedText('common.notComputable', 'Not computable');
    return formatLocalizedNumber(Number(value), digits);
}

const WETLAND_TYPES = ['Mangrove', 'Tidal_Flat', 'Salt_Marsh', 'Marsh'];
const WETLAND_LABELS = createLocalizedLabels('wetland', {
    Mangrove: 'Mangrove',
    Tidal_Flat: 'Tidal Flat',
    Salt_Marsh: 'Salt Marsh',
    Marsh: 'Marsh',
});

const CLUSTERS = ['BBG', 'BYS', 'HX', 'PRD', 'YRD'];
const CLUSTER_LABELS = createLocalizedLabels('cluster', {
    BBG: 'Beibu Gulf',
    BYS: 'Bohai Sea',
    HX: 'West Coast of Taiwan Strait',
    PRD: 'Pearl River Delta',
    YRD: 'Yangtze River Delta',
});

/* Product pages and charts share these single, locale-aware label sources. */
const PRODUCT_WETLAND_LABELS = WETLAND_LABELS;
const PRODUCT_CLUSTER_LABELS = CLUSTER_LABELS;

const FEATURES = [
    'Temp_Mean_C',
    'Precip_Sum_mm',
    'Evap_Sum_mm',
    'MODIS_Urban_Area_sqkm',
    'Impervious_sqkm',
    'Unified_NTL_Index',
    'GDP_per_capita',
    'Secondary_GDP_Share',
    'Total_Population',
    'Pop_Density',
    'Cropland_sqkm',
];

const FEATURE_LABELS = createLocalizedLabels('feature', {
    Temp_Mean_C: 'Mean Temperature',
    Precip_Sum_mm: 'Precipitation',
    Evap_Sum_mm: 'Evaporation',
    MODIS_Urban_Area_sqkm: 'Urban Area',
    Impervious_sqkm: 'Impervious Surface',
    Unified_NTL_Index: 'Nighttime Light',
    GDP_per_capita: 'GDP per Capita',
    Secondary_GDP_Share: 'Secondary Industry Share',
    Total_Population: 'Total Population',
    Pop_Density: 'Population Density',
    Cropland_sqkm: 'Cropland Area',
});

const FEATURE_GROUPS = {
    Climate: ['Temp_Mean_C', 'Precip_Sum_mm', 'Evap_Sum_mm'],
    Urbanization: ['MODIS_Urban_Area_sqkm', 'Impervious_sqkm', 'Unified_NTL_Index'],
    Economy: ['GDP_per_capita', 'Secondary_GDP_Share'],
    Population: ['Total_Population', 'Pop_Density'],
    Agriculture: ['Cropland_sqkm'],
};

const FEAT_TO_GROUP = {};
for (const [group, features] of Object.entries(FEATURE_GROUPS)) {
    for (const feature of features) FEAT_TO_GROUP[feature] = group;
}

const GROUP_COLORS = {
    Climate: '#e41a1c',
    Urbanization: '#377eb8',
    Economy: '#4daf4a',
    Population: '#984ea3',
    Agriculture: '#ff7f00',
};
const CLUSTER_COLORS = { BBG: '#e41a1c', BYS: '#377eb8', HX: '#4daf4a', PRD: '#984ea3', YRD: '#ff7f00' };

async function loadAllData() {
    const base = './data';
    const files = [
        { key: 'global', url: `${base}/global.json` },
        { key: 'byCluster', url: `${base}/by_cluster.json` },
        { key: 'dependence', url: `${base}/dependence.json` },
        { key: 'dependenceSummary', url: `${base}/dependence_summary.json` },
        { key: 'partialEffect', url: `${base}/partial_effect.json` },
        { key: 'partialEffectSummary', url: `${base}/partial_effect_summary.json` },
    ];
    const legacyLoads = files.map(async ({ key, url }) => {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`${url} returned HTTP ${resp.status}`);
        DATA[key] = await resp.json();
    });
    try {
        const evidenceResp = await fetch(EVIDENCE_BUNDLE_URL);
        if (!evidenceResp.ok) throw new Error(`${EVIDENCE_BUNDLE_URL} returned HTTP ${evidenceResp.status}`);
        DATA.evidenceBundle = indexEvidenceBundle(await evidenceResp.json());
    } catch (error) {
        DATA.evidenceError = error;
        console.error('Evidence navigation unavailable:', error);
    }
    try {
        const aiResp = await fetch(DAY07_AI_INPUT_URL);
        if (!aiResp.ok) throw new Error(`${DAY07_AI_INPUT_URL} returned HTTP ${aiResp.status}`);
        DATA.aiInputs = indexAiInputs(await aiResp.json());
    } catch (error) {
        DATA.aiInputError = error;
        console.error('AI explanation inputs unavailable:', error);
    }
    const results = await Promise.allSettled(legacyLoads);
    DATA.legacyErrors = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason?.message || String(result.reason));
    DATA.legacyLoaded = DATA.legacyErrors.length === 0;
    if (!DATA.legacyLoaded) console.warn('Some legacy dashboard data failed to load:', DATA.legacyErrors);
    DATA.loaded = Boolean(DATA.legacyLoaded || DATA.evidenceBundle || DATA.aiInputs);
    console.log('Dashboard data loaded.', { legacyLoaded: DATA.legacyLoaded, evidenceLoaded: Boolean(DATA.evidenceBundle), aiLoaded: Boolean(DATA.aiInputs) });
}
