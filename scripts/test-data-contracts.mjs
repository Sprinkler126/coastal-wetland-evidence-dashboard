import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'web', 'web', 'data');
const readJson = filename => JSON.parse(fs.readFileSync(path.join(dataDir, filename), 'utf8'));
const readProjectJson = filename => JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
const fileDigest = filename => {
    const bytes = fs.readFileSync(filename);
    return { bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};

const manifest = readJson('manifest.json');
const evidence = readJson('evidence_bundle.json');
const contract = readProjectJson('evidence/contracts/evidence_contract.json');
const evidenceSchema = readProjectJson('evidence/contracts/evidence_bundle.schema.json');
const legacyFiles = [
    'global.json',
    'by_cluster.json',
    'dependence.json',
    'dependence_summary.json',
    'partial_effect.json',
    'partial_effect_summary.json',
];
legacyFiles.forEach(readJson);
assert.equal(manifest.schema_version, '1.0.0');
assert.equal(manifest.bundle_id, evidence.bundle_id);
for (const key of ['global', 'byCluster', 'dependence', 'dependenceSummary', 'partialEffect', 'partialEffectSummary', 'evidenceBundle', 'screeningEvidence']) {
    assert.ok(manifest.datasets[key], `manifest dataset ${key} is declared`);
}
for (const [key, entry] of Object.entries(manifest.datasets)) {
    assert.ok(entry?.file, `manifest dataset ${key} is declared`);
    const { bytes, sha256 } = fileDigest(path.join(dataDir, entry.file));
    assert.equal(sha256, entry.sha256, `manifest hash matches ${key}`);
    assert.equal(bytes.length, entry.size_bytes, `manifest size matches ${key}`);
}

assert.equal(evidence.schema_version, '1.0.0');
assert.equal(evidence.contract_id, 'coastal-wetland-evidence-contract');
assert.equal(evidence.contract_version, '1.0.0');
assert.equal(evidence.generated_by.script, 'scripts/evidence/build_evidence_bundle.py');
assert.equal(contract.contract_id, evidence.contract_id);
assert.equal(contract.contract_version, evidence.contract_version);
assert.equal(evidenceSchema.contract_reference, 'evidence/contracts/evidence_contract.json');
assert.doesNotMatch(JSON.stringify({ contract, evidenceSchema, generatedBy: evidence.generated_by }), /day\s*\d+/i, 'active evidence contracts do not use stage-number naming');

for (const source of evidence.source_metadata) {
    const sourcePath = path.resolve(root, source.path);
    assert.ok(sourcePath.startsWith(`${root}${path.sep}`), `source stays inside project: ${source.path}`);
    const { bytes, sha256 } = fileDigest(sourcePath);
    assert.equal(sha256, source.sha256, `evidence source hash matches ${source.path}`);
    assert.equal(bytes.length, source.size_bytes, `evidence source size matches ${source.path}`);
}
const authoritative = fileDigest(path.join(root, contract.authoritative_input.path));
assert.equal(authoritative.sha256, contract.authoritative_input.sha256, 'authoritative panel hash matches contract');
assert.equal(contract.screening_matrix.path, 'evidence/data/screening_matrix/supporting_evidence.csv');
assert.equal(
    fileDigest(path.join(root, contract.screening_matrix.path)).sha256,
    fileDigest(path.join(dataDir, manifest.datasets.screeningEvidence.file)).sha256,
    'web screening data is an exact copy of the auditable source',
);
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

console.log('data contract tests passed');
