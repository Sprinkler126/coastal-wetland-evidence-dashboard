import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = filename => fs.readFileSync(path.join(root, 'web', 'web', filename), 'utf8');
const appSource = read('js/app.js');
const chartsSource = read('js/charts.js');

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add(value) { values.add(value); },
        remove(value) { values.delete(value); },
        contains(value) { return values.has(value); },
    };
}

const pageNames = ['overview', 'methods', 'importance', 'dependence', 'partial', 'heterogeneity', 'region'];
const pages = pageNames.map((name, index) => ({ id: `page-${name}`, classList: createClassList(index === 0 ? ['active'] : []) }));
const tabs = pageNames.map((name, index) => ({ name, classList: createClassList(index === 0 ? ['active'] : []) }));
const containerIds = [
    'chart-partial', 'chart-elasticity', 'chart-het-radar', 'chart-het-group',
    'het-top3-table', 'chart-het-dep',
];
const containers = new Map(containerIds.map(id => [id, { id, innerHTML: `<canvas data-chart="${id}"></canvas>` }]));
const qualityContainer = { id: 'overview-quality', innerHTML: '' };
const matrixContainer = { id: 'evidence-matrix', innerHTML: '' };
const elements = new Map([...pages.map(page => [page.id, page]), ...containers, [qualityContainer.id, qualityContainer], [matrixContainer.id, matrixContainer]]);
const datasetStates = new Map([
    ['partialEffect', { status: 'loaded' }],
    ['partialEffectSummary', { status: 'loaded' }],
    ['byCluster', { status: 'loaded' }],
    ['dependenceSummary', { status: 'loaded' }],
]);
const pageDatasets = {
    partial: ['partialEffect', 'partialEffectSummary'],
    heterogeneity: ['byCluster', 'dependenceSummary'],
};
let ensureCalls = 0;
let pendingResolve = null;
const rendered = [];

const document = {
    body: { classList: createClassList() },
    addEventListener() {},
    getElementById(id) { return elements.get(id) || null; },
    querySelector(selector) {
        if (selector === '.page.active') return pages.find(page => page.classList.contains('active')) || null;
        return null;
    },
    querySelectorAll(selector) {
        if (selector === '.page') return pages;
        if (selector === '.nav-tab') return tabs;
        if (selector === '.page.active .chart-container') return [];
        return [];
    },
};
const window = { addEventListener() {}, echarts: null };
const context = vm.createContext({
    window, document, console,
    WETLAND_TYPES: ['Mangrove', 'Saltmarsh', 'Seagrass', 'TidalFlat'],
    WETLAND_LABELS: { Mangrove: 'Mangrove', Saltmarsh: 'Saltmarsh', Seagrass: 'Seagrass', TidalFlat: 'Tidal flat' },
    CLUSTERS: ['BYS', 'YRD', 'WTS', 'PRD', 'BG'],
    CLUSTER_LABELS: { BYS: 'Bohai Sea', YRD: 'Yangtze River Delta', WTS: 'West Taiwan Strait', PRD: 'Pearl River Delta', BG: 'Beibu Gulf' },
    getPageDatasets: pageName => pageDatasets[pageName] || [],
    getDatasetState: key => datasetStates.get(key) || { status: 'loaded' },
    ensureData(keys) {
        ensureCalls += 1;
        return new Promise(resolve => {
            pendingResolve = () => {
                keys.forEach(key => { datasetStates.get(key).status = 'loaded'; });
                resolve(true);
            };
        });
    },
    localizedText: (_key, fallback) => fallback,
    escapeHtml: value => String(value),
    formatEvidenceNumber: value => String(value),
    DATA: {
        evidenceBundle: {
            contract_id: 'coastal-wetland-evidence-contract',
            contract_version: '1.0.0',
            bundle_id: 'bundle-test-id',
            cluster_summary: [
                ...Array.from({ length: 7 }, (_, index) => ({ wetland: index === 0 ? 'Mangrove' : 'Saltmarsh', cluster: index === 0 ? 'BYS' : 'YRD', risk_matrix: { Category: 'High', Cell_Label: 'Multiple pressure' }, trend: { metrics: { direction: 'decrease' } } })),
                ...Array.from({ length: 9 }, () => ({ risk_matrix: { Category: 'Medium' } })),
                { risk_matrix: { Category: 'Decoupling' } },
                ...Array.from({ length: 3 }, () => ({ risk_matrix: { Category: 'Insufficient' } })),
            ],
            quality_flags: Array.from({ length: 187 }, (_, index) => ({ id: index })),
        },
    },
    setTimeout,
    requestAnimationFrame: callback => callback(),
});
vm.runInContext(`${appSource}\nrenderPageContent = pageName => __rendered.push(pageName); resizeActiveCharts = () => {}; getEvidenceSummary = (wetland, cluster) => DATA.evidenceBundle.cluster_summary.find(item => item.wetland === wetland && item.cluster === cluster) || {}; this.__showPage = showPage; this.__renderOverviewMatrix = renderOverviewMatrix; this.__renderOverviewQuality = renderOverviewQuality; this.__renderEvidenceProvenance = renderEvidenceProvenance; this.__screeningCellLabel = screeningCellLabel; this.__evidenceSupportGradeDisplay = evidenceSupportGradeDisplay;`, context);
context.__rendered = rendered;

const provenanceHtml = context.__renderEvidenceProvenance({
    scale: 'spatial_unit',
    method: 'deterministic endpoint change and centered OLS slope',
    period: { label: '2001–2022' },
    source: { path: 'evidence/data/historical/unit_trends.csv', sha256: 'abc123' },
});
const [provenanceSummary, provenanceTechnical] = provenanceHtml.split('<details');
assert.match(provenanceSummary, /Data basis and interpretation/);
assert.match(provenanceSummary, /2001–2022 authoritative panel/);
assert.match(provenanceSummary, /Endpoint change \+ centered OLS annual trend/);
assert.doesNotMatch(provenanceSummary, /unit_trends\.csv|abc123|coastal-wetland-evidence-contract|bundle-test-id/, 'technical identifiers stay out of the reader-facing summary');
assert.match(provenanceTechnical, /unit_trends\.csv/);
assert.match(provenanceTechnical, /abc123/);
assert.match(provenanceTechnical, /coastal-wetland-evidence-contract/);
assert.match(provenanceTechnical, /bundle-test-id/);
const overviewDrawerSource = appSource.slice(appSource.indexOf('function renderEvidenceDrawer'), appSource.indexOf('function openEvidenceDrawer'));
const unitDrawerSource = appSource.slice(appSource.indexOf('function renderUnitEvidenceCard'), appSource.indexOf('function openUnitEvidenceCard'));
assert.match(overviewDrawerSource, /renderEvidenceProvenance\(trend\)/, 'the overview drawer uses the shared progressive-disclosure trace');
assert.match(unitDrawerSource, /renderEvidenceProvenance\(evidence\)/, 'the unit drawer uses the shared progressive-disclosure trace');
assert.doesNotMatch(`${overviewDrawerSource}${unitDrawerSource}`, /source\?\.path|source\?\.sha256|unit\.contract/, 'drawers do not place raw technical identifiers directly in their main content');

context.__renderOverviewMatrix();
assert.match(matrixContainer.innerHTML, /class="screening-matrix-table"/, 'overview renders the synthesis as a table');
assert.equal((matrixContainer.innerHTML.match(/class="matrix-cell /g) || []).length, 20, 'the complete 4 × 5 matrix renders');
assert.match(matrixContainer.innerHTML, /Mangrove/);
assert.match(matrixContainer.innerHTML, /Bohai Sea/);
assert.match(matrixContainer.innerHTML, /Multiple pressure/);

context.__renderOverviewQuality();
assert.match(qualityContainer.innerHTML, /class="quality-distribution-card"/, 'quality summary uses a dedicated distribution card');
assert.match(qualityContainer.innerHTML, /class="quality-flags-card"/, 'quality flags use a separate metric card');
assert.match(qualityContainer.innerHTML, /class="quality-boundary-card"/, 'the interpretation boundary spans its own explanatory card');
assert.equal((qualityContainer.innerHTML.match(/class="quality-category /g) || []).length, 4, 'all four evidence-matrix categories render separately');
for (const value of ['7', '9', '1', '3', '187']) assert.match(qualityContainer.innerHTML, new RegExp(`>${value}<`));
assert.match(qualityContainer.innerHTML, /not a future-risk probability/, 'the model boundary is explanatory text, not the section title');
assert.equal(context.__screeningCellLabel('Multiple pressure'), 'Multiple pressure');
assert.equal(context.__evidenceSupportGradeDisplay('weak direct quantitative support').label, 'Weak direct quantitative support');
assert.match(context.__evidenceSupportGradeDisplay('weak direct quantitative support').note, /does not mean low priority or low risk/);

for (let index = 0; index < 12; index += 1) {
    context.__showPage(index % 2 === 0 ? 'partial' : 'heterogeneity');
}
assert.equal(ensureCalls, 0, 'loaded pages do not start redundant data requests');
for (const id of containerIds) {
    assert.match(containers.get(id).innerHTML, /<canvas/, `${id} keeps its initialized chart DOM`);
}

datasetStates.get('partialEffect').status = 'idle';
datasetStates.get('partialEffectSummary').status = 'idle';
const partialRenderCount = rendered.filter(page => page === 'partial').length;
context.__showPage('partial');
assert.equal(ensureCalls, 1);
assert.match(containers.get('chart-partial').innerHTML, /class="loading"/);
context.__showPage('heterogeneity');
pendingResolve();
await new Promise(resolve => setImmediate(resolve));
assert.equal(rendered.filter(page => page === 'partial').length, partialRenderCount, 'an inactive page ignores a stale load completion');

containers.get('chart-partial').innerHTML = '<canvas data-chart="chart-partial"></canvas>';
containers.get('chart-elasticity').innerHTML = '<canvas data-chart="chart-elasticity"></canvas>';
context.__showPage('partial');
assert.match(containers.get('chart-partial').innerHTML, /<canvas/, 'returning to a loaded page does not replace its chart with a loading state');

let disposed = false;
let initCalls = 0;
const staleChart = { dispose() { disposed = true; } };
const chartDom = {
    id: 'chart-partial',
    innerHTML: '<div class="loading">Loading</div>',
    querySelector(selector) { return selector === 'canvas, svg' ? null : null; },
};
const chartWindow = {
    addEventListener() {},
    echarts: {
        getInstanceByDom() { return staleChart; },
        init() { initCalls += 1; return {}; },
    },
};
const chartContext = vm.createContext({
    window: chartWindow,
    document: { getElementById() { return chartDom; } },
    console,
    ResizeObserver: undefined,
    Intl,
});
vm.runInContext(`${chartsSource}\nthis.__initChart = initChart; this.__verticalNumericAxis = verticalNumericAxis;`, chartContext);
chartContext.__initChart('chart-partial');
assert.equal(disposed, true, 'a chart instance without a canvas is disposed');
assert.equal(initCalls, 1, 'a stale chart instance is reinitialized');
assert.equal(chartDom.innerHTML, '');

const dependenceYAxis = chartContext.__verticalNumericAxis('SHAP value', 4);
assert.equal(dependenceYAxis.nameLocation, 'middle');
assert.equal(dependenceYAxis.nameRotate, 90);
assert.ok(dependenceYAxis.nameGap >= 56, 'vertical-axis title reserves enough room for the full label');
const dependenceSource = chartsSource.slice(chartsSource.indexOf('function renderDependence'), chartsSource.indexOf('// Partial-effect page'));
assert.equal((dependenceSource.match(/yAxis: verticalNumericAxis/g) || []).length, 2, 'both dependence modes use the unclipped vertical-axis title layout');
assert.equal((dependenceSource.match(/grid: \{ left: 88/g) || []).length, 2, 'both dependence modes reserve the wider left margin');

const partialEffectSource = chartsSource.slice(chartsSource.indexOf('function renderPartialEffect'), chartsSource.indexOf('function renderElasticityHeatmap'));
assert.equal((partialEffectSource.match(/yAxis: verticalNumericAxis/g) || []).length, 2, 'both partial-effect modes use the unclipped vertical-axis title layout');
assert.equal((partialEffectSource.match(/grid: \{ left: 88/g) || []).length, 2, 'both partial-effect modes reserve the wider left margin');

console.log('page navigation runtime tests passed');
