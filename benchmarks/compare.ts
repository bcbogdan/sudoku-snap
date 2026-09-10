import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Report = {
  schemaVersion: number;
  runId: string;
  workload: { fingerprint: string };
  implementation: unknown;
  fixtureVersion: string;
  fixtureHashes: unknown;
  node: string;
  os: unknown;
  cpu: unknown;
  browser: string | null;
  instrumentation?: unknown;
  iterations?: number;
  complete: boolean;
  idleMs?: number;
  browserSettings?: unknown;
  warmup: number;
  cacheState?: string;
  adapter: string;
  commit: string;
  results: {
    name: string;
    history?: number | null;
    inputHistory?: number | null;
    dataset?: unknown;
    cacheState?: string;
    summaryMetric?: string;
    unit?: string;
    summary: { median: number; n: number; label: string };
  }[];
};
const [beforePath, afterPath] = process.argv.slice(2);
assert(beforePath && afterPath, 'Usage: tsx benchmarks/compare.ts BEFORE.json AFTER.json');
const load = (file: string): Report => JSON.parse(readFileSync(file, 'utf8'));
const before = load(beforePath),
  after = load(afterPath);
assert(before.complete && after.complete, 'Cannot compare incomplete reports');
assert(before.schemaVersion === 2 && after.schemaVersion === 2, 'Regenerate reports with schema 2');
assert(before.workload?.fingerprint && after.workload?.fingerprint, 'Missing workload fingerprint');
assert.equal(
  after.workload.fingerprint,
  before.workload.fingerprint,
  'Workload fingerprint differs',
);
for (const field of [
  'fixtureVersion',
  'fixtureHashes',
  'node',
  'os',
  'cpu',
  'browser',
  'browserSettings',
  'instrumentation',
  'iterations',
  'warmup',
  'cacheState',
  'idleMs',
] as const) {
  assert.deepEqual(after[field], before[field], `Incomparable ${field}`);
}
const key = (r: Report['results'][number]) =>
  JSON.stringify([
    r.name,
    r.history,
    r.inputHistory,
    r.dataset,
    r.cacheState,
    r.summaryMetric ?? r.unit,
  ]);
assert.deepEqual(
  after.results.map(key).sort(),
  before.results.map(key).sort(),
  'Workload sets differ',
);
const comparisons = before.results.map((b) => {
  const a = after.results.find((r) => key(r) === key(b))!;
  return {
    workload: JSON.parse(key(b)),
    beforeMs: b.summary.median,
    afterMs: a.summary.median,
    afterOverBefore: b.summary.median ? a.summary.median / b.summary.median : null,
    sampleCounts: [b.summary.n, a.summary.n],
    label: 'ratio of descriptive medians; not a significance test',
  };
});
console.log(
  JSON.stringify(
    {
      before: {
        runId: before.runId,
        commit: before.commit,
        adapter: before.adapter,
        implementation: before.implementation,
      },
      after: {
        runId: after.runId,
        commit: after.commit,
        adapter: after.adapter,
        implementation: after.implementation,
      },
      comparisons,
    },
    null,
    2,
  ),
);
