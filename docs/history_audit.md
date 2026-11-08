# Progressive History Audit

Requested sequence: windows `1->3`, `1->6`, `1->9`, `1->12`, `1->15`,
`1->18`, then `1->End`. Each window reviews the commits added since the
previous window against the current tree, fixes only what still reproduces,
and records the evidence. A finding is closed only when a test or a live probe
proves the fixed behaviour.

## Windows

| Window | New commits | Status | Findings | Resolution |
|---|---|---|---|---|
| 1->3 | `0f7aa00`, `62293a1`, `99b468f` | **done** | The footer's `./LICENSE` link 404'd under `npm start`; the 24-hour grid overflowed at 1280px despite the "1280-1440" claim (`scrollWidth 900`, column `859`) | Serve `LICENSE` as `text/plain`; lower the grid floor from 900px to 840px; add server and 1280px dogfood assertions |
| 1->6 | `cc67033`, `1d9af69`, `629cc5a` | **done** | The two-zone default always took the first non-reference guest, so Tokyo, Sydney and Kolkata opened with **zero** shared work windows; the README tree omitted `assets/screenshots/` | Rank guest zones by shared work, then shared awake, and add Tokyo/Sydney tests; list the screenshot directory; media audit stays clean |
| 1->9 | `ba44c75`, `07d1f4d`, `2a2ac29` | **done** | The live site returned 200 and every PNG matched the recorded dimensions, but nothing guarded `.aikit/media.json` or the README asset references; either could drift silently | Add `tests/media.test.js`: every recorded asset exists, is a PNG and matches its recorded width/height; every README `assets/` reference exists |
| 1->12 | next 3 commits | pending | - | - |
| 1->15 | next 3 commits | pending | - | - |
| 1->18 | next 3 commits | pending | - | - |
| 1->21 | next 3 commits | pending | - | - |
| 1->End | remaining commits | pending | - | - |

## Window 1->3

Commits: project memory (`0f7aa00`), the initial planner (`62293a1`) and the
desktop grid fit (`99b468f`).

Findings that still reproduced on the current tree:

1. **Local license link was dead.** `scripts/serve.mjs` allowed only
   `index.html`, `src` and `assets`, so the footer's `<a href="./LICENSE">`
   returned 404 from `npm start`. Probe: `/` 200, `/src/styles.css` 200,
   `/assets/logo.svg` 200, `/LICENSE` 404.
2. **The 1280px grid fix was incomplete.** `99b468f` set the table floor to
   900px; at a 1280px viewport the grid column is 859px, so the table still
   scrolled horizontally. The new dogfood check failed with
   `{"scrollWidth":900,"clientWidth":859,"tableWidth":900}`.

Fixes:

- `PUBLIC_ENTRIES` now includes `LICENSE`; extensionless `LICENSE` is served
  as `text/plain; charset=utf-8` instead of `application/octet-stream`.
- `.grid-table` floor is 840px, so 24 columns fit at 1280px while narrower
  viewports keep the intentional horizontal scroll.
- `tests/server.test.js` asserts `safePath("/LICENSE")`, a 200 response, the
  text/plain type and the license text.
- `scripts/dogfood.mjs` switches to 1280px, asserts no grid overflow, and
  restores 1440px before the rest of the pass.

Evidence:

- Before: `/LICENSE` -> 404; dogfood failed with the overflow payload above.
- After: `/LICENSE` -> 200 text/plain; `npm test` -> 59/59; `npm run dogfood`
  -> `[OK]` including `1280px desktop grid fit`; a 1280x900 headless capture
  showed all 24 columns and no horizontal scrollbar.

## Window 1->6

Commits: the two-zone example and media refresh (`cc67033`), the README social
preview and dossier screenshot (`1d9af69`) and the recorded topics (`629cc5a`).

Findings that still reproduced on the current tree:

1. **The two-zone example did not always demonstrate overlap.** `defaultPlan`
   took the first guest zone that was not the reference zone. For a viewer in
   Tokyo, Sydney or Kolkata that guest was New York, and the day plan had zero
   shared work windows (only two awake windows), contradicting the commit's
   "demonstrates overlap immediately" intent.
2. **The README tree omitted `assets/screenshots/`.** Three tracked, approved
   captures lived there but the tree listed only "logo and social preview".

Fixes:

- `guestZoneFor` builds a candidate day plan and ranks zones by a shared work
  window first, then a shared awake window, then list order. The first work
  match stops the scan.
- `tests/state.test.js` asserts Tokyo -> Sydney and Sydney -> Tokyo, each with
  a non-empty work window.
- The README tree now names the screenshot directory and the test count is 60.

Evidence:

- Before: `defaultPlan(..., "Asia/Tokyo")` -> `New York`, `work 0`, `awake 2`;
  the same for Sydney and Kolkata.
- After: Tokyo -> Sydney, Sydney -> Tokyo, both with `work 1`; `npm test` ->
  60/60; `npm run dogfood` -> `[OK]`; `aikit.py media audit meridian` ->
  `clean` (0 pending reviews, 4 dossier screenshots).

## Window 1->9

Commits: the finished UI-task evidence (`ba44c75`), the live GitHub Pages link
(`07d1f4d`) and the raster logo and social preview (`2a2ac29`).

Findings:

- The live link returned **200** and served Meridian, so it was not broken.
- Every raster asset matched its record: `logo.png` 512x512,
  `social-preview.png` 1280x640, screenshots 1440x900, 1440x900 and 390x844.
- The gap was the absence of a guard: an approved PNG could disappear or be
  replaced at another size, and a README `assets/` path could rot, without any
  gate noticing.

Fix:

- `tests/media.test.js` reads `.aikit/media.json`, asserts every recorded asset
  exists, is a PNG and matches any recorded width/height, then asserts every
  `src="assets/..."` reference in the README resolves.
- The README now reports nine suites and 62 tests.

Evidence:

- `python aikit.py media audit meridian` -> `clean`.
- `npm test` -> 62/62 across 9 suites; `npm run dogfood` -> `[OK]`.
