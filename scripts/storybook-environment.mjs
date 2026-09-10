import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const metadataURL = new URL('../tests/storybook/environment.json', import.meta.url);
const command = (name, args) => execFileSync(name, args, { encoding: 'utf8' }).trim();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function hashFiles(paths) {
  return Promise.all(
    [...new Set(paths)].sort().map(async (path) => ({
      path,
      sha256: sha256(await readFile(path)),
    })),
  );
}

async function fingerprint(paths) {
  const files = await hashFiles(paths);
  return { count: files.length, sha256: sha256(JSON.stringify(files)) };
}

export async function collectEnvironment() {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('Visual baselines require Ubuntu 26.04 Linux x64; see docs/storybook.md.');
  }
  const osRelease = await readFile('/etc/os-release', 'utf8');
  const os = Object.fromEntries(
    ['ID', 'VERSION_ID'].map((key) => [
      key,
      osRelease.match(new RegExp(`^${key}="?([^"\\n]+)`, 'm'))?.[1],
    ]),
  );
  const fontFiles = command('fc-list', ['--format=%{file}\n']).split('\n');
  const fontConfig = command('fc-conflist', [])
    .split('\n')
    .filter((line) => line.startsWith('+ '))
    .map((line) => line.slice(2, line.indexOf(':')));
  const packages = command('dpkg-query', [
    '-W',
    '-f=${db:Status-Status}\t${binary:Package}\t${Version}\n',
    'fonts-*',
    'xfonts-*',
    'fontconfig',
    'libfontconfig1',
    'libfreetype6',
    'libharfbuzz0b',
    'libc6',
  ])
    .split('\n')
    .filter((line) => line.startsWith('installed\t'))
    .map((line) => line.slice('installed\t'.length))
    .sort();

  const browser = await chromium.launch({ headless: true, args: ['--enable-automation'] });
  try {
    const browserSession = await browser.newBrowserCDPSession();
    const { arguments: browserArguments } = await browserSession.send(
      'Browser.getBrowserCommandLine',
    );
    const page = await browser.newPage({ locale: 'en-US', timezoneId: 'UTC' });
    await page.setContent(`<span id="sans" style="font:16px Arial,Helvetica,sans-serif">Weekend puzzle 123456789</span>
      <span id="bold" style="font:bold 16px Arial,Helvetica,sans-serif">Weekend puzzle 123456789</span>
      <span id="serif" style="font:32px Georgia,serif">My puzzles</span>
      <span id="symbols" style="font:16px Arial,Helvetica,sans-serif">▦＋↗⌫✎←→↤↦</span>`);
    await page.evaluate(() => document.fonts.ready);
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const renderedFonts = {};
    for (const id of ['sans', 'bold', 'serif', 'symbols']) {
      const { nodeId } = await session.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: `#${id}`,
      });
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
      renderedFonts[id] = fonts.sort((a, b) => a.postScriptName.localeCompare(b.postScriptName));
    }
    const postScriptNames = new Set(
      Object.values(renderedFonts)
        .flat()
        .map((font) => font.postScriptName),
    );
    const renderedFontPaths = command('fc-list', ['--format=%{postscriptname}\t%{file}\n'])
      .split('\n')
      .map((line) => line.split('\t'))
      .filter(([names]) => names.split(',').some((name) => postScriptNames.has(name)))
      .map(([, path]) => path);
    return {
      schemaVersion: 1,
      os,
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      playwright: require('@playwright/test/package.json').version,
      chromium: browser.version(),
      chromiumExecutableSha256: sha256(await readFile(browserArguments[0])),
      packages,
      fontFiles: await fingerprint(fontFiles),
      fontConfig: await fingerprint(fontConfig),
      renderedFonts,
      renderedFontFiles: await hashFiles(renderedFontPaths),
    };
  } finally {
    await browser.close();
  }
}

export function assertEnvironment(actual, expected) {
  const changed = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].filter(
    (key) => !isDeepStrictEqual(actual[key], expected[key]),
  );
  if (changed.length) {
    throw new Error(
      `Visual environment mismatch: ${changed.join(', ')}. No baselines may be updated. See docs/storybook.md; run node scripts/storybook-environment.mjs --print to inspect, not overwrite, metadata.`,
    );
  }
}

export default async function checkEnvironment() {
  const expected = JSON.parse(await readFile(metadataURL, 'utf8'));
  assertEnvironment(await collectEnvironment(), expected);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv[2] === '--print') {
    console.log(JSON.stringify(await collectEnvironment(), null, 2));
  } else if (process.argv[2] === '--check') {
    await checkEnvironment();
    console.log(`Visual environment matches ${fileURLToPath(metadataURL)}`);
  } else {
    throw new Error('Usage: node scripts/storybook-environment.mjs --check | --print');
  }
}
