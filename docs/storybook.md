# Isolated UI regression tests

Storybook renders the extracted UI components, not `SudokuApp`, Next routes,
IndexedDB, clipboard services or OCR. Stories use deterministic props and local
React state; their `play` functions exercise the component's public controls.
The production app and `npm test` (`node:test` via tsx) remain separate.

## Commands

Use Node 22.12+ (the project targets Node 22) and the lockfile:

```sh
npm ci
npx playwright install chromium
npm run storybook           # http://127.0.0.1:6006
npm run build-storybook     # storybook-static/
npm run test:storybook      # Vitest browser project, Chromium + interactions + axe
npm run test:visual         # fresh build, then isolated Playwright screenshots
npm test
npm run typecheck
```

With mise, prefix commands with `mise exec node@22 --`, e.g.
`mise exec node@22 -- npm run test:storybook`. Linux CI may need
`npx playwright install --with-deps chromium`.

Storybook and both addons are pinned to 10.6.0; Vite is 8.2.2; Playwright is
exact-pinned to 1.63.0. Vitest and
`@vitest/browser-playwright` must stay aligned at 4.1.11: Storybook 10.6's addon
supports Vitest 3/4, not 5. Upgrade them together only after checking peer ranges.

## Isolation and accessibility

`.storybook/main.ts` discovers `app/**/*.stories.tsx`. Preview imports the real
`app/globals.css`, uses fullscreen layout and treats axe violations as test
errors. Stories provide their own realistic `main`/layout landmarks; do not add
a global wrapper that changes dialogs or full-page layout. Portable annotations
apply the same preview and accessibility hooks to the Vitest `storybook` project.

`staticDirs: []` and Vite's `publicDir: false` deliberately prevent serving or
copying `public/vendor` into Storybook. `npm ci` still runs the app's existing
postinstall asset-copy hook, but Storybook does not consume those assets.

Visual tests live in `tests/storybook/*.visual.ts`, outside the existing root
`*.spec.ts` app E2E selection. Their static server binds only to loopback port
6007, serves only regular files inside the real build directory, rejects path
escapes and accepts only GET/HEAD. It does not fall back to app routes or reuse
an existing server. No Next server, database or OCR worker is required.

## Reviewing visual changes

Snapshots cover representative board states, library boundaries, dialog and
failure notices on desktop/phone in system light/dark themes. Browser locale is
en-US, timezone UTC, reduced motion enabled, animations disabled for screenshots
and viewports fixed at 1280×900 and 390×844. Tests use Playwright's bundled Chromium,
not `PLAYWRIGHT_CHANNEL`; using local Chrome changes rendering and invalidates
comparison. Visual comparisons and updates require the canonical environment
below; other environments can still use Storybook and its interaction tests.

### Canonical rendering environment (enforced)

The existing PNGs were created on **Ubuntu 26.04 LTS, Linux x86-64 (amd64)**,
**Node 22.23.2**, **Playwright 1.63.0**, bundled **Chromium headless shell
153.0.8010.12**. This is the canonical host, not an unverified container image.
No production CSS is replaced and no test-only font is injected:

- `Arial, Helvetica, sans-serif` renders as **Liberation Sans**, regular/bold.
- `Georgia, serif` renders as **Liberation Serif** in Chromium. `fc-match Georgia`
  alone is misleading on this host; the guard checks Chromium's actual fonts.
- UI symbols additionally use **FreeSerif** and **WenQuanYi Zen Hei**.

[`environment.json`](../tests/storybook/environment.json) records exact Debian
package versions, actual rendered-font paths and SHA-256 hashes, the Chromium
binary hash, and aggregate hashes of **all 55 font paths/contents** and **28 active
fontconfig paths/contents**. Thus adding a fallback font or changing hinting also
invalidates the environment, even if package version strings stay unchanged.
The probe uses Chrome DevTools Protocol `CSS.getPlatformFontsForNode` on Latin,
bold, serif and symbol samples, not just CSS's requested font-family.

On a clean Ubuntu 26.04 amd64 machine, install Node 22.23.2 and the lockfile,
install Chromium/system dependencies, then install the exact recorded font and
rendering-library packages. For example, from the repository root in Bash:

```sh
mise install node@22.23.2
mise exec node@22.23.2 -- npm ci
mise exec node@22.23.2 -- npx playwright install --with-deps chromium
sudo apt-get install --no-install-recommends $(mise exec node@22.23.2 -- node -p \
  "require('./tests/storybook/environment.json').packages.map(p => p.replace('\\t', '=')).join(' ')")
fc-cache -f
mise exec node@22.23.2 -- npm run test:visual:environment
```

Use Ubuntu's package archive/snapshot containing those exact versions if the
current mirror has superseded them. Do not substitute newer versions or blindly
remove host fonts: use a clean test machine without extra font packages or user
font/fontconfig overrides. The environment check is the acceptance criterion;
the install recipe is not a claim that an arbitrary desktop Ubuntu installation
is identical. No container image was downloaded or asserted equivalent.

`scripts/storybook-environment.mjs` is Playwright **globalSetup**, so both npm
scripts and direct `playwright test --update-snapshots` calls refuse mismatches
before running any tests. There is no skip/force environment variable. Run
`npm run test:visual:environment` for a preflight plus guard regression tests;
`node scripts/storybook-environment.mjs --print` prints observed metadata for
diagnosis and never writes the canonical file.

An intentional browser/OS/font upgrade is a separate reviewed baseline migration:
compare the printed metadata, manually update `environment.json`, regenerate and
inspect **all** PNGs, and rerun without updates. Never replace metadata merely to
make an unrelated UI change pass. Preserve the metadata and package lock with
the corresponding baselines.

Visual tests load the iframe in Storybook embed mode, which does not auto-run
`play` functions. This captures the named fixture's initial state, not an
interaction's final state; Vitest runs those interactions separately. Every
visual also checks horizontal overflow, browser exceptions, forbidden network
requests and accidental IndexedDB use.

Additional Playwright tests use trusted browser key input for native range
Home/End/arrow behavior and modal Tab navigation/Escape dismissal/focus return.
Synthetic `storybook/test` events alone cannot verify these browser defaults.

Normal test runs must not update baselines. For an intentional UI change:

```sh
npm run test:visual:update
npx playwright show-report storybook-report
npm run test:visual
```

Inspect the changed PNGs under `tests/storybook/__screenshots__/` and any
expected/actual/diff images in `storybook-test-results/`. Check clipping,
overflow, board highlights/notes, focus, contrast and text wrapping. Do not
approve a blank canvas, Storybook error page or unintended layout just because
the update command succeeds. Review and commit baseline changes with the UI
change. A second run without updates must pass.

For a focused iteration against an already built Storybook:

```sh
npx playwright test --config tests/storybook/playwright.config.ts --project mobile-dark
```

The generated build, traces and HTML report are ignored; baseline PNGs are not.
These tests complement, not replace, production app E2E tests for persistence,
OCR and full navigation.
