import { initReport, metadata, writeReport } from './report';

const run = initReport('core');
process.env.BENCH_RUN_ID = run.runId;
void (async () => {
  writeReport('core', { ...run, ...(await metadata('core')) });
  await import('./core-workloads');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
