import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'web', 'web', 'data');
const readJson = filename => JSON.parse(fs.readFileSync(path.join(dataDir, filename), 'utf8'));

const evidence = readJson('evidence_bundle.json');
const ai = readJson('ai_explanation_inputs.json');
const legacyFiles = [
    'global.json',
    'by_cluster.json',
    'dependence.json',
    'dependence_summary.json',
    'partial_effect.json',
    'partial_effect_summary.json',
];
legacyFiles.forEach(readJson);

assert.equal(evidence.schema_version, '1.0.0');
assert.equal(evidence.contract_id, 'wetland-ai-day01-evidence-contract');
assert.equal(evidence.contract_version, '1.0.0');
assert.equal(evidence.enumerations.wetlands.length, 4);
assert.equal(evidence.enumerations.clusters.length, 5);
assert.equal(evidence.cluster_summary.length, 20);
assert.equal(evidence.unit_evidence.length, 212);

const unique = (items, key, description) => {
    const values = items.map(key);
    assert.equal(new Set(values).size, values.length, `${description} must be unique`);
};
unique(evidence.cluster_summary, item => `${item.wetland_code}::${item.cluster_code}`, 'cluster summary keys');
unique(evidence.unit_evidence, item => `${item.cluster_code}::${item.city}::${item.wetland_code}`, 'unit evidence keys');

const canonicalEvidence = [];
for (const summary of evidence.cluster_summary) {
    if (summary.trend?.evidence_id) canonicalEvidence.push(summary.trend);
    canonicalEvidence.push(...(summary.model_summary?.evidence || []));
}
for (const unit of evidence.unit_evidence) canonicalEvidence.push(...(unit.evidence || []));
canonicalEvidence.push(...(evidence.model_evidence || []));
const evidenceById = new Map();
for (const record of canonicalEvidence) {
    if (!record.evidence_id) continue;
    const serialized = JSON.stringify(record);
    if (evidenceById.has(record.evidence_id)) assert.equal(evidenceById.get(record.evidence_id), serialized, `canonical evidence differs for ${record.evidence_id}`);
    else evidenceById.set(record.evidence_id, serialized);
}
assert.equal(evidenceById.size, 833);
unique(evidence.quality_flags, item => item.flag_id, 'quality flag IDs');
assert.equal(evidence.quality_flags.length, 187);

assert.equal(ai.schema_version, '1.0.0');
assert.equal(ai.contract_id, evidence.contract_id);
assert.equal(ai.contract_version, evidence.contract_version);
assert.equal(ai.bundle_id, evidence.bundle_id);
assert.equal(ai.question_templates.length, 20);
assert.equal(ai.input_packets.length, 21);
unique(ai.input_packets, packet => packet.input_id, 'Day 7 input IDs');

let copiedEvidenceCount = 0;
for (const packet of ai.input_packets) {
    assert.ok(packet.input_id);
    assert.ok(packet.question_id);
    assert.ok(packet.question_intent);
    for (const record of packet.evidence_records || []) {
        copiedEvidenceCount += 1;
        assert.ok(evidenceById.has(record.evidence_id), `orphan packet evidence ${record.evidence_id}`);
        assert.equal(JSON.stringify(record), evidenceById.get(record.evidence_id), `packet evidence differs from canonical record ${record.evidence_id}`);
    }
}
assert.equal(copiedEvidenceCount, 169);

console.log('data contract tests passed');
