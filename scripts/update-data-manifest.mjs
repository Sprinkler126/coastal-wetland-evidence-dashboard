import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'web', 'web', 'data');
const manifestPath = path.join(dataDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(dataDir, 'evidence_bundle.json'), 'utf8'));

manifest.bundle_id = evidence.bundle_id;
manifest.datasets.screeningEvidence = {
    file: 'screening_evidence.csv',
    format: 'csv',
    schema_version: 'screening-evidence-1.0.0',
    required_by: ['methods'],
};

for (const entry of Object.values(manifest.datasets)) {
    const bytes = fs.readFileSync(path.join(dataDir, entry.file));
    entry.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    entry.size_bytes = bytes.length;
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`updated ${path.relative(root, manifestPath)} (${Object.keys(manifest.datasets).length} datasets)`);
