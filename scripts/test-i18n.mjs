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
assert.match(app.i18n.t('figure14.boundary'), /不代表未来风险概率/);
assert.equal(app.i18n.formatLocalizedPercent(0.1234), '12.3%');
assert.equal(app.events.at(-1).type, 'app:localechange');
assert.equal(app.events.at(-1).detail.locale, 'zh-CN');
assert.equal(app.events.at(-1).detail.previousLocale, 'en');

console.log('i18n tests passed');
