import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Suite = 'core' | 'browser';
type Run = {
  schemaVersion: number;
  runId: string;
  startedAt: string;
  complete: boolean;
  results: unknown[];
  [key: string]: unknown;
};

export function initReport(suite: Suite): Run {
  const run = {
    schemaVersion: 2,
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    complete: false,
    results: [],
  };
  writeReport(suite, run);
  return run;
}

export function readRun(suite: Suite, runId: string | undefined): Run {
  if (!runId) throw new Error(`Run benchmarks/${suite}.ts to initialize a new benchmark run.`);
  const run: Run = JSON.parse(readFileSync(reportPath(suite), 'utf8'));
  if (run.runId !== runId || run.complete)
    throw new Error('Benchmark run is stale or already complete.');
  return run;
}

// Object key order is not part of seed semantics. Array order is.
function canonical(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const contentHashes = (files: string[]) =>
  Object.fromEntries(
    [...files].sort().map((file) => [file, existsSync(file) ? hash(readFileSync(file)) : null]),
  );

export function integerEnv(name: string, fallback: number, minimum = 1) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${name}`);
  return value;
}
export function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    min: sorted[0],
    median: n % 2 ? sorted[n >> 1] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    mean: values.reduce((a, b) => a + b, 0) / n,
    max: sorted[n - 1],
    ...(n >= 100 ? { p95: sorted[Math.ceil(n * 0.95) - 1] } : {}),
    label: n < 20 ? 'descriptive-only; small sample' : 'descriptive; no confidence interval',
  };
}
export async function metadata(suite: Suite) {
  // Imported after report invalidation, so fixture/setup failures cannot preserve success.
  const { fixtureVersion, histories, makeAttempt, makePuzzle } = await import('./data');
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const files = [
    'tests/fixtures/expected.json',
    'tests/fixtures/original.jpeg',
    'tests/fixtures/dark-highlighted.json',
    'tests/fixtures/dark-highlighted.jpeg',
  ];
  const fixtureHashes = contentHashes(files);
  const harnessHashes = contentHashes([
    'benchmarks/data.ts',
    'benchmarks/report.ts',
    ...(suite === 'core'
      ? ['benchmarks/core.ts', 'benchmarks/core-workloads.ts']
      : [
          'benchmarks/browser.ts',
          'benchmarks/browser.spec.ts',
          'benchmarks/instrumentation.ts',
          'benchmarks/playwright.config.ts',
        ]),
  ]);
  const seedHashes = Object.fromEntries(
    histories.map((history) => [`attempt-${history}`, hash(canonical(makeAttempt(history)))]),
  );
  const puzzleSeedHash = hash(canonical([0, 49, 499].map(makePuzzle)));
  const workload = { fixtureHashes, harnessHashes, seedHashes, puzzleSeedHash };
  // Include current bytes of tracked AND untracked source, including deleted paths.
  // Benchmark/tests/docs are separate from the implementation being compared.
  const sourceFiles = git('ls-files', '-c', '-o', '--exclude-standard', '-z')
    .split('\0')
    .filter((file) => file && !/^(benchmarks|tests|docs)\//.test(file) && !/\.md$/i.test(file));
  const sourceHashes = contentHashes([...new Set(sourceFiles)]);
  const buildFiles = ['.next/BUILD_ID', '.next/build-manifest.json', '.next/server/app/page.js'];
  const buildHashes = suite === 'browser' ? contentHashes(buildFiles) : null;
  const implementation = {
    sourceHash: hash(canonical(sourceHashes)),
    sourceHashes,
    build: buildHashes
      ? {
          id: existsSync('.next/BUILD_ID') ? readFileSync('.next/BUILD_ID', 'utf8').trim() : null,
          fingerprint: hash(canonical(buildHashes)),
          files: buildHashes,
        }
      : null,
  };
  return {
    fixtureVersion,
    fixtureHashes,
    workload: { fingerprint: hash(canonical(workload)), ...workload },
    implementation,
    commit: git('rev-parse', 'HEAD'),
    dirty: !!git('status', '--porcelain'),
    gitStatus: git('status', '--porcelain'),
    node: process.version,
    os: { platform: os.platform(), release: os.release(), arch: os.arch() },
    cpu: { model: os.cpus()[0]?.model, logicalCount: os.cpus().length },
    browser: null,
    generatedAt: new Date().toISOString(),
    adapter: process.env.BENCH_ADAPTER ?? 'typescript',
  };
}
function reportPath(name: string) {
  return path.join(process.env.BENCH_OUTPUT ?? 'benchmarks/results', `${name}.json`);
}
export function writeReport(name: string, report: unknown) {
  const file = reportPath(name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(`Benchmark results: ${file}`);
}
