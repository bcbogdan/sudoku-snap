import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
const version = execFileSync('wasm-bindgen', ['--version'], { encoding: 'utf8' }).trim();
if (version !== 'wasm-bindgen 0.2.104')
  throw new Error(`Expected wasm-bindgen 0.2.104, got ${version}`);
run('cargo', [
  'build',
  '--locked',
  '--release',
  '--target',
  'wasm32-unknown-unknown',
  '-p',
  'sudoku-wasm',
]);
for (const target of ['web', 'nodejs']) {
  run('wasm-bindgen', [
    'target/wasm32-unknown-unknown/release/sudoku_wasm.wasm',
    '--target',
    target,
    '--out-dir',
    `crates/sudoku-wasm/pkg/${target}`,
    '--out-name',
    'sudoku_wasm',
  ]);
}
const publicOutput = new URL('../public/core-wasm/', import.meta.url);
mkdirSync(publicOutput, { recursive: true });
cpSync(new URL('../crates/sudoku-wasm/pkg/web/', import.meta.url), publicOutput, {
  recursive: true,
});
