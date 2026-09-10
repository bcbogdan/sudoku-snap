import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RecordJson = { [key: string]: Json };

function record(value: Json): asserts value is RecordJson {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected JSON object');
}

const [input, output, ...extra] = process.argv.slice(2);
assert(
  input && output && !extra.length,
  'Usage: tsx benchmarks/archive.ts INPUT.json NEW-OUTPUT.json',
);
const source = readFileSync(input);
const report: Json = JSON.parse(source.toString('utf8'));
record(report);
assert.equal(report.schemaVersion, 2, 'Regenerate reports with schema 2');
assert.equal(report.complete, true, 'Cannot archive incomplete reports');
assert(!('archive' in report), 'Use the original report, not an existing archive');
assert(typeof report.runId === 'string' && report.runId, 'Missing run ID');
assert(
  typeof report.startedAt === 'string' && Number.isFinite(Date.parse(report.startedAt)),
  'Missing start time',
);
record(report.workload);
assert(report.workload.fingerprint, 'Missing workload fingerprint');
record(report.implementation);
assert(report.implementation.sourceHash, 'Missing implementation fingerprint');

const browser = report.browser !== null;
if (browser) assert.equal(report.workloadsComplete, true, 'Browser workloads are incomplete');
const count = browser ? report.sampleCount : report.samples;
assert(
  typeof count === 'number' && Number.isSafeInteger(count) && count > 0,
  'Invalid sample count',
);
assert(Array.isArray(report.results) && report.results.length > 0, 'Missing results');
for (const result of report.results) {
  record(result);
  assert(typeof result.name === 'string' && result.name, 'Missing workload name');
  assert(
    Array.isArray(result.samples) && result.samples.length === count,
    `Incomplete samples: ${result.name}`,
  );
  record(result.summary);
  assert.equal(result.summary.n, count, `Incomplete summary: ${result.name}`);
  const metric = browser ? result.summaryMetric : null;
  assert(!browser || typeof metric === 'string', 'Missing summary metric');
  for (const sample of result.samples) {
    if (browser) record(sample);
    const value = typeof metric === 'string' ? (sample as RecordJson)[metric] : sample;
    assert(typeof value === 'number' && Number.isFinite(value), `Invalid sample: ${result.name}`);
  }
}

const omitted: Record<string, { lists: number; entries: number }> = {};
function compact(value: Json, location: string): Json {
  if (Array.isArray(value)) return value.map((item) => compact(item, `${location}[]`));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const field = `${location}.${key}`;
      if (key === 'marks' || key === 'transactionCompletionMs') {
        assert(Array.isArray(item), `Expected trace list: ${field}`);
        const counts = (omitted[field] ??= { lists: 0, entries: 0 });
        counts.lists++;
        counts.entries += item.length;
        return [];
      }
      return [[key, compact(item, field)]];
    }),
  );
}

const results = report.results.map((result) => {
  record(result);
  return { ...result, samples: compact(result.samples, 'results[].samples') };
});
const archive = {
  ...report,
  results,
  archive: {
    schemaVersion: 1,
    sourcePath: path.relative(process.cwd(), path.resolve(input)),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    sourceBytes: source.length,
    omitted,
  },
};
mkdirSync(path.dirname(output), { recursive: true });
// Exclusive creation also protects against concurrent archivers and input/output aliases.
writeFileSync(output, JSON.stringify(archive) + '\n', { flag: 'wx' });
console.log(`Archived run ${report.runId}: ${output}`);
