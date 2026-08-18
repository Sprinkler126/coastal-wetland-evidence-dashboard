/**
 * app.js — page switching, locale-aware dynamic rendering, and controls.
 */

function msg(key, fallback, values = {}) {
    return localizedText(key, fallback, values);
}

function html(value) {
    return escapeHtml(value ?? '');
}

function dynamicText(value) {
    return html(value).replace(/&amp;(?!#\d+;|#x[\da-f]+;|\w+;)/gi, '&');
}

function activePageName() {
    return document.querySelector('.page.active')?.id?.replace(/^page-/, '') || 'overview';
}

const PAGE_RENDER_CONTAINERS = Object.freeze({
    overview: ['evidence-matrix'],
    importance: ['chart-imp-heatmap', 'chart-imp-bar'],
    dependence: ['chart-dependence'],
    partial: ['chart-partial', 'chart-elasticity'],
    heterogeneity: ['chart-het-radar', 'chart-het-group', 'het-top3-table', 'chart-het-dep'],
    region: ['region-comparison', 'region-units', 'region-heatmap'],
});

function renderPageContent(pageName) {
    const required = getPageDatasets(pageName);
    if (required.some(key => getDatasetState(key).status !== 'loaded')) {
        renderPageUnavailable(pageName, required);
        return;
    }
    if (pageName === 'overview') { renderOverview(); window._overviewRendered = true; }
    if (pageName === 'importance') { updateImportance(); window._importanceRendered = true; }
    if (pageName === 'dependence') { updateDependence(); window._dependenceRendered = true; }
    if (pageName === 'partial') { updatePartial(); window._partialRendered = true; }
    if (pageName === 'heterogeneity') { updateHeterogeneity(); window._hetRendered = true; }
    if (pageName === 'region') renderRegionPage();
}

function renderPageUnavailable(pageName, datasetKeys) {
    (PAGE_RENDER_CONTAINERS[pageName] || []).forEach(id => renderDatasetUnavailable(document.getElementById(id), datasetKeys));
}

function renderDatasetUnavailable(container, datasetKeys) {
    if (!container) return;
    const details = datasetKeys.map(key => {
        const error = getDatasetError(key);
        return `${key}: ${error?.message || msg('common.unavailable', 'Unavailable')}`;
    }).join(' · ');
    container.innerHTML = `<div class="loading error-state" role="status"><strong>${html(msg('data.unavailableTitle', 'This section is unavailable'))}</strong><p>${html(details)}</p><button class="secondary-action" type="button" onclick="retryPageData('${html(activePageName())}')">${html(msg('data.retry', 'Retry'))}</button></div>`;
}

async function retryPageData(pageName = activePageName()) {
    const keys = getPageDatasets(pageName);
    keys.forEach(key => { const state = getDatasetState(key); state.status = 'idle'; state.error = null; });
    await ensureData(keys);
    renderPageContent(pageName);
}

function resizeActiveCharts() {
    setTimeout(() => {
        document.querySelectorAll('.page.active .chart-container').forEach(dom => {
            if (!window.echarts || typeof window.echarts.getInstanceByDom !== 'function') return;
            try {
                const chart = window.echarts.getInstanceByDom(dom);
                if (chart) chart.resize();
            } catch (error) {
                console.warn('Chart resize skipped:', error);
            }
        });
    }, 100);
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));

    const page = document.getElementById(`page-${pageName}`);
    if (page) page.classList.add('active');

    const tabs = document.querySelectorAll('.nav-tab');
    const tabMap = { overview: 0, methods: 1, importance: 2, dependence: 3, partial: 4, heterogeneity: 5, region: 6 };
    if (tabMap[pageName] !== undefined && tabs[tabMap[pageName]]) tabs[tabMap[pageName]].classList.add('active');

    const requiredDatasets = getPageDatasets(pageName);
    const dataReady = requiredDatasets.every(key => getDatasetState(key).status === 'loaded');
    if (dataReady) {
        renderPageContent(pageName);
    } else {
        (PAGE_RENDER_CONTAINERS[pageName] || []).forEach(id => {
            const target = document.getElementById(id);
            if (target) target.innerHTML = `<div class="loading" role="status">${html(msg('common.loading', 'Loading…'))}</div>`;
        });
        ensureData(requiredDatasets).then(() => {
            if (activePageName() !== pageName) return;
            renderPageContent(pageName);
            resizeActiveCharts();
        });
    }
    resizeActiveCharts();
}

let overviewView = 'matrix';
let overviewWetland = WETLAND_TYPES[0];
const overviewDrawerState = { type: null, wetland: null, cluster: null, trigger: null };
const unitDrawerState = { cluster: null, city: null, wetland: null, trigger: null };

const SCREENING_CATEGORY_DISPLAY = {
    High: { state: 'high', labelKey: 'figure14.High.label', label: 'High-priority review', noteKey: 'figure14.High.note', note: 'High-priority evidence review category; not a future-risk probability.' },
    Medium: { state: 'medium', labelKey: 'figure14.Medium.label', label: 'Medium-priority review', noteKey: 'figure14.Medium.note', note: 'Medium-priority evidence review category; not a future-risk probability.' },
    Decoupling: { state: 'decoupling', labelKey: 'figure14.Decoupling.label', label: 'Decoupling review', noteKey: 'figure14.Decoupling.note', note: 'Decoupling evidence review category; not a future-risk probability.' },
    Insufficient: { state: 'insufficient-data', labelKey: 'figure14.Insufficient.label', label: 'Insufficient data', noteKey: 'figure14.Insufficient.note', note: 'Insufficient-data category; further source material is needed, and it is not a future-risk probability.' },
};

const SCREENING_CELL_LABEL_DISPLAY = {
    'Multiple pressure': ['figure14.cell.multiplePressure', 'Multiple pressure'],
    'Sparse distribution': ['figure14.cell.sparseDistribution', 'Sparse distribution'],
    'Cropland encroachment': ['figure14.cell.croplandEncroachment', 'Cropland encroachment'],
    'High-urbanization residual': ['figure14.cell.highUrbanizationResidual', 'High-urbanization residual'],
    'Northern-edge climate': ['figure14.cell.northernEdgeClimate', 'Northern-edge climate'],
    'Reclamation + population + urbanization': ['figure14.cell.reclamationPopulationUrbanization', 'Reclamation + population + urbanization'],
    'Population pressure': ['figure14.cell.populationPressure', 'Population pressure'],
    'Multi-factor pressure': ['figure14.cell.multiFactorPressure', 'Multi-factor pressure'],
    'Population concentration': ['figure14.cell.populationConcentration', 'Population concentration'],
    'Direct urban encroachment': ['figure14.cell.directUrbanEncroachment', 'Direct urban encroachment'],
    'Economy + precipitation': ['figure14.cell.economyPrecipitation', 'Economy + precipitation'],
    'Climate-sensitive frontier': ['figure14.cell.climateSensitiveFrontier', 'Climate-sensitive frontier'],
    'Population + urbanization': ['figure14.cell.populationUrbanization', 'Population + urbanization'],
    'Variable decoupling': ['figure14.cell.variableDecoupling', 'Variable decoupling'],
    'All-dimensional pressure': ['figure14.cell.allDimensionalPressure', 'All-dimensional pressure'],
    'Unclear key variables': ['figure14.cell.unclearKeyVariables', 'Unclear key variables'],
    'Urbanization + precipitation': ['figure14.cell.urbanizationPrecipitation', 'Urbanization + precipitation'],
    'Population + cropland': ['figure14.cell.populationCropland', 'Population + cropland'],
    'Hydrological disruption': ['figure14.cell.hydrologicalDisruption', 'Hydrological disruption'],
};

const EVIDENCE_SUPPORT_GRADE_DISPLAY = {
    'strong multi-source support': ['figure14.support.strong', 'Strong multi-source support', 'figure14.support.strongNote', 'TWFE, SHAP-group overlap, and GMM persistence all support further review.'],
    'moderate support': ['figure14.support.moderate', 'Moderate support', 'figure14.support.moderateNote', 'Two of the three evidence checks support further review.'],
    'limited support': ['figure14.support.limited', 'Limited support', 'figure14.support.limitedNote', 'Only one of the three evidence checks directly supports the source classification.'],
    'weak direct quantitative support': ['figure14.support.weak', 'Weak direct quantitative support', 'figure14.support.weakNote', 'Direct quantitative convergence is weak; this does not mean low priority or low risk.'],
    'cautionary/interpretive': ['figure14.support.cautionary', 'Cautionary / interpretive', 'figure14.support.cautionaryNote', 'The cell signals data limitations or decoupling and requires contextual evidence and human review.'],
};

function screeningCategoryDisplay(riskMatrix) {
    const category = riskMatrix?.Category;
    const source = SCREENING_CATEGORY_DISPLAY[category];
    if (!source) {
        return {
            state: 'insufficient-data',
            label: msg('figure14.Unknown.label', 'Source review needed'),
            note: msg('figure14.Unknown.note', 'This source category needs review; it is not a future-risk probability.'),
            category: category || 'Unknown',
        };
    }
    return { ...source, label: msg(source.labelKey, source.label), note: msg(source.noteKey, source.note), category };
}

function trendDirectionLabel(direction, includeArrow = false) {
    const details = {
        increase: { arrow: '↑', key: 'trend.increase', fallback: 'Historical increase' },
        decrease: { arrow: '↓', key: 'trend.decrease', fallback: 'Historical decrease' },
        stable: { arrow: '→', key: 'trend.stable', fallback: 'Historically stable' },
    }[direction] || { arrow: '→', key: 'trend.stable', fallback: 'Historically stable' };
    return `${includeArrow ? `${details.arrow} ` : ''}${msg(details.key, details.fallback)}`;
}

function unavailableText() { return msg('common.notAvailable', 'Not provided'); }
function notApplicableText() { return msg('common.notApplicable', 'Not applicable'); }

function wetlandOptions(selected) {
    return WETLAND_TYPES.map(wetland => `<option value="${wetland}"${wetland === selected ? ' selected' : ''}>${html(WETLAND_LABELS[wetland])}</option>`).join('');
}

function javascriptArgument(value) {
    return html(JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c'));
}

function renderDatasetSummary() {
    const bundle = DATA.evidenceBundle;
    const quality = bundle?.panel_quality || {};
    const values = {
        'overview-period-value': quality.period || '2001–2022',
        'overview-observations-value': quality.rows,
        'overview-spatial-units-value': quality.spatial_units,
        'overview-clusters-value': bundle?.enumerations?.clusters?.length,
        'overview-wetlands-value': bundle?.enumerations?.wetlands?.length,
    };
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element && value !== undefined && value !== null) element.textContent = id === 'overview-period-value' ? String(value).replace('-', '–') : formatEvidenceNumber(value, 0);
    });
}

function renderOverview() {
    const matrix = document.getElementById('evidence-matrix');
    renderDatasetSummary();
    if (!DATA.evidenceBundle) {
        if (matrix) matrix.innerHTML = `<div class="loading error-state"><strong>${html(msg('overview.evidenceUnavailable.title', 'Evidence navigation is unavailable'))}</strong><p>${html(DATA.evidenceError?.message || msg('overview.evidenceUnavailable.message', 'The evidence bundle could not be loaded. Open this page through an HTTP server.'))}</p></div>`;
        return;
    }
    const trendSelect = document.getElementById('overview-trend-wetland');
    if (trendSelect) trendSelect.innerHTML = wetlandOptions(overviewWetland);
    renderOverviewMatrix();
    renderOverviewTrends();
    renderOverviewQuality();
    applyOverviewView();
}

function renderOverviewMatrix() {
    const container = document.getElementById('evidence-matrix');
    if (!container || !DATA.evidenceBundle) return;
    const header = CLUSTERS.map(cluster => `<th scope="col">${html(CLUSTER_LABELS[cluster])}<small>${html(cluster)}</small></th>`).join('');
    const rows = WETLAND_TYPES.map(wetland => `<tr><th scope="row">${html(WETLAND_LABELS[wetland])}</th>${CLUSTERS.map(cluster => {
        const item = getEvidenceSummary(wetland, cluster);
        const display = screeningCategoryDisplay(item?.risk_matrix);
        const metrics = item?.trend?.metrics || {};
        const reason = screeningCellLabel(item?.risk_matrix?.Cell_Label);
        const ariaLabel = msg('overview.matrix.cellAria', '{wetland}, {cluster}: {classification}; {reason}', { wetland: WETLAND_LABELS[wetland], cluster: CLUSTER_LABELS[cluster], classification: display.label, reason });
        return `<td><button class="matrix-cell status-${display.state}" type="button" data-wetland="${wetland}" data-cluster="${cluster}" aria-label="${html(ariaLabel)}" onclick="openEvidenceDrawer('${wetland}', '${cluster}')"><strong>${html(display.label)}</strong><span class="cell-reason">${html(reason)}</span><span class="cell-trend">${html(trendDirectionLabel(metrics.direction))}</span></button></td>`;
    }).join('')}</tr>`).join('');
    container.innerHTML = `<div class="screening-matrix-scroll"><table class="screening-matrix-table"><thead><tr><th scope="col">${html(msg('overview.matrixCorner', 'Wetland / city cluster'))}</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderOverviewTrends() {
    const container = document.getElementById('overview-trends');
    if (!container || !DATA.evidenceBundle) return;
    const wetland = document.getElementById('overview-trend-wetland')?.value || overviewWetland;
    overviewWetland = wetland;
    renderOverviewTrendsForWetland(wetland);
}

function renderOverviewTrendsForWetland(wetland) {
    const container = document.getElementById('overview-trends');
    if (!container || !DATA.evidenceBundle) return;
    container.innerHTML = CLUSTERS.map(cluster => {
        const item = getEvidenceSummary(wetland, cluster);
        const trend = item?.trend?.metrics || {};
        const display = screeningCategoryDisplay(item?.risk_matrix);
        return `<article class="trend-card"><div class="trend-card-head"><div><span class="eyebrow">${html(CLUSTER_LABELS[cluster])}</span><h4>${html(WETLAND_LABELS[wetland])}</h4></div><span class="status-badge badge-${display.state}">${html(display.label)}</span></div><p class="trend-direction ${html(trend.direction || 'stable')}">${html(trendDirectionLabel(trend.direction, true))}</p><dl class="trend-metrics"><div><dt>${html(msg('metrics.startToEnd', 'Start → end'))}</dt><dd>${formatEvidenceNumber(trend.start_value)} → ${formatEvidenceNumber(trend.end_value)}</dd></div><div><dt>${html(msg('metrics.changeRate', 'Change rate'))}</dt><dd>${formatEvidenceRate(trend)}</dd></div><div><dt>${html(msg('metrics.annualSlope', 'Annual slope'))}</dt><dd>${formatEvidenceNumber(trend.slope_per_year, 2)}</dd></div><div><dt>${html(msg('metrics.coverage', 'Coverage'))}</dt><dd>${dynamicText(msg('metrics.coverageValue', '{years} years · {units} units', { years: formatEvidenceNumber(trend.observations, 0), units: formatEvidenceNumber(trend.spatial_units, 0) }))}</dd></div></dl><button class="text-action" type="button" onclick="openEvidenceDrawer('${wetland}', '${cluster}')">${html(msg('overview.viewEvidence', 'View evidence summary'))}</button></article>`;
    }).join('');
}

function renderOverviewQuality() {
    const container = document.getElementById('overview-quality');
    const bundle = DATA.evidenceBundle;
    if (!container || !bundle) return;
    const counts = bundle.cluster_summary.reduce((acc, item) => {
        const display = screeningCategoryDisplay(item.risk_matrix);
        acc[display.category] = (acc[display.category] || 0) + 1;
        return acc;
    }, {});
    const categories = ['High', 'Medium', 'Decoupling', 'Insufficient'].map(category => {
        const display = screeningCategoryDisplay({ Category: category });
        return { ...display, count: formatEvidenceNumber(counts[category] || 0, 0) };
    });
    const count = formatEvidenceNumber(bundle.cluster_summary.length, 0);
    const flagged = formatEvidenceNumber(bundle.quality_flags.length, 0);
    container.innerHTML = `<article class="quality-distribution-card"><div class="quality-card-heading"><div><span class="quality-kicker">${html(msg('overview.figure14Matrix', 'Evidence synthesis matrix'))}</span><div class="quality-total"><strong>${count}</strong><span>${html(msg('overview.screeningUnits', 'screening units'))}</span></div></div><span class="quality-breakdown-label">${html(msg('overview.categoryBreakdown', 'Category distribution'))}</span></div><div class="quality-category-grid">${categories.map(category => `<div class="quality-category quality-category-${category.state}"><strong>${category.count}</strong><span>${html(category.label)}</span></div>`).join('')}</div></article><article class="quality-flags-card"><span class="quality-kicker">${html(msg('overview.qualityControl', 'Quality control'))}</span><strong>${flagged}</strong><h4>${html(msg('overview.qualityFlagsRetained', 'Quality flags retained'))}</h4><p>${html(msg('overview.qualityFlagsNote', 'Traceable data checks are retained in the evidence bundle.'))}</p></article><article class="quality-boundary-card"><span class="quality-boundary-mark" aria-hidden="true">i</span><div><strong>${html(msg('overview.boundaryHeading', 'Interpretation boundary'))}</strong><p>${html(msg('overview.modelBoundaryCopy', 'The evidence synthesis matrix is a screening and review classification, not a future-risk probability. SHAP and partial effects describe model attribution or responses within the observed range; they do not establish causality.'))}</p></div></article>`;
}

function screeningCellLabel(value) {
    const display = SCREENING_CELL_LABEL_DISPLAY[value];
    return display ? msg(display[0], display[1]) : (value || msg('common.notAvailable', 'Not provided'));
}

function evidenceSupportGradeDisplay(value) {
    const display = EVIDENCE_SUPPORT_GRADE_DISPLAY[value];
    if (!display) return { label: value || unavailableText(), note: msg('figure14.support.unknownNote', 'No support-grade interpretation is available.') };
    return { label: msg(display[0], display[1]), note: msg(display[2], display[3]) };
}

function applyOverviewView() {
    document.getElementById('overview-matrix-view')?.classList.toggle('is-hidden', overviewView !== 'matrix');
    document.getElementById('overview-trend-view')?.classList.toggle('is-hidden', overviewView !== 'trend');
    document.querySelectorAll('.segmented-control .segment').forEach(item => {
        const active = item.dataset.view === overviewView || item.getAttribute('onclick')?.includes(`'${overviewView}'`);
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
    });
}

function setOverviewView(view, button) {
    overviewView = view;
    if (button) {
        document.querySelectorAll('.segmented-control .segment').forEach(item => { item.classList.remove('active'); item.setAttribute('aria-selected', 'false'); });
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');
    }
    applyOverviewView();
}

function showOverviewDrawer() {
    const drawer = document.getElementById('overview-drawer');
    drawer?.classList.remove('is-hidden');
    document.body.classList.add('drawer-open');
}

function renderEvidenceDrawer(wetland, cluster) {
    const item = getEvidenceSummary(wetland, cluster);
    if (!item) return;
    const trend = item.trend || {};
    const metrics = trend.metrics || {};
    const display = screeningCategoryDisplay(item.risk_matrix);
    const models = getEvidenceModels(wetland, cluster);
    const modelStatus = item.model_summary?.status || unavailableText();
    const flags = (trend.quality_flag_ids || []).map(id => DATA.evidenceBundle._flagsById.get(id)?.flag || id);
    const risk = item.risk_matrix || {};
    const supportGrade = evidenceSupportGradeDisplay(risk.Evidence_Support_Grade);
    document.getElementById('drawer-content').innerHTML = `<p class="eyebrow">${html(msg('drawer.evidenceSummary', 'Evidence summary'))} · ${html(trend.scale || unavailableText())}</p><h2 id="drawer-title">${html(WETLAND_LABELS[wetland])} · ${html(CLUSTER_LABELS[cluster])}</h2><div class="drawer-status badge-${display.state}">${html(display.label)} · ${html(screeningCellLabel(risk.Cell_Label))}</div><p class="drawer-warning">${html(msg('drawer.figure14Boundary', '{note} Matrix classifications are source screening/review categories, not future-risk probabilities.', { note: display.note }))}</p><section class="drawer-section"><h3>${html(msg('drawer.historicalFacts', 'Historical facts (FACT)'))}</h3><p>${html(trend.period?.label || unavailableText())} · ${html(trend.scale || unavailableText())} · ${html(trend.method || unavailableText())}</p><dl class="drawer-metrics"><div><dt>${html(msg('metrics.startToEnd', 'Start → end'))}</dt><dd>${formatEvidenceNumber(metrics.start_value)} → ${formatEvidenceNumber(metrics.end_value)}</dd></div><div><dt>${html(msg('metrics.absoluteChange', 'Absolute change'))}</dt><dd>${formatEvidenceNumber(metrics.absolute_change)}</dd></div><div><dt>${html(msg('metrics.changeRate', 'Change rate'))}</dt><dd>${formatEvidenceRate(metrics)}</dd></div><div><dt>${html(msg('metrics.annualSlope', 'Annual slope'))}</dt><dd>${formatEvidenceNumber(metrics.slope_per_year, 2)}</dd></div><div><dt>${html(msg('metrics.sampleCoverage', 'Sample coverage'))}</dt><dd>${dynamicText(msg('metrics.coverageValue', '{years} years · {units} units', { years: formatEvidenceNumber(metrics.observations, 0), units: formatEvidenceNumber(metrics.spatial_units, 0) }))}</dd></div></dl></section><section class="drawer-section"><h3>${html(msg('drawer.figure14SupportingEvidence', 'Matrix supporting evidence'))}</h3><p><strong>${html(msg('drawer.evidenceSupportGrade', 'Evidence support grade: {value}', { value: supportGrade.label }))}</strong></p><p>${html(supportGrade.note)}</p><p>${html(msg('drawer.figure14SampleSize', 'Model sample size: {value} spatial-unit–year observations', { value: formatEvidenceNumber(risk.Sample_N_city_year, 0) }))}</p><p>${html(msg('drawer.twfeNegativeTerms', 'TWFE significant negative terms: {value}', { value: risk.Regional_TWFE_significant_negative_terms_p_lt_0_10 || unavailableText() }))}</p><p>${html(msg('drawer.shapTop3', 'SHAP top 3: {value}', { value: risk.Cluster_SHAP_top3 || unavailableText() }))}</p><p>${html(msg('drawer.partialTop3', 'Partial-effect top 3: {value}', { value: risk.Cluster_partial_effect_top3_by_elasticity || unavailableText() }))}</p><p>${html(msg('drawer.gmmLagTerms', 'GMM lag terms: {value}', { value: risk.Wetland_GMM_lag_status || unavailableText() }))}</p></section><section class="drawer-section"><h3>${html(msg('drawer.modelsAndLimitations', 'Models and limitations'))}</h3><p>${html(msg('drawer.regionalModelStatus', 'Regional model status: {value}', { value: modelStatus }))}</p><ul>${[...(trend.limitations || []), ...models.slice(0, 3).flatMap(model => model.limitations || [])].map(text => `<li>${html(text)}</li>`).join('')}</ul>${flags.length ? `<p>${html(msg('drawer.qualityFlags', 'Quality flags: {flags}', { flags: flags.join(', ') }))}</p>` : ''}</section><section class="drawer-source"><h3>${html(msg('drawer.source', 'Source'))}</h3><p>${html(trend.source?.path || unavailableText())}</p><p>${html(msg('drawer.sha256', 'SHA-256: {value}', { value: trend.source?.sha256 || unavailableText() }))}</p></section><button id="drawer-region-action" class="primary-action drawer-action" type="button">${html(msg('drawer.openUnitList', 'Open spatial-unit list'))}</button>`;
    setEvidenceDrawerRegionButton(wetland, cluster);
}

function openEvidenceDrawer(wetland, cluster, trigger = document.activeElement) {
    if (!getEvidenceSummary(wetland, cluster)) return;
    overviewDrawerState.type = 'evidence';
    overviewDrawerState.wetland = wetland;
    overviewDrawerState.cluster = cluster;
    overviewDrawerState.trigger = trigger;
    renderEvidenceDrawer(wetland, cluster);
    showOverviewDrawer();
    document.querySelector('#overview-drawer .drawer-close')?.focus();
}

function renderRecommendationDrawer() {
    document.getElementById('drawer-content').innerHTML = `<p class="eyebrow">${html(msg('recommendation.drawer.eyebrow', 'Case-selection note'))}</p><h2 id="drawer-title">${html(msg('recommendation.drawer.title', 'Why begin with Bohai Sea?'))}</h2><div class="drawer-status badge-demo">${html(msg('recommendation.drawer.badge', 'Demonstration-case selection'))}</div><p class="drawer-warning">${html(msg('recommendation.drawer.warning', 'BYS was not automatically selected as the highest-risk region by the source matrix.'))}</p><section class="drawer-section"><h3>${html(msg('recommendation.drawer.basisTitle', 'Selection basis'))}</h3><ul><li>${html(msg('recommendation.drawer.basis1', 'Its larger sample supports demonstration of spatial-unit drill-down.'))}</li><li>${html(msg('recommendation.drawer.basis2', 'Its historical-change story and public relevance support a demonstration.'))}</li><li>${html(msg('recommendation.drawer.basis3', 'It enables a later ecological-context comparison with Beibu Gulf.'))}</li></ul></section><section class="drawer-section"><h3>${html(msg('recommendation.drawer.boundaryTitle', 'Boundaries that must remain'))}</h3><p>${html(msg('recommendation.drawer.boundary', 'The selection rationale is neither a probability nor a model conclusion. Area increase does not automatically demonstrate restoration success; later conclusions require human review and additional data.'))}</p></section>`;
}

function openRecommendationDrawer(trigger = document.activeElement) {
    overviewDrawerState.type = 'recommendation';
    overviewDrawerState.wetland = null;
    overviewDrawerState.cluster = null;
    overviewDrawerState.trigger = trigger;
    renderRecommendationDrawer();
    showOverviewDrawer();
    document.querySelector('#overview-drawer .drawer-close')?.focus();
}

function closeOverviewDrawer({ restoreFocus = true } = {}) {
    document.getElementById('overview-drawer')?.classList.add('is-hidden');
    if (document.getElementById('unit-drawer')?.classList.contains('is-hidden')) document.body.classList.remove('drawer-open');
    if (restoreFocus && overviewDrawerState.trigger && typeof overviewDrawerState.trigger.focus === 'function') overviewDrawerState.trigger.focus();
    overviewDrawerState.type = null;
}

function handleDrawerOverlay(event) { if (event.target.id === 'overview-drawer') closeOverviewDrawer(); }

document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.getElementById('overview-drawer')?.classList.contains('is-hidden')) closeOverviewDrawer(); });

const regionState = { cluster: 'BYS', wetland: 'Mangrove', sortKey: 'absolute_change', quality: 'all' };

function openRegionPage(cluster = 'BYS') {
    regionState.cluster = cluster;
    closeOverviewDrawer({ restoreFocus: false });
    showPage('region');
}

function setRegionCluster(cluster) { regionState.cluster = cluster; regionState.wetland = 'Mangrove'; renderRegionPage(); }
function setRegionWetland(wetland) { regionState.wetland = wetland; renderRegionPage(); }
function setRegionSort(sortKey) { regionState.sortKey = sortKey; renderRegionPage(); }
function setRegionQuality(filter) { regionState.quality = filter; renderRegionPage(); }
function toggleSortHelp() { document.getElementById('region-sort-help')?.classList.toggle('is-hidden'); }

function regionItems(cluster, wetland) {
    const bundle = DATA.evidenceBundle;
    if (!bundle) return [];
    return (bundle._unitsByCluster?.get(cluster) || []).filter(item => item.wetland_code === wetland).map(item => {
        const evidence = item.evidence?.[0] || {};
        const flags = (evidence.quality_flag_ids || []).map(id => bundle._flagsById.get(id)).filter(Boolean);
        return { ...item, evidence, flags, metrics: evidence.metrics || {} };
    });
}

function regionFilter(items) {
    return items.filter(item => {
        if (regionState.quality === 'flagged') return item.flags.length > 0;
        if (regionState.quality === 'decrease') return item.metrics.direction === 'decrease';
        if (regionState.quality === 'increase') return item.metrics.direction === 'increase';
        if (regionState.quality === 'stable') return item.metrics.direction === 'stable';
        return true;
    });
}

function regionSort(items) {
    const key = regionState.sortKey;
    return [...items].sort((a, b) => {
        if (key === 'city') return a.city.localeCompare(b.city, getLocale());
        const av = a.metrics[key]; const bv = b.metrics[key];
        const an = av === null || av === undefined || Number.isNaN(Number(av));
        const bn = bv === null || bv === undefined || Number.isNaN(Number(bv));
        if (an !== bn) return an ? 1 : -1;
        if (an) return a.city.localeCompare(b.city, getLocale());
        return Number(av) - Number(bv) || a.city.localeCompare(b.city, getLocale());
    });
}

function regionChangeLabel(metrics) { return formatEvidenceRate(metrics); }

function isStructuralSparse(cluster, wetland) { return cluster === 'BYS' && wetland === 'Mangrove'; }

function renderRegionPage() {
    if (!DATA.evidenceBundle) return;
    const cluster = regionState.cluster;
    const units = DATA.evidenceBundle._unitsByCluster?.get(cluster) || [];
    const unitCount = new Set(units.map(unit => unit.city)).size;
    const role = cluster === 'BYS'
        ? msg('region.role.primaryCase', 'Primary-case drill-down · {count} spatial units', { count: formatEvidenceNumber(unitCount, 0) })
        : msg('region.role.ecologicalComparison', 'Southern ecological-type comparison · {count} spatial units', { count: formatEvidenceNumber(unitCount, 0) });
    document.getElementById('region-cluster').value = cluster;
    document.getElementById('region-wetland').innerHTML = wetlandOptions(regionState.wetland);
    document.getElementById('region-sort').value = regionState.sortKey;
    document.getElementById('region-quality').value = regionState.quality;
    document.getElementById('region-title').textContent = msg('region.title', '{cluster} spatial units', { cluster: CLUSTER_LABELS[cluster] });
    document.getElementById('region-role').textContent = role;
    document.getElementById('region-list-title').textContent = msg('region.listTitle', '{count} spatial units · {wetland}', { count: formatEvidenceNumber(unitCount, 0), wetland: WETLAND_LABELS[regionState.wetland] });
    renderRegionComparison(regionState.wetland);
    renderRegionWetlandSummary(cluster);
    renderRegionUnits(cluster, regionState.wetland);
    renderRegionHeatmap(cluster);
}

function comparisonProfile(cluster, wetland) {
    const item = getEvidenceSummary(wetland, cluster);
    const metrics = item?.trend?.metrics || {};
    const unitCount = new Set((DATA.evidenceBundle?._unitsByCluster?.get(cluster) || []).map(unit => unit.city)).size;
    return { item, metrics, unitCount };
}

function comparisonInterpretation(cluster, wetland, metrics) {
    if (cluster === 'BYS' && wetland === 'Mangrove') return msg('region.interpretation.bysMangrove', 'Structural sparsity: both start and end values are 0, so this cannot be interpreted as ordinary stability or restoration success.');
    if (cluster === 'BBG' && wetland === 'Mangrove') return msg('region.interpretation.bbgMangrove', 'The southern mangrove ecological context differs. Historical growth is a FACT and requires review of connectivity, community quality, and conservation projects.');
    if (metrics.direction === 'increase') return msg('region.interpretation.increase', 'Historical area growth only records an increase in the area FACT; it does not automatically demonstrate restoration success.');
    if (metrics.direction === 'decrease') return msg('region.interpretation.decrease', 'Historical decline indicates that regional mechanisms such as reclamation, shoreline disturbance, and wetland-type conversion require review.');
    return msg('region.interpretation.stable', 'Historical stability also requires assessment against the baseline, remote-sensing uncertainty, and ecological quality.');
}

function renderRegionComparison(wetland) {
    const container = document.getElementById('region-comparison');
    if (!container || !DATA.evidenceBundle) return;
    const rows = ['start_value', 'end_value', 'absolute_change', 'relative_change_rate', 'slope_per_year'];
    const labels = {
        start_value: msg('metrics.start', 'Start'), end_value: msg('metrics.end', 'End'), absolute_change: msg('metrics.absoluteChange', 'Absolute change'), relative_change_rate: msg('metrics.changeRate', 'Change rate'), slope_per_year: msg('metrics.annualSlope', 'Annual slope'),
    };
    const profiles = ['BYS', 'BBG'].map(cluster => ({ cluster, ...comparisonProfile(cluster, wetland) }));
    const cards = profiles.map(({ cluster, item, metrics, unitCount }) => {
        const display = screeningCategoryDisplay(item?.risk_matrix);
        const caseLabel = cluster === 'BYS' ? msg('region.primaryCase', 'Primary case') : msg('region.bbgComparison', 'Beibu Gulf ecological comparison');
        return `<article class="comparison-card"><div class="comparison-card-head"><div><span class="eyebrow">${html(CLUSTER_LABELS[cluster])}</span><h4>${html(caseLabel)}</h4></div><span class="status-badge badge-${display.state}">${html(display.label)}</span></div><dl class="comparison-metrics">${rows.map(key => `<div><dt>${html(labels[key])}</dt><dd>${key === 'relative_change_rate' ? formatEvidenceRate(metrics) : formatEvidenceNumber(metrics[key], key === 'slope_per_year' ? 2 : 1)}</dd></div>`).join('')}<div><dt>${html(msg('metrics.spatialUnits', 'Spatial units'))}</dt><dd>${dynamicText(msg('metrics.unitCount', '{count} units', { count: formatEvidenceNumber(unitCount, 0) }))}</dd></div></dl><p class="comparison-interpretation">${html(comparisonInterpretation(cluster, wetland, metrics))}</p></article>`;
    }).join('');
    container.innerHTML = `<div class="comparison-grid">${cards}</div><div class="policy-framework"><strong>${html(msg('region.policy.title', 'Why can a one-size-fits-all strategy fail?'))}</strong><ul><li>${html(msg('region.policy.one', 'At the same 2001–2022 scale and for the same indicators, BYS and BBG have different ecological baselines and sample sizes; one threshold cannot directly determine both.'))}</li><li>${html(msg('region.policy.two', 'Area growth does not automatically demonstrate restoration success; ecological quality, connectivity, community structure, and human review evidence are still required.'))}</li><li>${html(msg('region.policy.three', 'A zero mangrove baseline in BYS is not stable success, and growth in BBG remains a historical fact rather than proof of policy effectiveness.'))}</li></ul></div>`;
}

function renderRegionWetlandSummary(cluster) {
    const container = document.getElementById('region-wetland-summary');
    if (!container) return;
    container.innerHTML = WETLAND_TYPES.map(wetland => {
        const items = regionItems(cluster, wetland);
        const increase = items.filter(item => item.metrics.direction === 'increase').length;
        const decrease = items.filter(item => item.metrics.direction === 'decrease').length;
        const sparse = isStructuralSparse(cluster, wetland);
        const summary = sparse ? msg('region.structuralSparse', 'Not applicable / structural sparsity') : msg('region.directionCounts', '{increase} increases · {decrease} decreases', { increase: formatEvidenceNumber(increase, 0), decrease: formatEvidenceNumber(decrease, 0) });
        return `<article class="region-summary-card ${sparse ? 'structural-sparse' : ''}"><span class="eyebrow">${html(WETLAND_LABELS[wetland])}</span><strong>${dynamicText(summary)}</strong><span>${dynamicText(msg('metrics.unitCountPeriod', '{count} spatial units · 2001–2022', { count: formatEvidenceNumber(items.length, 0) }))}</span>${sparse ? `<small>${html(msg('region.structuralSparseNote', 'The start value is 0 and the change rate is not computable; do not interpret this as ordinary stability.'))}</small>` : ''}</article>`;
    }).join('');
}

function bindUnitEvidenceControls(container) {
    container?.querySelectorAll('.unit-evidence-trigger').forEach(button => {
        button.addEventListener('click', () => openUnitEvidenceCard(button.dataset.cluster, button.dataset.city, button.dataset.wetland, button));
    });
}

function renderRegionUnits(cluster, wetland) {
    const container = document.getElementById('region-units');
    const all = regionItems(cluster, wetland);
    const filtered = regionSort(regionFilter(all));
    document.getElementById('region-count').textContent = msg('region.displayCount', 'Showing {shown} / {total} · descriptive review order', { shown: formatEvidenceNumber(filtered.length, 0), total: formatEvidenceNumber(all.length, 0) });
    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state">${html(msg('region.empty', 'No spatial units match the current filter. Restore “All” or change the filter.'))}</div>`;
        return;
    }
    container.innerHTML = `<div class="unit-table-wrap"><table class="unit-table"><thead><tr><th>${html(msg('region.table.spatialUnit', 'Spatial unit'))}</th><th>${html(msg('metrics.startToEnd', 'Start → end'))}</th><th>${html(msg('metrics.absoluteChange', 'Absolute change'))}</th><th>${html(msg('metrics.changeRate', 'Change rate'))}</th><th>${html(msg('metrics.annualSlope', 'Annual slope'))}</th><th>${html(msg('region.table.direction', 'Direction'))}</th><th>${html(msg('region.table.quality', 'Quality'))}</th></tr></thead><tbody>${filtered.map(item => {
        const metrics = item.metrics;
        const sparse = isStructuralSparse(cluster, wetland);
        const change = sparse ? notApplicableText() : regionChangeLabel(metrics);
        const slope = sparse ? notApplicableText() : formatEvidenceNumber(metrics.slope_per_year, 2);
        const direction = sparse ? msg('region.structuralSparseShort', 'Structural sparsity') : trendDirectionLabel(metrics.direction);
        const quality = item.flags.length ? `<span class="quality-chip">${dynamicText(msg('region.qualityFlagCount', '{count} flags', { count: formatEvidenceNumber(item.flags.length, 0) }))}</span>` : '—';
        return `<tr><td><button class="unit-link unit-evidence-trigger" type="button" data-cluster="${cluster}" data-city="${html(item.city)}" data-wetland="${wetland}">${html(item.city)}</button></td><td>${formatEvidenceNumber(metrics.start_value)} → ${formatEvidenceNumber(metrics.end_value)}</td><td>${formatEvidenceNumber(metrics.absolute_change)}</td><td>${html(change)}</td><td>${html(slope)}</td><td>${html(direction)}</td><td>${quality}</td></tr>`;
    }).join('')}</tbody></table></div>`;
    bindUnitEvidenceControls(container);
}

function renderRegionHeatmap(cluster) {
    const container = document.getElementById('region-heatmap');
    if (!container) return;
    const cities = [...new Set((DATA.evidenceBundle._unitsByCluster?.get(cluster) || []).map(item => item.city))].sort((a, b) => a.localeCompare(b, getLocale()));
    const rows = WETLAND_TYPES.map(wetland => `<tr><th>${html(WETLAND_LABELS[wetland])}</th>${cities.map(city => {
        const item = DATA.evidenceBundle._unitByKey.get(`${cluster}::${city}::${wetland}`);
        const metrics = item?.evidence?.[0]?.metrics || {};
        const sparse = isStructuralSparse(cluster, wetland);
        const value = sparse ? msg('common.notApplicableAbbreviation', 'N/A') : formatEvidenceNumber(metrics.absolute_change);
        const title = msg('region.heatmapTitle', '{city} · {wetland} · absolute change: {value}', { city, wetland: WETLAND_LABELS[wetland], value });
        return `<td class="${sparse ? 'heatmap-na' : (metrics.absolute_change < 0 ? 'heatmap-negative' : 'heatmap-positive')} unit-evidence-trigger" title="${html(title)}" data-cluster="${cluster}" data-city="${html(city)}" data-wetland="${wetland}" role="button" tabindex="0">${html(value)}</td>`;
    }).join('')}</tr>`).join('');
    container.innerHTML = `<div class="heatmap-scroll"><table class="change-heatmap"><thead><tr><th>${html(msg('region.heatmapHeader', 'Wetland / unit'))}</th>${cities.map(city => `<th>${html(city)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p class="heatmap-note">${html(msg('region.heatmapNote', 'Heatmap values are historical absolute changes, not risk scores; N/A denotes structural sparsity or non-applicability.'))}</p>`;
    bindUnitEvidenceControls(container);
    container.querySelectorAll('td.unit-evidence-trigger').forEach(cell => cell.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openUnitEvidenceCard(cell.dataset.cluster, cell.dataset.city, cell.dataset.wetland, cell); }
    }));
}

function renderUnitEvidenceCard(cluster, city, wetland) {
    const item = DATA.evidenceBundle?._unitByKey?.get(`${cluster}::${city}::${wetland}`);
    if (!item) return;
    const evidence = item.evidence?.[0] || {};
    const metrics = evidence.metrics || {};
    const sparse = isStructuralSparse(cluster, wetland);
    const flags = (evidence.quality_flag_ids || []).map(id => DATA.evidenceBundle._flagsById.get(id)?.flag).filter(Boolean);
    const limitations = [...(evidence.limitations || []), ...(item.not_available || []), ...(sparse ? [msg('unit.structuralSparseModelLimit', 'BYS mangrove cannot be interpreted as an ordinary stable trend; the regional model failed.')] : [])];
    document.getElementById('unit-drawer-content').innerHTML = `<p class="eyebrow">${html(msg('unit.evidenceCard', 'Spatial-unit evidence card · FACT'))}</p><h2 id="unit-drawer-title">${html(city)} · ${html(WETLAND_LABELS[wetland])}</h2><div class="drawer-status ${sparse ? 'badge-insufficient-data' : 'badge-demo'}">${html(sparse ? msg('region.structuralSparse', 'Not applicable / structural sparsity') : msg('unit.historicalFact', 'Historical descriptive fact'))}</div><section class="drawer-section"><h3>${html(msg('unit.observationMethod', 'Observations and method'))}</h3><p>${html(evidence.period?.label || unavailableText())} · ${html(evidence.scale || unavailableText())} · ${html(evidence.method || unavailableText())}</p><dl class="drawer-metrics"><div><dt>${html(msg('metrics.startToEnd', 'Start → end'))}</dt><dd>${formatEvidenceNumber(metrics.start_value)} → ${formatEvidenceNumber(metrics.end_value)}</dd></div><div><dt>${html(msg('metrics.absoluteChange', 'Absolute change'))}</dt><dd>${formatEvidenceNumber(metrics.absolute_change)}</dd></div><div><dt>${html(msg('metrics.changeRate', 'Change rate'))}</dt><dd>${html(sparse ? msg('common.zeroStart', 'Not computable: start value is 0') : regionChangeLabel(metrics))}</dd></div><div><dt>${html(msg('metrics.annualSlope', 'Annual slope'))}</dt><dd>${html(sparse ? notApplicableText() : formatEvidenceNumber(metrics.slope_per_year, 2))}</dd></div><div><dt>${html(msg('metrics.sampleSize', 'Sample size'))}</dt><dd>${dynamicText(msg('metrics.yearCount', '{count} years', { count: formatEvidenceNumber(metrics.observations, 0) }))}</dd></div></dl></section><section class="drawer-section"><h3>${html(msg('unit.limitationsUnavailableEvidence', 'Limitations and unavailable evidence'))}</h3><ul>${limitations.map(text => `<li>${html(text)}</li>`).join('')}</ul>${flags.length ? `<p>${html(msg('drawer.qualityFlags', 'Quality flags: {flags}', { flags: flags.join(', ') }))}</p>` : ''}</section><section class="drawer-source"><h3>${html(msg('unit.sourceVersion', 'Source and version'))}</h3><p>${html(evidence.source?.path || unavailableText())}</p><p>${html(msg('drawer.sha256', 'SHA-256: {value}', { value: evidence.source?.sha256 || unavailableText() }))}</p><p>${html(msg('unit.contract', 'Contract: {id} · {version}', { id: DATA.evidenceBundle.contract_id, version: DATA.evidenceBundle.contract_version }))}</p></section><section class="drawer-section"><h3>${html(msg('unit.humanReview', 'Human review'))}</h3><p>${html(msg('unit.humanReviewNote', 'This is a draft evidence card; human review status has not been persisted.'))}</p></section>`;
}

function openUnitEvidenceCard(cluster, city, wetland, trigger = document.activeElement) {
    if (!DATA.evidenceBundle?._unitByKey?.get(`${cluster}::${city}::${wetland}`)) return;
    unitDrawerState.cluster = cluster;
    unitDrawerState.city = city;
    unitDrawerState.wetland = wetland;
    unitDrawerState.trigger = trigger;
    renderUnitEvidenceCard(cluster, city, wetland);
    const drawer = document.getElementById('unit-drawer');
    drawer?.classList.remove('is-hidden');
    document.body.classList.add('drawer-open');
    drawer?.querySelector('.drawer-close')?.focus();
}

function closeUnitEvidenceCard({ restoreFocus = true } = {}) {
    document.getElementById('unit-drawer')?.classList.add('is-hidden');
    if (document.getElementById('overview-drawer')?.classList.contains('is-hidden')) document.body.classList.remove('drawer-open');
    if (restoreFocus && unitDrawerState.trigger && typeof unitDrawerState.trigger.focus === 'function') unitDrawerState.trigger.focus();
    unitDrawerState.cluster = null;
}

window.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.getElementById('unit-drawer')?.classList.contains('is-hidden')) closeUnitEvidenceCard(); });
function handleUnitDrawerOverlay(event) { if (event.target.id === 'unit-drawer') closeUnitEvidenceCard(); }

function setEvidenceDrawerRegionButton(wetland, cluster) {
    const target = document.getElementById('drawer-region-action');
    if (target) target.onclick = () => openRegionPage(cluster);
}

function setImpMode(mode, button) {
    impMode = mode;
    document.querySelectorAll('#page-importance .toggle-btn').forEach(item => item.classList.remove('active'));
    button?.classList.add('active');
    updateImportance();
}

function updateImportance() {
    const wetland = document.getElementById('imp-wetland')?.value || WETLAND_TYPES[0];
    document.getElementById('imp-title').textContent = msg('importance.title', '{wetland} — SHAP feature importance', { wetland: WETLAND_LABELS[wetland] });
    renderImportanceHeatmap(wetland, impMode);
    renderImportanceBar(wetland);
}

function setDepMode(mode, button) {
    depMode = mode;
    document.querySelectorAll('#page-dependence .toggle-btn').forEach(item => item.classList.remove('active'));
    button?.classList.add('active');
    document.getElementById('dep-cluster-group').style.display = mode === 'single' ? 'flex' : 'none';
    updateDependence();
}

function updateDependence() {
    const wetland = document.getElementById('dep-wetland')?.value || WETLAND_TYPES[0];
    const feature = document.getElementById('dep-feature')?.value || FEATURES[0];
    const cluster = document.getElementById('dep-cluster')?.value || 'global';
    const scope = depMode === 'compare' ? msg('common.clusterComparison', 'cluster comparison') : (cluster === 'global' ? msg('common.global', 'Global') : CLUSTER_LABELS[cluster]);
    document.getElementById('dep-title').textContent = msg('dependence.title', '{wetland} — {feature} dependence ({scope})', { wetland: WETLAND_LABELS[wetland], feature: FEATURE_LABELS[feature], scope });
    renderDependence(wetland, feature, cluster, depMode);
}

function setPeMode(mode, button) {
    peMode = mode;
    document.querySelectorAll('#page-partial .toggle-btn').forEach(item => item.classList.remove('active'));
    button?.classList.add('active');
    document.getElementById('pe-cluster-group').style.display = mode === 'single' ? 'flex' : 'none';
    updatePartial();
}

function updatePartial() {
    const wetland = document.getElementById('pe-wetland')?.value || WETLAND_TYPES[0];
    const feature = document.getElementById('pe-feature')?.value || FEATURES[0];
    const cluster = document.getElementById('pe-cluster')?.value || 'global';
    const scope = peMode === 'compare' ? msg('common.clusterComparison', 'cluster comparison') : (cluster === 'global' ? msg('common.global', 'Global') : CLUSTER_LABELS[cluster]);
    document.getElementById('pe-title').textContent = msg('partial.title', '{wetland} — {feature} partial effect ({scope})', { wetland: WETLAND_LABELS[wetland], feature: FEATURE_LABELS[feature], scope });
    renderPartialEffect(wetland, feature, cluster, peMode);
    renderElasticityHeatmap(wetland);
}

function updateHeterogeneity() {
    const wetland = document.getElementById('het-wetland')?.value || WETLAND_TYPES[0];
    document.getElementById('het-title').textContent = msg('heterogeneity.title', '{wetland} — SHAP importance comparison across city clusters ({count} model features)', { wetland: WETLAND_LABELS[wetland], count: formatEvidenceNumber(FEATURES.length, 0) });
    renderHetRadar(wetland);
    renderHetGroup(wetland);
    renderHetTop3Table(wetland);
    renderHetDep(wetland);
}

function initSelects(savedValues = {}) {
    const featureOptions = FEATURES.map(feature => `<option value="${feature}">${html(FEATURE_LABELS[feature])}</option>`).join('');
    const wetlandOptionsHtml = wetlandOptions();
    const clusterOptions = [`<option value="global">${html(msg('common.global', 'Global'))}</option>`].concat(CLUSTERS.map(cluster => `<option value="${cluster}">${html(CLUSTER_LABELS[cluster])}</option>`)).join('');
    ['imp-wetland', 'dep-wetland', 'pe-wetland', 'het-wetland'].forEach(id => {
        const element = document.getElementById(id);
        if (element) { element.innerHTML = wetlandOptionsHtml; if (savedValues[id]) element.value = savedValues[id]; }
    });
    ['dep-feature', 'pe-feature'].forEach(id => {
        const element = document.getElementById(id);
        if (element) { element.innerHTML = featureOptions; if (savedValues[id]) element.value = savedValues[id]; }
    });
    ['dep-cluster', 'pe-cluster'].forEach(id => {
        const element = document.getElementById(id);
        if (element) { element.innerHTML = clusterOptions; if (savedValues[id]) element.value = savedValues[id]; }
    });
}

function snapshotLocaleUiState() {
    const values = {};
    document.querySelectorAll('select[id], textarea[id], input[id]').forEach(element => { values[element.id] = element.value; });
    const active = document.activeElement;
    return { page: activePageName(), values, focusId: active?.id || null, sortHelpOpen: !document.getElementById('region-sort-help')?.classList.contains('is-hidden') };
}

function restoreLocaleFocus(focusId) {
    if (!focusId) return;
    requestAnimationFrame(() => document.getElementById(focusId)?.focus());
}

function rerenderForLocaleChange() {
    const snapshot = snapshotLocaleUiState();
    const overviewWasOpen = !document.getElementById('overview-drawer')?.classList.contains('is-hidden');
    const unitWasOpen = !document.getElementById('unit-drawer')?.classList.contains('is-hidden');
    applyStaticTranslations();
    initSelects(snapshot.values);
    if (snapshot.values['overview-trend-wetland']) overviewWetland = snapshot.values['overview-trend-wetland'];
    if (snapshot.values['region-cluster']) regionState.cluster = snapshot.values['region-cluster'];
    if (snapshot.values['region-wetland']) regionState.wetland = snapshot.values['region-wetland'];
    if (snapshot.values['region-sort']) regionState.sortKey = snapshot.values['region-sort'];
    if (snapshot.values['region-quality']) regionState.quality = snapshot.values['region-quality'];
    renderOverview();
    if (window._importanceRendered) updateImportance();
    if (window._dependenceRendered) updateDependence();
    if (window._partialRendered) updatePartial();
    if (window._hetRendered) updateHeterogeneity();
    if (snapshot.page === 'region') renderRegionPage();
    if (snapshot.sortHelpOpen) document.getElementById('region-sort-help')?.classList.remove('is-hidden');
    if (overviewWasOpen && overviewDrawerState.type === 'evidence') renderEvidenceDrawer(overviewDrawerState.wetland, overviewDrawerState.cluster);
    if (overviewWasOpen && overviewDrawerState.type === 'recommendation') renderRecommendationDrawer();
    if (unitWasOpen && unitDrawerState.cluster) renderUnitEvidenceCard(unitDrawerState.cluster, unitDrawerState.city, unitDrawerState.wetland);
    if (overviewWasOpen || unitWasOpen) document.body.classList.add('drawer-open');
    applyOverviewView();
    resizeActiveCharts();
    restoreLocaleFocus(snapshot.focusId);
}

window.addEventListener('app:localechange', rerenderForLocaleChange);

window.addEventListener('DOMContentLoaded', async () => {
    applyStaticTranslations();
    initSelects();
    await loadAllData();
    initSelects();
    showPage('overview');
});
