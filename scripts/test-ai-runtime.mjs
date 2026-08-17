import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(root, 'web', 'web');
const read = filename => fs.readFileSync(path.join(webRoot, filename), 'utf8');
const readJson = filename => JSON.parse(read(`data/${filename}`));

const listeners = new Map();
const elements = new Map();
const document = {
    documentElement: { setAttribute() {} },
    addEventListener(type, handler) { listeners.set(type, handler); },
    querySelectorAll() { return []; },
    getElementById(id) { return elements.get(id) || null; },
};
const window = {
    document,
    navigator: { languages: ['en'] },
    location: { origin: 'https://example.test', pathname: '/index.html' },
    localStorage: { getItem() { return 'en'; }, setItem() {} },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    dispatchEvent() {},
    addEventListener() {},
    console,
};
const context = vm.createContext({ window, document, console, Intl, Number, Object, String, Array, Date, RegExp, Map, Set });
for (const filename of ['js/i18n.js', 'js/data.js', 'js/ai_explain.js']) vm.runInContext(read(filename), context, { filename });
vm.runInContext('var getLocale = window.getLocale; var t = window.t; var label = window.label; var escapeHtml = window.escapeHtml; var formatLocalizedNumber = window.formatLocalizedNumber; var formatLocalizedPercent = window.formatLocalizedPercent;', context);
context.__evidence = readJson('evidence_bundle.json');
context.__aiInputs = readJson('ai_explanation_inputs.json');
vm.runInContext('DATA.evidenceBundle = indexEvidenceBundle(__evidence); DATA.aiInputs = indexAiInputs(__aiInputs); this.__api = { selectEvidencePacket, generateDeterministicExplanation, validateExplanationClientSide, CLUSTERS, WETLAND_TYPES };', context);
const api = context.__api;

const packets = context.__aiInputs.input_packets;
assert.equal(context.__aiInputs._packetById.size, packets.length, 'all packet IDs remain independently addressable');

for (const packet of packets) {
    const scope = packet.scope || {};
    const selected = api.selectEvidencePacket(packet.question_text, {
        cluster: scope.cluster_code,
        wetland: scope.wetland_code,
        unit: scope.unit_code || null,
        compareCluster: scope.compare_cluster_code || null,
    });
    assert.ok(selected, `packet should be selectable for ${packet.question_id}`);
    assert.equal(selected.question_id, packet.question_id, `exact question should select its packet for ${packet.question_id}`);
    const output = api.generateDeterministicExplanation(selected, 'public', packet.question_text);
    const validation = api.validateExplanationClientSide(output, selected);
    assert.equal(validation.ok, true, `${packet.question_id} should pass client validation: ${validation.errors.join('; ')}`);
    assert.equal(output.answer_status === 'out_of_scope', packet.question_intent === 'out_of_scope', `${packet.question_id} status should match declared intent`);
}

const covered = new Set(packets
    .filter(packet => packet.question_intent === 'explain_evidence' && !packet.scope?.unit_code && !packet.scope?.compare_cluster_code)
    .map(packet => `${packet.scope.cluster_code}::${packet.scope.wetland_code}`));
let unsupported = 0;
for (const cluster of api.CLUSTERS) {
    for (const wetland of api.WETLAND_TYPES) {
        const packet = api.selectEvidencePacket('Explain the evidence.', { cluster, wetland, unit: null, compareCluster: null });
        if (covered.has(`${cluster}::${wetland}`)) {
            assert.ok(packet, `covered scope ${cluster}/${wetland} should resolve`);
            assert.equal(packet.scope.cluster_code, cluster);
            assert.equal(packet.scope.wetland_code, wetland);
        } else {
            unsupported += 1;
            assert.equal(packet, null, `unsupported scope ${cluster}/${wetland} must not receive unrelated evidence`);
        }
    }
}
assert.equal(unsupported, 17);

const mismatchedExact = packets.find(packet => packet.question_id === 'q01');
assert.equal(api.selectEvidencePacket(mismatchedExact.question_text, { cluster: 'HX', wetland: 'Marsh', unit: null, compareCluster: null }), null, 'an exact template must not override a different selected scope');

console.log('AI runtime tests passed');
