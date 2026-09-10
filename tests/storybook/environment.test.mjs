import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertEnvironment } from '../../scripts/storybook-environment.mjs';

const canonical = JSON.parse(
  await readFile(new URL('./environment.json', import.meta.url), 'utf8'),
);

test('accepts an exact canonical environment regardless of JSON key order', () => {
  const reordered = Object.fromEntries(Object.entries(canonical).reverse());
  assert.doesNotThrow(() => assertEnvironment(reordered, canonical));
});

for (const [field, value] of Object.entries({
  os: { ID: 'ubuntu', VERSION_ID: '24.04' },
  architecture: 'arm64',
  node: 'v22.0.0',
  playwright: '1.64.0',
  chromiumExecutableSha256: 'changed-browser-binary',
  fontFiles: { ...canonical.fontFiles, sha256: 'changed-or-added-font' },
  fontConfig: { ...canonical.fontConfig, sha256: 'changed-hinting' },
  renderedFonts: { ...canonical.renderedFonts, sans: [] },
  renderedFontFiles: [],
  packages: [],
})) {
  test(`rejects ${field} drift before snapshot comparisons or updates`, () => {
    assert.throws(
      () => assertEnvironment({ ...canonical, [field]: value }, canonical),
      new RegExp(`Visual environment mismatch: ${field}\\. No baselines may be updated`),
    );
  });
}

test('rejects missing metadata instead of silently weakening the guard', () => {
  const { fontConfig, ...incomplete } = canonical;
  assert.throws(() => assertEnvironment(canonical, incomplete), /mismatch: fontConfig/);
});
