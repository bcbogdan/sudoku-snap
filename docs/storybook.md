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

Both Storybook's Vite configuration and the inherited Vitest configuration enable
Vite 8's `resolve.tsconfigPaths`. Module aliases come from the repository's
`tsconfig.json`; no separate `@` mapping or machine-specific absolute path is
maintained for stories or browser tests.

Only `public/fonts` is mounted at `/fonts`; Vite's `publicDir: false` deliberately
prevents serving or copying the rest of `public`, especially `public/vendor`,
into Storybook. `npm ci` still runs the app's existing
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
- Shared interface/headings render bundled **Bricolage Grotesque**; digits, timer
  and metadata render bundled **JetBrains Mono**. Legacy system-font probes stay
  in the guard to detect fallback-environment changes.

[`environment.json`](../tests/storybook/environment.json) records exact Debian
package versions, actual rendered-font paths and SHA-256 hashes, the Chromium
binary hash, and aggregate hashes of **all 55 font paths/contents** and **28 active
fontconfig paths/contents**. Thus adding a fallback font or changing hinting also
invalidates the environment, even if package version strings stay unchanged.
The probe uses Chrome DevTools Protocol `CSS.getPlatformFontsForNode` on Latin,
bold, serif and symbol samples, not just CSS's requested font-family.

### Stage 1 approved bundled-font and host migration

The user explicitly approved this rendering-baseline migration after the package
differences were explained. Production and Storybook share locally bundled Bricolage
Grotesque and JetBrains Mono, loaded through `app/styles/fonts.css`. All browser
captures wait for `document.fonts.ready`; isolation permits same-origin `/fonts`
requests but still rejects external fonts, OCR, app APIs and failed font loads.

The schema-2 environment probe retains every legacy/system-font check and adds:

- SHA-256 hashes of the shared font CSS and every bundled WOFF2 file;
- actual Chromium-rendered Bricolage regular/heading and JetBrains metadata/digit
  samples, rejecting system fallback for these samples;
- a private, intercepted font-probe origin, so no Next/Storybook server or
  external network is needed for preflight.

Fresh metadata was collected under `mise exec node@22.23.2` and compared with the
previous baseline. The approved differences are limited to schema 2, the added
bundled-font hashes/rendered probes, and these two host package upgrades:

- `libc6:amd64`: `2.43-2ubuntu2.3` → `2.43-2ubuntu2.4`.
- `libfreetype6:amd64`: `2.14.2+dfsg-1ubuntu0.1` → `2.14.2+dfsg-1ubuntu0.2`.

OS, architecture, Node, Playwright, Chromium version/binary hash, every other
package, all system font files, active fontconfig files, and legacy rendered-font
probes/hashes are unchanged. `environment.json` records the actual schema-2
output, not fabricated metadata. Future drift still blocks both comparisons and
updates; this approval does not authorize later environment substitutions.

All 44 existing PNGs and 28 new foundation PNGs are regenerated through the same
enforced Playwright global setup. Review includes default light/dark,
desktop/phone, alternate colors, notes, previews, dialogs, error notices and
keyboard focus. Initial visual inspection caught font-migration clipping in
legacy notes and preview grids; explicit containment assertions were added so
these cannot be silently approved by updating snapshots.

Final verification after the legacy grid/line-height fixes and token-driven
specimen CSS:

- Fresh Storybook build and guarded regeneration: **79/79 tests passed**.
- Full Playwright visual suite rerun **without updates**: **79/79 passed**.
- Canonical environment preflight and drift regression tests: **14/14 passed**.
- Storybook browser interactions and axe: **76/76 passed**.
- All **72 PNGs** inspected in project contact sheets, with repaired notes and
  preview cards also checked at full size. No clipped note rows, escaping preview
  cells, Storybook error screens, missing state content or clipped focus rings
  remain in this baseline set. Desktop and dark specimens were reviewed
  separately from the mobile-light PDF reference.

The baseline set contains **44 migrated component PNGs + 28 foundation PNGs**
across desktop/phone and light/dark. This is the stage-1 foundation gate, not
approval of the later component-kit or screen-composition redesign.

Review artifacts for this migration are at
`/tmp/opencode/sudoku-baseline-migration-final/`: each project has `-boards.png`,
`-components.png` and `-foundations.png` contact sheets, matching self-contained
HTML files, and `manifest.json` records all 72 source PNG dimensions/hashes.
`storybook-report/index.html` contains the final no-update test report. These
temporary review artifacts are not the canonical baseline source; the tracked
PNGs and `environment.json` are.

`tests/storybook/environment.test.mjs` tests exact matching and rejection of all
these drift classes. No skip flag or alternate unguarded snapshot config exists.

### Foundation specimens

`app/components/DesignFoundations.stories.tsx` provides palette, typography,
spacing/radii/board-stroke geometry, and semantic foreground/background pairs.
System stories use the CSS OS fallback; forced-theme and alternate-palette
stories temporarily configure the document root and restore it on unmount.
No persisted application theme or storage is read or written. All specimen CSS
is scoped under `.design-foundations` to avoid changing application screens.

`tests/storybook/foundations.visual.ts` captures component regions rather than
the Storybook manager, checks actual font loading, semantic text contrast at
4.5:1, alternate seed/tint propagation, explicit-theme precedence, keyboard focus
and 320/430px overflow. The existing projects cover 390px/1280px and both OS
themes. Contrast assertions apply equally to the alternate light/dark palettes.
Foundation PNGs live alongside the migrated component PNGs in
`tests/storybook/__screenshots__/{project}/`.

### Core kit visual coverage

`tests/storybook/kit.visual.ts` snapshots isolated component regions, not whole
Storybook pages, for icons/sizes; button variants, busy/disabled and keyboard/
pointer feedback; explicit On/Off toggles; badge/alert/frame states; empty,
in-progress and completed previews; upload idle/invalid/busy/dragging/focus;
counted/selected/exhausted and read-only keypads; timer boundaries; truthful save
states; and zero/positive/large mistake counts. Long-content fixtures and every
kit test additionally check 320px overflow. The shared story readiness check
requires a visible rendered child, not text: an empty preview is a valid grid,
verified separately to contain 81 square, contained cells.

Board region captures cover nine pencil notes, clue/entry/peer/matching states,
selected errors and unclear clues, all three combined with keyboard focus, and
replay overlays. Assertions preserve 1px cell / 2px box / 3px frame strokes,
accessible state descriptions, note containment, and a single current replay
step. Text and notes require 4.5:1; replay error, unclear, selection and focus
indicators require 3:1 against the actual Flash surface. The replay checks also
run with alternate main colors in both OS themes; no test-only colors replace
production semantic roles.

`Kit/Reference → Components` supplies the PDF p2–3 review composition, while the
individual regions keep failures attributable to a component/state. Browser
interaction/axe tests remain independent of embed-mode snapshots. Normal test
runs never bless changed PNGs, and all updates still pass the canonical
environment guard. Core-kit snapshot approval requires a clean no-update rerun
and image inspection, not merely a successful regeneration.

Stage-2 verification after the source freeze:

- Fresh Storybook build passed; guarded snapshot update **331/331 passed**.
- Full visual rerun without updates **331/331 passed**.
- Storybook interactions/axe **152/152 passed** across 25 files.
- Canonical environment preflight/drift tests **14/14 passed**; TypeScript passed.
- **332 reviewed PNGs**: desktop-light 84, desktop-dark 84, mobile-light 82,
  mobile-dark 82 (260 new kit images + 72 prior images). All reviewed SHA-256
  hashes remained unchanged after the no-update rerun; 28 foundation PNGs also
  remained byte-identical to stage 1.

Review artifacts are in `/tmp/opencode/sudoku-kit-review/`: 40 contact sheets
named `{project}-{controls,status,frames,photos,previews,boards,keypad-timer,composition,legacy,foundations}.png`,
with matching HTML, composition strips and `manifest.json`. Seven native-scale
PDF/browser comparisons are `compare-{buttons,keypad,alert,drop-zone,board-states,brackets,status}.png`
and matching HTML. `pdf-page-2.png`, `pdf-page-3.png`, reference crops and
`reference-manifest.json` record the PDF source hash, crop coordinates and
72-point-to-96-CSS-pixel normalization. These temporary artifacts supplement the
tracked baselines; `storybook-report/index.html` holds the clean no-update report.

The PDF comparison preserves the reference's typography, palette, corner-frame
and board-stroke hierarchy, rather than requiring identical page layouts.
Browser specimens add explicit states/counts, accessible touch targets and
responsive wrapping; desktop and dark variants were reviewed separately.
`reference-320-keypad.png` and `reference-320-geometry.json` additionally verify
the reference composition at 320px: keys are **44.390625 × 52px**, with digits
and counts visible. No clipping, missing-state content or remaining visual-test
failures were found. This completes the core-kit gate, not production app E2E
or later screen-composition approval. The canonical environment guard is unchanged.

PDF crops are review references, never pixel-identical browser baselines. With
Poppler available, produce review artifacts outside the source tree, for example:

```sh
pdftoppm -f 1 -l 3 -scale-to 1600 -png design_language.pdf /tmp/opencode/design-foundations-reference
```

Review light-theme type sizes/weights, palette and stroke hierarchy against the
reference. Approve desktop/dark variants separately; the PDF defines mobile light.

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
