/**
 * charts.js — ECharts rendering functions.
 */

const CHART_THEME = {
    textStyle: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
    grid: { left: 60, right: 30, top: 40, bottom: 50, containLabel: true },
};

const CHART_RESIZE_IDS = new Set();

/*
 * Keep chart copy in one place as a resilient fallback for the two supported
 * locales. The application translation catalog takes precedence through t().
 */
const CHART_COPY = {
    'status.unavailableTitle': { en: 'Charts unavailable', zh: '图表暂不可用' },
    'status.libraryUnavailable': {
        en: 'The chart library failed to load. Check your connection or CDN; evidence navigation, AI explanations, and action briefs remain available.',
        zh: '图表库加载失败，请检查网络或 CDN；证据导航、AI 解释和行动简报仍可使用。',
    },
    'status.initializationFailed': { en: 'Chart initialization failed: {message}', zh: '图表初始化失败：{message}' },
    'common.notAvailable': { en: '—', zh: '—' },
    'metrics.cvR2': { en: 'CV R²', zh: '交叉验证 R²' },
    'metrics.shap': { en: 'SHAP', zh: 'SHAP' },
    'metrics.normalized': { en: 'Normalized', zh: '归一化值' },
    'metrics.elasticity': { en: 'Elasticity', zh: '弹性' },
    'metrics.predicted': { en: 'Predicted', zh: '预测值' },
    'visualMap.highR2': { en: 'High R²', zh: '较高 R²' },
    'visualMap.lowR2': { en: 'Low R²', zh: '较低 R²' },
    'visualMap.high': { en: 'High', zh: '高' },
    'visualMap.low': { en: 'Low', zh: '低' },
    'axes.groupMeanAbsShap': { en: 'Group mean |SHAP|', zh: '特征组平均 |SHAP|' },
    'axes.top1ShapValue': { en: 'Top-1 SHAP value', zh: '首位驱动因素 SHAP 值' },
    'axes.meanAbsShap': { en: 'mean |SHAP|', zh: '平均 |SHAP|' },
    'axes.shapValue': { en: 'SHAP value', zh: 'SHAP 值' },
    'axes.predictedArea': { en: 'Predicted area (km²)', zh: '预测面积（km²）' },
    'axes.groupShap': { en: 'Group SHAP', zh: '特征组 SHAP' },
    'axes.meanShap': { en: 'mean SHAP', zh: '平均 SHAP' },
    'table.cityCluster': { en: 'City cluster', zh: '城市群' },
    'table.topDriver': { en: 'Top {rank} driver', zh: '第 {rank} 位驱动因素' },
    'rank.top': { en: 'Top {rank}', zh: '第 {rank} 位' },
    'units.squareKilometres': { en: '{value} km²', zh: '{value} km²' },
    'templates.wetlandCluster': { en: '{wetland} — {cluster}', zh: '{wetland} — {cluster}' },
    'aria.cvHeatmap': { en: 'Cross-validation R-squared heatmap by city cluster and wetland type.', zh: '按城市群和湿地类型展示交叉验证 R² 的热图。' },
    'aria.groupGlobal': { en: 'Global model mean absolute SHAP comparison by feature group and wetland type.', zh: '按特征组和湿地类型比较全样本模型平均绝对 SHAP 值。' },
    'aria.top3': { en: 'Top driver SHAP value by wetland type and city cluster.', zh: '按湿地类型和城市群展示首位驱动因素的 SHAP 值。' },
    'aria.importanceHeatmap': { en: 'Feature-importance heatmap by city cluster.', zh: '按城市群展示特征重要性的热图。' },
    'aria.importanceBar': { en: 'Global model feature-importance ranking.', zh: '全样本模型特征重要性排序。' },
    'aria.dependence': { en: 'SHAP dependence plot for the selected driver.', zh: '所选驱动因素的 SHAP 依赖图。' },
    'aria.partialEffect': { en: 'Partial-effect curve for the selected driver.', zh: '所选驱动因素的部分效应曲线。' },
    'aria.elasticity': { en: 'Elasticity heatmap by city cluster and driver.', zh: '按城市群和驱动因素展示弹性的热图。' },
    'aria.heterogeneityRadar': { en: 'Feature-importance comparison across city clusters.', zh: '跨城市群的特征重要性比较。' },
    'aria.heterogeneityGroup': { en: 'Feature-group importance comparison across city clusters.', zh: '跨城市群的特征组重要性比较。' },
    'aria.heterogeneityDependence': { en: 'Mean SHAP comparison by driver across city clusters.', zh: '跨城市群按驱动因素比较平均 SHAP 值。' },
};

function chartLocale() {
    try { return getLocale() || 'en'; } catch (error) { return 'en'; }
}

function interpolateChartCopy(text, values = {}) {
    return String(text).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

function chartText(key, values = {}) {
    const translationKeys = [`charts.${key}`, `chart.${key}`];
    for (const translationKey of translationKeys) {
        try {
            const translated = t(translationKey, values);
            if (translated && translated !== translationKey) return String(translated);
        } catch (error) {
            console.warn(`Chart translation lookup failed for ${translationKey}:`, error);
        }
    }
    const copy = CHART_COPY[key];
    const fallback = copy?.[String(chartLocale()).toLowerCase().startsWith('zh') ? 'zh' : 'en'] || key;
    return interpolateChartCopy(fallback, values);
}

function chartLabel(namespace, code) {
    try {
        const translated = label(namespace, code);
        if (translated && translated !== code) return String(translated);
    } catch (error) {
        console.warn(`Chart label lookup failed for ${namespace}.${code}:`, error);
    }
    return chartText('common.notAvailable');
}

function globalScopeLabel() {
    const translated = scopeLabel('global');
    return translated === chartText('common.notAvailable')
        ? (chartLocale().toLowerCase().startsWith('zh') ? '全样本' : 'All samples')
        : translated;
}

function wetlandLabel(code) { return chartLabel('wetland', code); }
function clusterLabel(code) { return chartLabel('cluster', code); }
function featureLabel(code) { return chartLabel('feature', code); }
function groupLabel(code) { return chartLabel('featureGroup', code); }
function scopeLabel(code) { return chartLabel('scope', code); }

function safeChartHtml(value) {
    try { return escapeHtml(String(value ?? '')); } catch (error) {
        return String(value ?? '').replace(/[&<>'"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
        }[character]));
    }
}

function formatChartNumber(value, digits = 2) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return chartText('common.notAvailable');
    try { return formatLocalizedNumber(numericValue, digits); } catch (error) {
        return new Intl.NumberFormat(chartLocale(), {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }).format(numericValue);
    }
}

function formatChartArea(value, digits = 2) {
    const formattedValue = formatChartNumber(value, digits);
    const translationKey = 'units.squareKilometres';
    try {
        const translated = t(translationKey, { value: formattedValue });
        if (translated && translated !== translationKey) return String(translated);
    } catch (error) {
        console.warn(`Chart translation lookup failed for ${translationKey}:`, error);
    }
    return interpolateChartCopy(CHART_COPY['units.squareKilometres'][chartLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'], { value: formattedValue });
}

function roundChartValue(value, digits = 4) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    const factor = 10 ** digits;
    return Math.round((numericValue + Number.EPSILON) * factor) / factor;
}

function isEchartsAvailable() {
    return Boolean(window.echarts && typeof window.echarts.init === 'function');
}

function renderChartUnavailable(dom, message = chartText('status.libraryUnavailable')) {
    if (!dom) return;
    try { window.echarts?.getInstanceByDom(dom)?.dispose(); } catch (error) { console.warn('chart_dispose_failed', error); }
    dom.innerHTML = `<div class="loading error-state" role="status" aria-live="polite"><strong>${safeChartHtml(chartText('status.unavailableTitle'))}</strong><p>${safeChartHtml(message)}</p></div>`;
}

function registerChartResize(domId) {
    if (!domId || CHART_RESIZE_IDS.has(domId)) return;
    CHART_RESIZE_IDS.add(domId);
    window.addEventListener('resize', () => {
        const dom = document.getElementById(domId);
        const chart = dom && window.echarts?.getInstanceByDom(dom);
        try { chart?.resize(); } catch (error) { console.warn('chart_resize_skipped', domId, error); }
    });
}

function initChart(domId) {
    const dom = document.getElementById(domId);
    if (!dom) return null;
    if (!isEchartsAvailable()) {
        renderChartUnavailable(dom);
        return null;
    }
    try {
        const existingChart = window.echarts.getInstanceByDom(dom);
        if (existingChart) {
            existingChart.__domId = domId;
            return existingChart;
        }
        if (dom.querySelector('.loading.error-state')) dom.innerHTML = '';
        const chart = window.echarts.init(dom);
        chart.__domId = domId;
        return chart;
    } catch (error) {
        renderChartUnavailable(dom, chartText('status.initializationFailed', { message: error?.message || chartText('common.notAvailable') }));
        return null;
    }
}

function setLocalizedChartOption(chart, option) {
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
    registerChartResize(chart.__domId);
}

function numericAxis(name, digits, extra = {}) {
    const { axisLabel = {}, ...rest } = extra;
    return {
        type: 'value',
        name,
        axisLabel: { ...axisLabel, formatter: value => formatChartNumber(value, digits) },
        ...rest,
    };
}

function heatVisualMap(min, max, digits, colors, rSquared = false) {
    return {
        min,
        ...(max === undefined ? {} : { max }),
        calculable: true,
        orient: 'vertical',
        right: 10,
        top: 'center',
        inRange: { color: colors },
        text: [chartText(rSquared ? 'visualMap.highR2' : 'visualMap.high'), chartText(rSquared ? 'visualMap.lowR2' : 'visualMap.low')],
        formatter: value => formatChartNumber(value, digits),
    };
}

function wetlandClusterText(wetland, cluster) {
    return chartText('templates.wetlandCluster', { wetland: wetlandLabel(wetland), cluster: clusterLabel(cluster) });
}

function tooltipLine(name, value) {
    return `${safeChartHtml(name)}: <b>${safeChartHtml(value)}</b>`;
}

function axisTooltip(params, metricName, digits, valueFormatter = value => formatChartNumber(value, digits)) {
    const points = Array.isArray(params) ? params : [params];
    if (!points.length || !points[0]) return '';
    const category = points[0].axisValueLabel ?? points[0].axisValue ?? '';
    const lines = [safeChartHtml(category)];
    points.forEach(point => {
        lines.push(`${point.marker || ''} ${tooltipLine(point.seriesName, valueFormatter(point.value))}`);
    });
    return lines.join('<br>');
}

function chartAria(key) {
    return { enabled: true, description: chartText(`aria.${key}`) };
}

// ============================================================
// Overview page
// ============================================================

function renderCvHeatmap() {
    const chart = initChart('chart-cv-heatmap');
    if (!chart || !DATA.byCluster) return;

    const cvData = DATA.byCluster.cv_results;
    const data = [];
    const wetlandLabels = WETLAND_TYPES.map(wetlandLabel);
    const clusterLabels = CLUSTERS.map(clusterLabel);

    cvData.forEach(d => {
        const wi = WETLAND_TYPES.indexOf(d.Wetland_Code);
        const ci = CLUSTERS.indexOf(d.Cluster_Code);
        if (wi >= 0 && ci >= 0) data.push([ci, wi, roundChartValue(d.CV_R2_mean, 4)]);
    });

    setLocalizedChartOption(chart, {
        aria: chartAria('cvHeatmap'),
        tooltip: {
            formatter: p => `${safeChartHtml(clusterLabels[p.value[0]])} / ${safeChartHtml(wetlandLabels[p.value[1]])}<br>${tooltipLine(chartText('metrics.cvR2'), formatChartNumber(p.value[2], 4))}`,
        },
        grid: { left: 80, right: 80, top: 20, bottom: 40 },
        xAxis: { type: 'category', data: clusterLabels, axisLabel: { fontSize: 11 } },
        yAxis: { type: 'category', data: wetlandLabels, axisLabel: { fontSize: 11 } },
        visualMap: heatVisualMap(0.8, 1.0, 2, ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#e34a33', '#b30000'], true),
        series: [{
            type: 'heatmap', data,
            label: {
                show: true, fontSize: 11,
                formatter: p => p.value[2] !== undefined ? formatChartNumber(p.value[2], 3) : '',
                color: '#333', textBorderColor: '#fff', textBorderWidth: 2,
            },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
        }],
    });
}

function renderGroupGlobal() {
    const chart = initChart('chart-group-global');
    if (!chart || !DATA.global) return;

    const groupData = DATA.global.shap_importance;
    const groups = Object.keys(GROUP_COLORS);
    const groupLabels = groups.map(groupLabel);
    const series = [];

    WETLAND_TYPES.forEach(wetland => {
        const items = groupData[wetland] || [];
        const groupValues = {};
        groups.forEach(group => { groupValues[group] = 0; });
        items.forEach(d => {
            const group = d.Feature_Group;
            if (groupValues[group] !== undefined) groupValues[group] += d.mean_abs_SHAP;
        });
        groups.forEach(group => {
            const count = (FEATURE_GROUPS[group] || []).length;
            groupValues[group] = count ? groupValues[group] / count : 0;
        });

        series.push({
            name: wetlandLabel(wetland),
            type: 'bar',
            data: groups.map(group => roundChartValue(groupValues[group], 4)),
            itemStyle: { borderWidth: 1, borderColor: '#333' },
        });
    });

    setLocalizedChartOption(chart, {
        aria: chartAria('groupGlobal'),
        tooltip: {
            trigger: 'axis', axisPointer: { type: 'shadow' },
            formatter: params => axisTooltip(params, chartText('axes.groupMeanAbsShap'), 4),
        },
        legend: { data: WETLAND_TYPES.map(wetlandLabel), bottom: 0 },
        grid: { left: 50, right: 20, top: 10, bottom: 50 },
        xAxis: { type: 'category', data: groupLabels },
        yAxis: numericAxis(chartText('axes.groupMeanAbsShap'), 4),
        series,
        color: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3'],
    });
}

function renderTop3() {
    const chart = initChart('chart-top3');
    if (!chart || !DATA.byCluster) return;

    const top3 = DATA.byCluster.top3_features;
    const categories = [];
    const seriesData = [];

    WETLAND_TYPES.forEach(wetland => {
        CLUSTERS.forEach(cluster => {
            categories.push(wetlandClusterText(wetland, cluster));
            const items = top3.filter(d => d.Wetland_Code === wetland && d.Cluster_Code === cluster);
            const top1 = items.find(d => d.Rank === 1);
            if (top1) {
                seriesData.push({
                    value: top1.SHAP_Value,
                    itemStyle: { color: CLUSTER_COLORS[cluster] },
                    featureCode: top1.Feature_Code || top1.Feature,
                });
            } else {
                seriesData.push(0);
            }
        });
    });

    setLocalizedChartOption(chart, {
        aria: chartAria('top3'),
        tooltip: {
            formatter: p => {
                const datum = seriesData[p.dataIndex];
                const featureCode = typeof datum === 'object' ? datum.featureCode : null;
                return [
                    safeChartHtml(categories[p.dataIndex]),
                    tooltipLine(chartText('rank.top', { rank: 1 }), featureCode ? featureLabel(featureCode) : chartText('common.notAvailable')),
                    tooltipLine(chartText('metrics.shap'), formatChartNumber(p.value, 4)),
                ].join('<br>');
            },
        },
        grid: { left: 100, right: 30, top: 10, bottom: 30 },
        xAxis: numericAxis(chartText('axes.top1ShapValue'), 4),
        yAxis: { type: 'category', data: categories, axisLabel: { fontSize: 10 } },
        series: [{ type: 'bar', data: seriesData, barWidth: '60%' }],
    });
}

// ============================================================
// Feature importance page
// ============================================================

let impMode = 'raw';

function renderImportanceHeatmap(wetland, mode) {
    const chart = initChart('chart-imp-heatmap');
    if (!chart || !DATA.byCluster) return;

    const shapData = DATA.byCluster.shap_importance;
    const items = shapData[wetland] || {};
    const features = FEATURES.map(featureLabel);
    const matrix = [];

    CLUSTERS.forEach((cluster, ci) => {
        const clusterItems = items[cluster] || [];
        FEATURES.forEach((feature, fi) => {
            const found = clusterItems.find(d => d.Feature === feature);
            matrix.push([ci, fi, roundChartValue(found ? found.mean_abs_SHAP : 0, 4)]);
        });
    });

    let option;
    if (mode === 'norm') {
        const maxByCluster = {};
        matrix.forEach(d => { maxByCluster[d[0]] = Math.max(maxByCluster[d[0]] || 0, d[2]); });
        const normData = matrix.map(d => [d[0], d[1], maxByCluster[d[0]] > 0 ? roundChartValue(d[2] / maxByCluster[d[0]], 3) : 0]);

        option = {
            aria: chartAria('importanceHeatmap'),
            tooltip: {
                formatter: p => `${safeChartHtml(clusterLabel(CLUSTERS[p.value[0]]))} / ${safeChartHtml(features[p.value[1]])}<br>${tooltipLine(chartText('metrics.normalized'), formatChartNumber(p.value[2], 2))}`,
            },
            grid: { left: 100, right: 80, top: 10, bottom: 40 },
            xAxis: { type: 'category', data: CLUSTERS.map(clusterLabel) },
            yAxis: { type: 'category', data: features },
            visualMap: heatVisualMap(0, 1, 2, ['#fff', '#fee0d2', '#fc9272', '#de2d26', '#a50f15']),
            series: [{ type: 'heatmap', data: normData, label: { show: true, fontSize: 9, formatter: p => p.value[2] !== undefined ? formatChartNumber(p.value[2], 2) : '', color: '#333', textBorderColor: '#fff', textBorderWidth: 2 } }],
        };
    } else if (mode === 'group') {
        const groups = Object.keys(FEATURE_GROUPS);
        const groupLabels = groups.map(groupLabel);
        const groupMatrix = [];
        CLUSTERS.forEach((cluster, ci) => {
            const clusterItems = items[cluster] || [];
            groups.forEach((group, gi) => {
                const featureCodes = FEATURE_GROUPS[group];
                let sum = 0;
                let count = 0;
                featureCodes.forEach(feature => {
                    const found = clusterItems.find(d => d.Feature === feature);
                    if (found) { sum += found.mean_abs_SHAP; count++; }
                });
                groupMatrix.push([ci, gi, count > 0 ? roundChartValue(sum / count, 4) : 0]);
            });
        });

        option = {
            aria: chartAria('importanceHeatmap'),
            tooltip: {
                formatter: p => `${safeChartHtml(clusterLabel(CLUSTERS[p.value[0]]))} / ${safeChartHtml(groupLabels[p.value[1]])}<br>${tooltipLine(chartText('metrics.shap'), formatChartNumber(p.value[2], 4))}`,
            },
            grid: { left: 80, right: 80, top: 10, bottom: 40 },
            xAxis: { type: 'category', data: CLUSTERS.map(clusterLabel) },
            yAxis: { type: 'category', data: groupLabels },
            visualMap: heatVisualMap(0, undefined, 4, ['#fff', '#fee0d2', '#fc9272', '#de2d26', '#a50f15']),
            series: [{ type: 'heatmap', data: groupMatrix, label: { show: true, fontSize: 11, formatter: p => p.value[2] !== undefined ? formatChartNumber(p.value[2], 4) : '', color: '#333', textBorderColor: '#fff', textBorderWidth: 2 } }],
        };
    } else {
        option = {
            aria: chartAria('importanceHeatmap'),
            tooltip: {
                formatter: p => `${safeChartHtml(clusterLabel(CLUSTERS[p.value[0]]))} / ${safeChartHtml(features[p.value[1]])}<br>${tooltipLine(chartText('metrics.shap'), formatChartNumber(p.value[2], 4))}`,
            },
            grid: { left: 100, right: 80, top: 10, bottom: 40 },
            xAxis: { type: 'category', data: CLUSTERS.map(clusterLabel) },
            yAxis: { type: 'category', data: features },
            visualMap: heatVisualMap(0, undefined, 4, ['#fff', '#fee0d2', '#fc9272', '#de2d26', '#a50f15']),
            series: [{ type: 'heatmap', data: matrix, label: { show: true, fontSize: 9, formatter: p => p.value[2] !== undefined ? formatChartNumber(p.value[2], 4) : '', color: '#333', textBorderColor: '#fff', textBorderWidth: 2 } }],
        };
    }

    setLocalizedChartOption(chart, option);
}

function renderImportanceBar(wetland) {
    const chart = initChart('chart-imp-bar');
    if (!chart || !DATA.global) return;

    const items = DATA.global.shap_importance[wetland] || [];
    const sorted = [...items].sort((a, b) => a.mean_abs_SHAP - b.mean_abs_SHAP);
    const featureCodes = sorted.map(d => d.Feature);

    setLocalizedChartOption(chart, {
        aria: chartAria('importanceBar'),
        tooltip: {
            formatter: p => tooltipLine(featureLabel(featureCodes[p.dataIndex]), formatChartNumber(p.value, 4)),
        },
        grid: { left: 100, right: 30, top: 10, bottom: 20 },
        xAxis: numericAxis(chartText('axes.meanAbsShap'), 4),
        yAxis: { type: 'category', data: featureCodes.map(featureLabel) },
        series: [{
            type: 'bar',
            data: sorted.map(d => ({
                value: d.mean_abs_SHAP,
                itemStyle: { color: GROUP_COLORS[d.Feature_Group] || '#999' },
            })),
            barWidth: '60%',
        }],
    });
}

// ============================================================
// Dependence page
// ============================================================

let depMode = 'single';

function renderDependence(wetland, feature, cluster, mode) {
    const chart = initChart('chart-dependence');
    if (!chart || !DATA.dependence) return;

    const depData = DATA.dependence;

    if (mode === 'compare') {
        const series = [];
        ['global', ...CLUSTERS].forEach(scope => {
            const points = depData[wetland]?.[scope]?.[feature];
            if (!points) return;
            const scatterData = points.feature_values.map((value, index) => [value, points.shap_values[index]]);
            series.push({
                name: scope === 'global' ? globalScopeLabel() : clusterLabel(scope),
                type: 'scatter',
                data: scatterData,
                symbolSize: 6,
                itemStyle: { opacity: 0.4, color: scope === 'global' ? '#333' : CLUSTER_COLORS[scope] },
            });
        });

        setLocalizedChartOption(chart, {
            aria: chartAria('dependence'),
            tooltip: {
                trigger: 'item',
                formatter: p => [
                    safeChartHtml(p.seriesName),
                    tooltipLine(featureLabel(feature), formatChartNumber(p.value[0], 2)),
                    tooltipLine(chartText('metrics.shap'), formatChartNumber(p.value[1], 4)),
                ].join('<br>'),
            },
            legend: { data: series.map(item => item.name), bottom: 0 },
            grid: { left: 60, right: 30, top: 20, bottom: 50 },
            xAxis: numericAxis(featureLabel(feature), 2, { nameLocation: 'center', nameGap: 30 }),
            yAxis: numericAxis(chartText('axes.shapValue'), 4),
            series,
        });
    } else {
        const points = depData[wetland]?.[cluster]?.[feature];
        if (!points) return;
        const scatterData = points.feature_values.map((value, index) => [value, points.shap_values[index]]);

        setLocalizedChartOption(chart, {
            aria: chartAria('dependence'),
            tooltip: {
                trigger: 'item',
                formatter: p => [
                    tooltipLine(featureLabel(feature), formatChartNumber(p.value[0], 2)),
                    tooltipLine(chartText('metrics.shap'), formatChartNumber(p.value[1], 4)),
                ].join('<br>'),
            },
            grid: { left: 60, right: 30, top: 20, bottom: 50 },
            xAxis: numericAxis(featureLabel(feature), 2, { nameLocation: 'center', nameGap: 30 }),
            yAxis: numericAxis(chartText('axes.shapValue'), 4),
            series: [{
                type: 'scatter', data: scatterData, symbolSize: 8,
                itemStyle: { color: '#1a73e8', opacity: 0.5 },
            }],
        });
    }
}

// ============================================================
// Partial-effect page
// ============================================================

let peMode = 'single';

function renderPartialEffect(wetland, feature, cluster, mode) {
    const chart = initChart('chart-partial');
    if (!chart || !DATA.partialEffect) return;

    const peData = DATA.partialEffect;

    if (mode === 'compare') {
        const series = [];
        ['global', ...CLUSTERS].forEach(scope => {
            const curve = peData[wetland]?.[scope]?.[feature];
            if (!curve) return;
            series.push({
                name: scope === 'global' ? globalScopeLabel() : clusterLabel(scope),
                type: 'line',
                data: curve.values.map((value, index) => [value, curve.pred_orig[index]]),
                smooth: true,
                lineStyle: { width: scope === 'global' ? 3 : 2, type: scope === 'global' ? 'dashed' : 'solid' },
                itemStyle: { color: scope === 'global' ? '#333' : CLUSTER_COLORS[scope] },
            });
        });

        setLocalizedChartOption(chart, {
            aria: chartAria('partialEffect'),
            tooltip: {
                trigger: 'axis',
                formatter: params => {
                    const points = Array.isArray(params) ? params : [params];
                    if (!points.length || !points[0]) return '';
                    const lines = [tooltipLine(featureLabel(feature), formatChartNumber(points[0].value[0], 2))];
                    points.forEach(point => lines.push(`${point.marker || ''} ${tooltipLine(point.seriesName, formatChartArea(point.value[1], 2))}`));
                    return lines.join('<br>');
                },
            },
            legend: { data: series.map(item => item.name), bottom: 0 },
            grid: { left: 60, right: 30, top: 20, bottom: 50 },
            xAxis: numericAxis(featureLabel(feature), 2, { nameLocation: 'center', nameGap: 30 }),
            yAxis: numericAxis(chartText('axes.predictedArea'), 2),
            series,
        });
    } else {
        const curve = peData[wetland]?.[cluster]?.[feature];
        if (!curve) return;

        setLocalizedChartOption(chart, {
            aria: chartAria('partialEffect'),
            tooltip: {
                trigger: 'axis',
                formatter: params => {
                    const point = Array.isArray(params) ? params[0] : params;
                    if (!point) return '';
                    return [
                        tooltipLine(featureLabel(feature), formatChartNumber(point.value[0], 2)),
                        tooltipLine(chartText('metrics.predicted'), formatChartArea(point.value[1], 2)),
                    ].join('<br>');
                },
            },
            grid: { left: 60, right: 30, top: 20, bottom: 50 },
            xAxis: numericAxis(featureLabel(feature), 2, { nameLocation: 'center', nameGap: 30 }),
            yAxis: numericAxis(chartText('axes.predictedArea'), 2),
            series: [{
                type: 'line', data: curve.values.map((value, index) => [value, curve.pred_orig[index]]),
                smooth: true, lineStyle: { width: 3, color: '#1a73e8' },
                areaStyle: { color: 'rgba(26,115,232,0.1)' },
            }],
        });
    }
}

function renderElasticityHeatmap(wetland) {
    const chart = initChart('chart-elasticity');
    if (!chart || !DATA.partialEffectSummary) return;

    const summary = DATA.partialEffectSummary;
    const data = [];

    CLUSTERS.forEach((cluster, ci) => {
        FEATURES.forEach((feature, fi) => {
            const found = summary.find(d => d.Wetland_Code === wetland && d.Cluster_Code === cluster && d.Feature_Code === feature);
            data.push([ci, fi, roundChartValue(found ? found.Elasticity : 0, 4)]);
        });
    });

    setLocalizedChartOption(chart, {
        aria: chartAria('elasticity'),
        tooltip: {
            formatter: p => `${safeChartHtml(clusterLabel(CLUSTERS[p.value[0]]))} / ${safeChartHtml(featureLabel(FEATURES[p.value[1]]))}<br>${tooltipLine(chartText('metrics.elasticity'), formatChartNumber(p.value[2], 4))}`,
        },
        grid: { left: 100, right: 80, top: 10, bottom: 40 },
        xAxis: { type: 'category', data: CLUSTERS.map(clusterLabel) },
        yAxis: { type: 'category', data: FEATURES.map(featureLabel) },
        visualMap: heatVisualMap(0, undefined, 4, ['#fff', '#fee0d2', '#fc9272', '#de2d26', '#a50f15']),
        series: [{ type: 'heatmap', data, label: { show: true, fontSize: 9, formatter: p => p.value[2] !== undefined ? formatChartNumber(p.value[2], 3) : '', color: '#333', textBorderColor: '#fff', textBorderWidth: 2 } }],
    });
}

// ============================================================
// Heterogeneity page
// ============================================================

function renderHetRadar(wetland) {
    const chart = initChart('chart-het-radar');
    if (!chart || !DATA.byCluster) return;

    const shapData = DATA.byCluster.shap_importance;
    const items = shapData[wetland] || {};
    const featureLabels = FEATURES.map(featureLabel);

    let maxVal = 0;
    CLUSTERS.forEach(cluster => {
        const clusterItems = items[cluster] || [];
        clusterItems.forEach(d => { maxVal = Math.max(maxVal, d.mean_abs_SHAP); });
    });

    const indicator = featureLabels.map(name => ({ name, max: maxVal * 1.1 }));
    const seriesData = [];

    CLUSTERS.forEach(cluster => {
        const clusterItems = items[cluster] || [];
        const values = FEATURES.map(feature => {
            const found = clusterItems.find(d => d.Feature === feature);
            return found ? found.mean_abs_SHAP : 0;
        });
        seriesData.push({
            name: clusterLabel(cluster),
            value: values,
            lineStyle: { width: 2 },
            areaStyle: { opacity: 0.1 },
        });
    });

    setLocalizedChartOption(chart, {
        aria: chartAria('heterogeneityRadar'),
        tooltip: {
            formatter: p => {
                const values = Array.isArray(p.value) ? p.value : [];
                const lines = [safeChartHtml(p.name)];
                FEATURES.forEach((feature, index) => lines.push(tooltipLine(featureLabel(feature), formatChartNumber(values[index], 4))));
                return lines.join('<br>');
            },
        },
        legend: { data: CLUSTERS.map(clusterLabel), bottom: 0 },
        radar: { indicator, radius: '65%', axisName: { fontSize: 10 } },
        series: [{ type: 'radar', data: seriesData }],
        color: CLUSTERS.map(cluster => CLUSTER_COLORS[cluster]),
    });
}

function renderHetGroup(wetland) {
    const chart = initChart('chart-het-group');
    if (!chart || !DATA.byCluster) return;

    const groupData = DATA.byCluster.group_importance;
    const groups = Object.keys(GROUP_COLORS);
    const wetlandGroup = groupData[wetland] || {};

    const series = CLUSTERS.map(cluster => ({
        name: clusterLabel(cluster),
        type: 'bar',
        data: groups.map(group => roundChartValue(wetlandGroup[cluster]?.[group] || 0, 4)),
    }));

    setLocalizedChartOption(chart, {
        aria: chartAria('heterogeneityGroup'),
        tooltip: {
            trigger: 'axis', axisPointer: { type: 'shadow' },
            formatter: params => axisTooltip(params, chartText('axes.groupShap'), 4),
        },
        legend: { data: CLUSTERS.map(clusterLabel), bottom: 0, textStyle: { fontSize: 10 } },
        grid: { left: 50, right: 20, top: 10, bottom: 50 },
        xAxis: { type: 'category', data: groups.map(groupLabel) },
        yAxis: numericAxis(chartText('axes.groupShap'), 4),
        series,
        color: CLUSTERS.map(cluster => CLUSTER_COLORS[cluster]),
    });
}

function renderHetTop3Table(wetland) {
    const container = document.getElementById('het-top3-table');
    if (!container || !DATA.byCluster) return;

    const top3 = DATA.byCluster.top3_features;
    const featureCell = item => {
        const featureCode = item?.Feature_Code || item?.Feature;
        const feature = featureCode ? featureLabel(featureCode) : chartText('common.notAvailable');
        return `${safeChartHtml(feature)} (${safeChartHtml(formatChartNumber(item?.SHAP_Value || 0, 4))})`;
    };
    const rows = CLUSTERS.map(cluster => {
        const items = top3.filter(d => d.Wetland_Code === wetland && d.Cluster_Code === cluster);
        const top1 = items.find(d => d.Rank === 1);
        const top2 = items.find(d => d.Rank === 2);
        const top3item = items.find(d => d.Rank === 3);
        return `<tr>
            <td><b>${safeChartHtml(clusterLabel(cluster))}</b></td>
            <td>${featureCell(top1)}</td>
            <td>${featureCell(top2)}</td>
            <td>${featureCell(top3item)}</td>
        </tr>`;
    });

    container.innerHTML = `<table>
        <thead><tr><th>${safeChartHtml(chartText('table.cityCluster'))}</th><th>${safeChartHtml(chartText('table.topDriver', { rank: 1 }))}</th><th>${safeChartHtml(chartText('table.topDriver', { rank: 2 }))}</th><th>${safeChartHtml(chartText('table.topDriver', { rank: 3 }))}</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
    </table>`;
}

function renderHetDep(wetland) {
    const chart = initChart('chart-het-dep');
    if (!chart || !DATA.dependenceSummary) return;

    const summary = DATA.dependenceSummary;
    const series = [];

    CLUSTERS.forEach(cluster => {
        const values = FEATURES.map(feature => {
            const found = summary.find(d =>
                d.Level === 'Cluster' && d.Wetland_Code === wetland &&
                d.Cluster_Code === cluster && d.Feature_Code === feature);
            return found ? found.mean_SHAP : 0;
        });
        series.push({
            name: clusterLabel(cluster),
            type: 'line',
            data: values,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
        });
    });

    setLocalizedChartOption(chart, {
        aria: chartAria('heterogeneityDependence'),
        tooltip: {
            trigger: 'axis',
            formatter: params => axisTooltip(params, chartText('axes.meanShap'), 4),
        },
        legend: { data: CLUSTERS.map(clusterLabel), bottom: 0 },
        grid: { left: 60, right: 30, top: 20, bottom: 50 },
        xAxis: { type: 'category', data: FEATURES.map(featureLabel), axisLabel: { rotate: 45, fontSize: 10 } },
        yAxis: numericAxis(chartText('axes.meanShap'), 4),
        series,
        color: CLUSTERS.map(cluster => CLUSTER_COLORS[cluster]),
    });
}
