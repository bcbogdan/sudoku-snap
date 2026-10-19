# Sudoku Snap

A Next.js app that turns a Sudoku photo into an editable board and playable game. OpenCV detects and straightens the grid; Tesseract reads isolated digits in the browser. All recognition assets are served from this app. The image is never uploaded to a server.

## Run locally

Use Node.js 22 (`nvm use` reads the included `.nvmrc`), matching the Vercel runtime.

```sh
npm install
npm run dev
```

Open http://localhost:3000. The home screen lists saved puzzles. Selecting a puzzle opens its most recently started attempt directly, including completed attempts in read-only mode. Puzzles without attempts open for review or on their details screen. Use “All attempts” from the board to view older attempts or start a new one. Choose **New puzzle** to upload or paste a clear, upright photo, or enter clues by hand. Paste a copied image with your device’s Paste command (Cmd+V / Ctrl+V on desktop), or choose **Paste image** and allow clipboard access if prompted. Pasted photos follow the same local recognition, 20 MB limit, review and saving flow as uploads. Each creation receives a random name and timestamp, and is immediately stored as an editable draft. The photo and recognized clues stay in IndexedDB on this browser/device.

Review the clues in the full-width board view, then confirm to start an attempt. For photo drafts, expand **Compare original photo** and zoom to inspect the saved source while correcting clues. **Cancel reading** stops photo processing without saving an unfinished draft. A puzzle must have exactly one solution and at least one empty cell. Confirmed original clues are immutable. The puzzle detail screen lists every attempt and lets you resume one or start another independently.

Use the number pad or keyboard (1–9, Delete/Backspace, arrows). Press an entered number again to clear it. Hold an editable square for a circular number picker; release and tap a number, or cancel with Escape, Cancel, or the backdrop. **Undo move** restores the previous position, including notes and mistakes, and saves the reversal as another history entry. Repeated undo walks back through the applied moves; completed attempts remain locked. Toggle pencil notes with N. Mistake check compares final entries with the unique solution; notes do not count as mistakes. Each entry, erase or note change is saved before it is confirmed in the UI. Reloading an attempt URL restores its latest saved position.

The history controls and slider replay the original state and every move, including notes and mistake counts. Historical positions are read-only. Return to the latest move to continue an unfinished attempt. Completed attempts are permanently read-only in the application and can only be replayed. Start a new attempt to play again.

Timing counts only while the attempt page is visible and focused. Switching tabs, minimizing, leaving the page or closing the app pauses it. Focused time is saved every second and before moves; completion freezes the duration. Move records store timestamps and focused durations. Existing unfinished attempts retain the duration at their last recorded move as their baseline; completed durations stay unchanged. An abrupt browser/process termination can lose the final unsaved second.

Storage is origin-specific: use the same hostname and port to access your collection. There is no account or cloud synchronization. Clearing browser/site data removes saved puzzles. Rapid board inputs are queued in order and published only after each save. Failed saves show an error beside the board without applying an unsaved move; remaining unsaved queued input is discarded. Choose **Resume editing** and re-enter it, or reload if another tab changed the puzzle. Revision checks reject concurrent stale writes from another tab.

## Verification

```sh
npm test
npm run build
npm run test:e2e
```

Install the pinned browser with `npx playwright install chromium` before running browser tests. Set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Google Chrome instead. The tests start the production server on port 3187, upload `tests/fixtures/original.jpeg`, compare all 81 recognized cells with `tests/fixtures/expected.json`, check no photo POSTs or external requests, and exercise saved drafts, reload recovery, independent attempts, notes, read-only history, completed-attempt locking and mobile overflow.

Behavioral migration fixtures live in `benchmarks/fixtures`; `npm test` checks them against the TypeScript implementation. See [performance baselines](benchmarks/README.md) for repeatable core and production-browser measurements and report comparison.

`npm run typecheck` checks TypeScript separately. `npm start` serves the production build. The postinstall script copies OpenCV, Tesseract workers, WASM and English OCR data into the ignored `public/vendor` directory. Re-run `node scripts/copy-assets.mjs` if those generated files are removed.

## Component regression tests

`npm run storybook` opens isolated React components on port 6006. Run
`npm run test:storybook` for Chromium interaction/accessibility tests and
`npm run test:visual` for built-Storybook screenshots in desktop/mobile light/dark
themes. Neither suite starts Next or loads OCR/storage. See
[Storybook testing](docs/storybook.md) for setup and deliberate baseline review
with `npm run test:visual:update`.

## Rust core development (Phase 3)

[`sudoku-core`](crates/sudoku-core/README.md) is the pure Rust domain library.
Resident sessions prepare bounded candidates; hosts persist them before accepting
them. `sudoku-wasm` and `sudoku-ffi` expose platform bindings. The web app defaults
to TypeScript and IndexedDB schema 2; Node-only development does not require Rust.
See [refactor progress](docs/refactor-progress.md), the
[session contract](docs/session-api.md) and [implementation plan](docs/rust-ios-implementation-plan.md).

With [rustup](https://rustup.rs/) installed, run from the repository root:

```sh
rustup toolchain install 1.97.1 --profile minimal --component clippy --component rustfmt
cargo +1.97.1 test --workspace --locked
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings
cargo +1.97.1 doc --workspace --no-deps --locked
```

The workspace uses edition 2024, pins Rust 1.97.1 in `rust-toolchain.toml`, and
locks dependency resolution in `Cargo.lock`. Keep the explicit `+1.97.1`:
`RUSTUP_TOOLCHAIN=stable` overrides the toolchain file. `cargo test` includes the
crate README's doctest; generated API docs start at
`target/doc/sudoku_core/index.html`. The crate README includes an optional native
loader benchmark, its measurement limits and the future host transaction contract.

### Opt-in Wasm web engine

```sh
rustup target add --toolchain 1.97.1 wasm32-unknown-unknown
cargo +1.97.1 install wasm-bindgen-cli --version 0.2.104 --locked
npm run build:wasm
npm run test:wasm
NEXT_PUBLIC_SUDOKU_ENGINE=wasm npm run build
NEXT_PUBLIC_SUDOKU_ENGINE=wasm npm run test:e2e
```

Generated assets in `public/core-wasm` must accompany the opt-in deployment.
Missing assets produce an initialization error; the selected engine never silently
changes during a game. Rebuild without the flag to use TypeScript. See
[web rollout](docs/web-core-rollout.md) for transaction and rollback details and
[Wasm bindings](docs/wasm-binding.md) for the boundary contract.

### Native iOS host

The separate SwiftUI host lives in `apps/ios`. It uses the UniFFI bridge rather
than the web UI. Apple-platform builds require macOS/Xcode; Rust bridge tests
alone do not establish Swift compilation or OCR parity. See
[Swift binding setup](docs/swift-binding.md) and
[native CI](docs/native-ci.md) for reproducible tooling and validation gates.

Learning Rust? Read validated types in
[`board.rs`](crates/sudoku-core/src/board.rs), then
[`solver.rs`](crates/sudoku-core/src/solver.rs) →
[`puzzle.rs`](crates/sudoku-core/src/puzzle.rs) →
[`attempt.rs`](crates/sudoku-core/src/attempt.rs) →
[`record.rs`](crates/sudoku-core/src/record.rs) and
[`tests`](crates/sudoku-core/tests). Follow with `time.rs` and `sharing.rs` for
host-driven timing and compatibility boundaries.

## Vercel

The repository includes `vercel.json` with the Next.js framework preset, `npm ci` for reproducible installs, and `npm run build`. `package.json` pins the deployment runtime to Node.js 22.x. Leave the output directory on the Next.js default; do not set it to `public`.

1. Push the repository to your Git provider and import it in Vercel.
2. Set the project's Root Directory to this repository's root (the folder containing `package.json` and `vercel.json`).
3. Deploy using the checked-in settings. No API keys, environment variables, database service, or server-side storage are needed.

Alternatively, run `npx vercel` from this directory to link a project and create a preview deployment; use `npx vercel --prod` when ready for production. These commands require your Vercel account and may prompt for project settings. Local `.vercel` account/project metadata is ignored by Git and Prettier.

`npm ci` runs `postinstall`, which recreates all locally served OpenCV/Tesseract assets in `public/vendor`. Keep this hook enabled: these generated assets are deliberately not committed. Vercel serves them alongside the Next.js application; the uploaded Sudoku photo is processed in the browser.

IndexedDB data belongs to each origin: localhost, preview URLs, and your production domain have separate collections. Existing local puzzles do not automatically transfer to production. Use a stable production domain to retain the same browser collection.

This task configures deployment but does not create, link, or publish a Vercel project. See [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json) and [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Limitations and provenance

This is a reconstruction from the referenced conversation's feature requirements; the previous `/home/oai/src` source and Git history were not accessible. No existing app source was copied or committed. The original uploaded image is included only as a test fixture, outside `public`.

The reader detects predominantly dark backgrounds and reverses their contrast before grid detection and OCR. OpenCV preprocessing and Tesseract recognition run in dedicated workers, requiring Worker, OffscreenCanvas and createImageBitmap support. Assets remain local and lazy-loaded. Workers are terminated on completion, failure or cancellation. Regression fixtures include the original paper photo (32 clues) and `tests/fixtures/dark-highlighted.jpeg`, a white-on-dark screenshot with colored highlights (22 clues). Its expected board is in `dark-highlighted.json`; `tests/dark-image.spec.ts` checks all 81 cells through the actual upload flow.

OCR can miss or misread digits in rotated, blurry, shadowed or unusual-font photos. Always review clues. A successful original-image regression is not a guarantee for other photos. Persistence is device-local; accounts, synchronization and full-library export are not implemented.

## Storage and tests

IndexedDB database `sudoku-local`, schema version 2, retains `puzzles` and `attempts` and adds `puzzleSummaries`, `attemptSummaries` and `timers`. Upgrading from schema 1 atomically derives summaries/timers without replacing original photos or move histories. Attempts and attempt summaries are indexed by puzzle ID. Library views read summaries; individual routes load only their records. Timer checkpoints read/write only small timing records; full attempt reads merge the latest timing. Each move still includes a position snapshot. Writes resolve on transaction completion, and completion/removal update dependent stores atomically. Completed attempts and finalized clues remain protected in the storage API.

Immutable-clue solutions are cached by content; uncached solving runs in a browser worker before opening a write transaction. The transaction rechecks revisions and merges fresh timing before publishing a move. Undo does not solve. The pure Rust core's schema-v1 DTOs and compatibility fixture versions are separate from this browser database version.

`npm test` includes real transaction API tests using fake-indexeddb as well as pure Sudoku/history tests. See `PHASE2-VERIFICATION.md` for browser checks.

## Mobile, names and appearance

Use the pencil button beside a puzzle title to rename it. Names are trimmed, limited to 80 characters, and saved in IndexedDB; renaming preserves original clues and every attempt, including completed attempts. Cancel or Escape discards an unfinished rename.

Layouts adapt to narrow phones, tablets and landscape screens. The keypad uses two rows whenever its board container is narrow, maintaining large touch targets. The app follows `prefers-color-scheme` automatically; its light and dark palettes cover the board, notes, highlights, errors, library and forms without a separate toggle.

## Formatting

Prettier is installed as an exact development dependency with shared settings in `.prettierrc.json`. Run `npm run format` to format source, styles, JSON and documentation, or `npm run format:check` to verify formatting in CI. Generated framework files, OCR assets, dependency lockfiles and test output are excluded in `.prettierignore`. Editors with Prettier support use the same repository settings.

## Sharing and removal

Choose **Share puzzle** on a draft, puzzle details or attempt screen. The link is copied immediately and a brief confirmation appears. If clipboard access is denied, a selectable link is shown for manual copying. Its format is `/?p=<encodedPuzzle>&n=<name>`: `p` uses a versioned compact base-64 integer encoding of the 81 row-major digits (`0` means empty), capped at 47 characters instead of the original 108. New payloads start with `1.` to identify encoding version 1; the original unversioned format is retained as legacy version 0. Unknown versions are rejected. Leading empty cells are restored when decoding. Previously issued 108-character links and previously imported copies remain supported; `n` is the URL-encoded name. Only original clues and the name are included, never the photo, solution or attempt history.

Share links include server-rendered Open Graph and Twitter metadata. `/api/puzzle-preview?p=<encodedPuzzle>` generates a 630×630 PNG showing only the original clues. This works for both supported encoding versions, without browser storage or JavaScript. Vercel supplies the public image origin automatically; set `NEXT_PUBLIC_SITE_URL` to your full production URL when using a custom domain or another host. Preview cards become available after deployment, and sharing platforms may cache cards for previously shared URLs.

Opening the link validates the data and creates a local draft with a new ID and timestamp for the recipient to review. Reopening the same clues/name link reuses that imported local puzzle and preserves its attempts; refreshing switches to the local puzzle URL. Malformed or conflicting boards are rejected without saving. Shared drafts can still require corrections before they have a unique solution.

Choose **Remove puzzle** from a draft, puzzle details or attempt screen. A confirmation names the puzzle and warns that all local attempts will also be removed. Cancelling changes nothing. Confirming deletes the puzzle, stored photo and all attempts in one IndexedDB transaction; other puzzles are untouched. Removing a local puzzle does not revoke existing sharing links, which can still create another local copy.
