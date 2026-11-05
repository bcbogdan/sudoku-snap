import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  applyTheme,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  setThemePreference,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  watchTheme,
} from '../lib/theme';

function browser(options: { stored?: string; dark?: boolean; blocked?: boolean } = {}) {
  let stored = options.stored ?? null;
  let dark = options.dark ?? false;
  const mediaListeners = new Set<() => void>();
  const storageListeners = new Set<(event: { key: string | null }) => void>();
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
  let meta: { name: string; content: string } | undefined;
  const document = {
    documentElement: root,
    querySelector: () => meta,
    createElement: () => ({ name: '', content: '' }),
    head: {
      append: (element: { name: string; content: string }) => {
        meta = element;
      },
    },
  };
  const media = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, callback: () => void) => mediaListeners.add(callback),
    removeEventListener: (_: string, callback: () => void) => mediaListeners.delete(callback),
  };
  const window = {
    document,
    get localStorage() {
      if (options.blocked) throw new Error('Storage unavailable');
      return {
        getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null),
        setItem: (key: string, value: string) => {
          assert.equal(key, THEME_STORAGE_KEY);
          stored = value;
        },
      };
    },
    matchMedia: () => media,
    addEventListener: (_: string, callback: (event: { key: string | null }) => void) =>
      storageListeners.add(callback),
    removeEventListener: (_: string, callback: (event: { key: string | null }) => void) =>
      storageListeners.delete(callback),
  };
  return {
    window: window as unknown as Window,
    document,
    root,
    get meta() {
      return meta;
    },
    get stored() {
      return stored;
    },
    get listenerCount() {
      return mediaListeners.size + storageListeners.size;
    },
    changeOS(value: boolean) {
      dark = value;
      mediaListeners.forEach((callback) => callback());
    },
    changeStorage(value: string | null, key: string | null = THEME_STORAGE_KEY) {
      stored = value;
      storageListeners.forEach((callback) => callback({ key }));
    },
  };
}

test('theme preferences validate and resolve without browser globals', () => {
  for (const value of [null, undefined, '', 'invalid', {}, 'system']) {
    assert.equal(parseThemePreference(value), 'system');
  }
  for (const preference of ['light', 'dark'] as const) {
    assert.equal(parseThemePreference(preference), preference);
    assert.equal(resolveTheme(preference, true), preference);
    assert.equal(resolveTheme(preference, false), preference);
  }
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

test('storage can be missing, invalid, blocked, or valid', () => {
  assert.equal(readThemePreference(browser().window), 'system');
  assert.equal(readThemePreference(browser({ stored: 'bad' }).window), 'system');
  assert.equal(readThemePreference(browser({ blocked: true }).window), 'system');
  assert.equal(readThemePreference(browser({ stored: 'dark' }).window), 'dark');
});

test('standalone first-paint script matches runtime for every preference and OS', () => {
  for (const stored of [undefined, 'bad', 'system', 'light', 'dark']) {
    for (const dark of [false, true]) {
      for (const blocked of [false, true]) {
        const context = browser({ stored, dark, blocked });
        runInNewContext(THEME_BOOTSTRAP_SCRIPT, {
          window: context.window,
          document: context.document,
        });
        const expected = resolveTheme(blocked ? 'system' : parseThemePreference(stored), dark);
        assert.equal(context.root.dataset.theme, expected);
        assert.equal(context.root.style.colorScheme, expected);
        assert.equal(context.meta?.content, THEME_COLORS[expected]);
        assert.equal(applyTheme(readThemePreference(context.window), context.window), expected);
      }
    }
  }
});

test('theme subscriptions follow OS only in system mode, sync storage and clean up', () => {
  const context = browser();
  const values: string[] = [];
  const unsubscribe = watchTheme((value) => values.push(value), context.window);
  assert.equal(context.listenerCount, 2);
  assert.equal(context.root.dataset.theme, 'light');
  context.changeOS(true);
  assert.equal(context.root.dataset.theme, 'dark');
  setThemePreference('light', context.window);
  assert.equal(context.stored, 'light');
  assert.equal(values.at(-1), 'light');
  context.changeOS(false);
  context.changeOS(true);
  assert.equal(context.root.dataset.theme, 'light');
  context.changeStorage('dark');
  assert.equal(context.root.dataset.theme, 'dark');
  assert.equal(values.at(-1), 'dark');
  context.changeStorage(null, null);
  assert.equal(values.at(-1), 'system');
  assert.equal(context.root.dataset.theme, 'dark');
  context.changeOS(false);
  assert.equal(context.root.dataset.theme, 'light');
  unsubscribe();
  assert.equal(context.listenerCount, 0);
});

test('blocked storage still allows a persistent in-memory selection across OS changes', () => {
  const context = browser({ blocked: true });
  setThemePreference('dark', context.window);
  const unsubscribe = watchTheme(() => {}, context.window);
  context.changeOS(false);
  assert.equal(context.root.dataset.theme, 'dark');
  setThemePreference('system', context.window);
  assert.equal(context.root.dataset.theme, 'light');
  context.changeOS(true);
  assert.equal(context.root.dataset.theme, 'dark');
  unsubscribe();
});

const css = readFileSync(new URL('../app/styles/themes.css', import.meta.url), 'utf8');
function seeds(block: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(block.matchAll(/--palette-([\w-]+):\s*(#[\da-f]{6});/g), ([, name, hex]) => [
      name,
      hex,
    ]),
  );
}
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = hex.match(/[\da-f]{2}/gi)!.map((value) => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('PDF light palette remains exact', () => {
  assert.deepEqual(seeds(css.slice(0, css.indexOf('@media'))), {
    paper: '#f3f5f7',
    card: '#ffffff',
    ink: '#0e1a2b',
    'ink-2': '#4a576a',
    line: '#d5dbe3',
    peer: '#e9eef5',
    pencil: '#2447d6',
    'pencil-soft': '#dce6ff',
    'same-digit': '#c7d7ff',
    flash: '#ffd43b',
    'flash-soft': '#fff3bf',
    completed: '#08694f',
    'completed-soft': '#d6f2e8',
    mistake: '#a8281a',
    'mistake-soft': '#fce0da',
  });
});

test('default light and dark semantic text pairs meet WCAG AA', () => {
  const light = seeds(css.slice(0, css.indexOf('@media')));
  const dark = seeds(css.slice(css.indexOf(":root[data-theme='dark']")));
  for (const palette of [light, dark]) {
    for (const [foreground, background] of [
      ['ink', 'paper'],
      ['ink', 'card'],
      ['ink-2', 'card'],
      ['ink-2', 'peer'],
      ['pencil', 'card'],
      ['pencil', 'pencil-soft'],
      ['pencil', 'same-digit'],
      ['completed', 'completed-soft'],
      ['mistake', 'mistake-soft'],
    ]) {
      assert.ok(
        contrast(palette[foreground], palette[background]) >= 4.5,
        `${foreground} on ${background}: ${contrast(palette[foreground], palette[background])}`,
      );
    }
    assert.ok(contrast('#0e1a2b', palette.flash) >= 4.5);
    assert.ok(contrast(palette.pencil, palette.card) >= 3, 'focus ring');
  }
});

test('alternate purple palette derives all status tints and retains accessible text', () => {
  const mix = (foreground: string, background: string, percentage: number) => {
    const channels = (hex: string) => hex.match(/[\da-f]{2}/gi)!.map((v) => parseInt(v, 16));
    const base = channels(background);
    return `#${channels(foreground)
      .map((value, index) =>
        Math.round((value * percentage + base[index] * (100 - percentage)) / 100)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  };
  for (const [card, pencil, flash, completed, mistake] of [
    ['#ffffff', '#6b21a8', '#ffd080', '#166534', '#b91c1c'],
    ['#192333', '#c4b5fd', '#f9d36a', '#86efac', '#fca5a5'],
  ]) {
    for (const [name, seed, percentage] of [
      ['pencil-soft', pencil, 14],
      ['same-digit', pencil, 23],
      ['completed-soft', completed, 12],
      ['mistake-soft', mistake, 12],
    ] as const) {
      const seedName = name === 'same-digit' ? 'pencil' : name.replace('-soft', '');
      assert.ok(
        css.includes(
          `--palette-${name}: color-mix(in srgb, var(--palette-${seedName}) ${percentage}%, var(--palette-card))`,
        ),
        `${name} must follow its configurable seed`,
      );
      const tint = mix(seed, card, percentage);
      assert.notEqual(tint, card);
      assert.ok(contrast(seed, tint) >= 4.5, `${seed} on ${tint}`);
    }
    assert.ok(contrast('#0e1a2b', flash) >= 4.5);
    assert.ok(
      css.includes(
        '--palette-flash-soft: color-mix(in srgb, var(--palette-flash) 24%, var(--palette-card))',
      ),
    );
  }
});

test('replay indicators remain readable on default and alternate Flash colors', () => {
  for (const role of ['error', 'focus']) {
    const seed = role === 'error' ? 'mistake' : 'pencil';
    assert.match(
      css,
      new RegExp(
        `--color-replay-${role}:\\s*color-mix\\(\\s*in srgb,\\s*var\\(--palette-${seed}\\) 25%,\\s*var\\(--color-replay-text\\)\\s*\\)`,
      ),
    );
  }
  for (const [flash, error, focus] of [
    ['#ffd43b', '#a8281a', '#2447d6'],
    ['#ffd43b', '#ffb4a5', '#a6bdff'],
    ['#f3a4de', '#9b382d', '#6542b5'],
    ['#f3a4de', '#ffbcaf', '#c4adff'],
  ]) {
    for (const seed of [error, focus]) {
      const ink = [14, 26, 43];
      const color = `#${seed
        .match(/[\da-f]{2}/gi)!
        .map((channel, index) =>
          Math.round(parseInt(channel, 16) * 0.25 + ink[index] * 0.75)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
      assert.ok(contrast(color, flash) >= 4.5, `${color} on ${flash}`);
    }
    assert.ok(contrast('#0e1a2b', flash) >= 4.5, 'replay notes and unclear outline');
  }
});
