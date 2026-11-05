# Bundled interface fonts

Normal-style variable WOFF2 assets, exposed at weights 400–700 by
`app/styles/fonts.css`. Downloaded unchanged from Google Fonts on 2026-11-04;
only local filenames differ. Combined size: 72,776 bytes (~71 KiB).
Both families use SIL OFL 1.1; `OFL.txt` includes both copyright notices and
the shared license text. Keep it with redistributed font files.

## Provenance

Google Fonts CSS request:

<https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400..700&family=JetBrains+Mono:wght@400..700&display=swap>

Request user agent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`.
Google varies the response by user agent; select the `latin` variable WOFF2
entries, not the legacy static TTF response.

### Bricolage Grotesque

- Upstream: <https://github.com/ateliertriay/bricolage>
- License source: <https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/OFL.txt>
- Asset source (Google Fonts v9): <https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9H6as8bTXq_nANBjzKo3IeZx8z6up5BeSl5jBNz_19PpbpMXuECpwUxJBOm_OJWiawA1Xp.woff2>
- Local file: `bricolage-grotesque-latin-wght.woff2` (41,344 bytes).
- SHA-256: `a97804dc9fbe5fc972a08018c5eda4dab7ef2346f64c57e61419d05e6de4ea1c`.

### JetBrains Mono

- Upstream: <https://github.com/JetBrains/JetBrainsMono>
- License source: <https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt>
- Asset source (Google Fonts v24): <https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwg.woff2>
- Local file: `jetbrains-mono-latin-wght.woff2` (31,432 bytes).
- SHA-256: `83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be`.

## Coverage and fallback

The Google Fonts Latin subsets cover ASCII (including every Sudoku digit),
Latin-1 accents, selected additional Latin characters, common punctuation,
euro/trademark, and selected arrows/math symbols. The exact advertised
Unicode ranges are copied into the shared CSS; they are subset boundaries,
not a guarantee that every code point in each range has a glyph.
Extended Latin, Vietnamese, Greek, Cyrillic, CJK, and other scripts are not
bundled. Unsupported characters in user puzzle titles fall back per glyph to
the system sans-serif or monospace stack, including browser script fallback.
Normal faces only: italic text uses browser synthesis/fallback, not a bundled
italic asset. No `local()` source is used, so installed font versions cannot
silently change visual baselines.

## Integration contract

1. Import `./styles/fonts.css` at the top of `app/globals.css` with the other
   foundation imports, before ordinary CSS rules. Storybook must load that same
   global stylesheet; do not duplicate faces or use `next/font`.
2. Next serves `public/fonts` as `/fonts` automatically. For Vite Storybook,
   add `{ from: "../public/fonts", to: "/fonts" }` to `staticDirs` in
   `.storybook/main.ts` (path relative to the Storybook config directory).
   No other public assets need to be exposed for the fonts.
3. Apply `font-family: var(--font-interface)` for interface/body/headings and
   `font-family: var(--font-mono)` for Sudoku digits, timers, and metadata.
   Both variables include usable system fallbacks; declarations alone do not
   change existing element font-family rules.
4. Before visual snapshots, await `document.fonts.load()` for the faces/weights
   rendered, then `document.fonts.ready`. `ready` alone does not initiate unused
   face loads. Confirm local font requests succeed and no remote fonts load.

All runtime URLs in the stylesheet are root-relative local paths;
`font-display: swap` keeps text readable while fonts load. No build-time
network fetch is required either. Deployments under a non-root asset prefix
must adapt the `/fonts/` paths consistently in both hosts.

## Validation

Both source downloads succeeded with `curl --fail`; `file` identified WOFF2
TrueType data with lengths matching the table above. Fontconfig `fc-scan`
recognized both families and variable faces. These checks validate the files,
not application/Storybook serving; run browser HTTP and loaded-face checks
after the integration above is wired.
