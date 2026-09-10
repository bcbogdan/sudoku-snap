import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { initReport, metadata, readRun, writeReport } from './report';

const run = initReport('browser');
void (async () => {
  writeReport('browser', { ...run, ...(await metadata('browser')) });
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const child = spawnSync(
    process.execPath,
    [cli, 'test', '--config', 'benchmarks/playwright.config.ts', ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, BENCH_RUN_ID: run.runId } },
  );
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
  const report = readRun('browser', run.runId);
  if (child.status === 0 && report.workloadsComplete)
    writeReport('browser', { ...report, complete: true });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
