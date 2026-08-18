import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'web', 'web', 'js', 'i18n.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'web', 'web', 'index.html'), 'utf8');

function loadI18n({ storedLocale = null, languages = [], language = undefined, pathname = '/web/web/index.html' } = {}) {
    const storage = new Map(storedLocale ? [['wetland-dashboard:locale:https://example.test/web/web/', storedLocale]] : []);
    const domListeners = new Map();
    const document = {
        title: '',
        documentElement: { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } },
        addEventListener(type, handler) { domListeners.set(type, handler); },
        querySelectorAll() { return []; },
    };
    const events = [];
    const window = {
        document,
        navigator: { languages, language },
        location: { origin: 'https://example.test', pathname },
        localStorage: {
            getItem(key) { return storage.get(key) ?? null; },
            setItem(key, value) { storage.set(key, String(value)); },
        },
        CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
        dispatchEvent(event) { events.push(event); },
        Intl,
    };
    vm.runInNewContext(source, { window, Intl, Number, Object, String, Array, Date, RegExp, console }, { filename: 'i18n.js' });
    return { i18n: window.I18N, storage, events, document, domListeners };
}

const app = loadI18n({ storedLocale: 'en-US', languages: ['zh-CN'] });
assert.equal(app.i18n.getLocale(), 'en', 'saved locale wins over navigator preferences');
assert.equal(app.i18n.test.dictionaryParity(), true, 'zh-CN and en dictionaries must have identical keys');
assert.deepEqual([...Object.keys(app.i18n.dictionaries['zh-CN'])].sort(), [...Object.keys(app.i18n.dictionaries.en)].sort());
const markupKeys = [...indexHtml.matchAll(/data-i18n(?:-(?:aria-label|placeholder|title))?="([^"]+)"/g)].map(match => match[1]);
for (const key of new Set(markupKeys)) {
    assert.ok(Object.hasOwn(app.i18n.dictionaries['zh-CN'], key), `zh-CN dictionary contains markup key ${key}`);
    assert.ok(Object.hasOwn(app.i18n.dictionaries.en, key), `en dictionary contains markup key ${key}`);
}
assert.match(indexHtml, /id="page-methods"/);
assert.match(indexHtml, /showPage\('methods'\)/);
const overviewHero = indexHtml.slice(indexHtml.indexOf('<section class="overview-hero">'), indexHtml.indexOf('<section class="notice notice-info">'));
assert.doesNotMatch(overviewHero, /湿地守望|openRecommendationDrawer|overview\.recommendation/, 'the overview hero stays academic and contains no recommendation action');
assert.match(overviewHero, /双向固定效应模型/);
assert.match(overviewHero, /class="overview-hero-intro"/);
assert.match(overviewHero, /class="stat-cards overview-stats"/, 'overview statistics are integrated into the hero');
const methodsOutput = indexHtml.slice(indexHtml.indexOf('methods-output-title'), indexHtml.indexOf('methods-boundary-title'));
const [methodsReaderView, methodsTechnicalTrace] = methodsOutput.split('<details class="methods-technical-trace">');
assert.doesNotMatch(methodsReaderView, /evidence\/data\/|bundle_id|SHA-256/, 'the methods table uses reader-facing artifact names');
assert.match(methodsTechnicalTrace, /evidence\/data\/authoritative\/wetland_panel\.xlsx/);
assert.match(methodsTechnicalTrace, /evidence_bundle\.json · manifest\.json/);

assert.equal(app.i18n.normalizeLocale('ZH_hans_cn'), 'zh-CN');
assert.equal(app.i18n.normalizeLocale('en-GB'), 'en');
assert.equal(app.i18n.normalizeLocale('fr-FR'), null);
assert.equal(app.i18n.normalizeLocale('fr-FR', 'zh-CN'), 'zh-CN');
assert.equal(loadI18n({ languages: ['en-GB', 'zh-CN'] }).i18n.getLocale(), 'en');
assert.equal(loadI18n({ languages: ['fr-FR'] }).i18n.getLocale(), 'zh-CN');
assert.match(app.i18n.storageKey, /https:\/\/example\.test\/web\/web\/$/);
assert.notEqual(app.i18n.storageKey, loadI18n({ pathname: '/another/index.html' }).i18n.storageKey, 'storage key is project-path scoped');

assert.equal(app.i18n.label('wetland', 'Mangrove'), 'Mangrove');
assert.equal(app.i18n.label('cluster', 'BYS'), 'Bohai Sea');
assert.equal(app.i18n.label('feature', 'Temp_Mean_C'), 'Mean Temperature');
assert.equal(app.i18n.label('featureGroup', 'Climate'), 'Climate');
assert.equal(app.i18n.label('scope', 'global'), 'All samples');
assert.equal(app.i18n.label('figure14.High', 'label'), 'High-priority review');
assert.match(app.i18n.label('figure14', 'boundary'), /not future-risk probabilities/i);
assert.equal(app.i18n.label('evidenceType', 'MODEL_ATTRIBUTION'), 'Model attribution');
assert.equal(app.i18n.label('audience', 'ngo_internal'), 'NGO internal');
assert.equal(app.i18n.label('taskType', 'field_monitoring'), 'Field monitoring');
assert.equal(app.i18n.label('taskStatus', 'in_progress'), 'In progress');
assert.equal(app.i18n.label('trend', 'decrease'), 'Historical decrease');
assert.equal(app.i18n.label('answerStatus', 'needs_review'), 'Needs review');
assert.equal(app.i18n.label('wetland', 'UnmappedWetland'), 'UnmappedWetland', 'unknown stable codes are preserved');

assert.equal(app.i18n.t('common.global'), 'All samples', 'global means all samples, not the world');
assert.equal(app.i18n.t('nav.methods'), 'Data & Methods');
assert.equal(app.i18n.t('overview.title'), 'Historical Change and Model Interpretation of Coastal Wetlands');
assert.match(app.i18n.t('overview.copy'), /exploratory, auditable results/);
assert.match(app.i18n.t('overview.copy'), /do not constitute causal identification/);
assert.equal(app.i18n.t('matrixEvidence.whyReviewTitle'), 'Why this cell needs review');
assert.equal(app.i18n.t('matrixEvidence.interpretationTitle'), 'How to interpret these results');
assert.match(app.i18n.t('matrixEvidence.shap.found', { features: 'Cropland' }), /Importance does not imply causality/);
assert.equal(app.i18n.t('scope.global'), 'All samples');
assert.match(app.i18n.t('figure14.boundary'), /not future-risk probabilities/i);
assert.doesNotMatch(app.i18n.t('figure14.boundary'), /future[- ]risk probability\.$/i, 'boundary is a statement, not a probability value');
assert.equal(app.i18n.t('missing.translation.key'), 'missing.translation.key');

assert.equal(app.i18n.formatLocalizedNumber(1234.56), '1,234.6');
assert.equal(app.i18n.formatLocalizedPercent(0.1234), '12.3%');
assert.equal(app.i18n.formatLocalizedNumber('not-a-number'), 'Not computable');
assert.equal(app.i18n.escapeHtml('<a href="x">Tom & Jerry</a>'), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;');

app.i18n.setLocale('zh-CN');
assert.equal(app.i18n.getLocale(), 'zh-CN');
assert.equal(app.storage.get(app.i18n.storageKey), 'zh-CN');
assert.equal(app.i18n.label('wetland', 'Mangrove'), '红树林');
assert.equal(app.i18n.t('common.global'), '全样本');
assert.equal(app.i18n.t('overview.title'), '沿海湿地历史变化与模型解释');
assert.match(app.i18n.t('overview.copy'), /提供可复核的探索性结果/);
assert.match(app.i18n.t('overview.copy'), /不构成因果识别、生态成效评价或未来风险预测/);
assert.equal(app.i18n.t('matrixEvidence.whyReviewTitle'), '为什么这个单元值得复核');
assert.equal(app.i18n.t('matrixEvidence.interpretationTitle'), '如何理解这些结果');
assert.match(app.i18n.t('matrixEvidence.shap.found', { features: '耕地面积' }), /重要性不代表因果关系/);
assert.match(app.i18n.t('figure14.boundary'), /不代表未来风险概率/);
assert.equal(app.i18n.formatLocalizedPercent(0.1234), '12.3%');
assert.equal(app.events.at(-1).type, 'app:localechange');
assert.equal(app.events.at(-1).detail.locale, 'zh-CN');
assert.equal(app.events.at(-1).detail.previousLocale, 'en');

console.log('i18n tests passed');
