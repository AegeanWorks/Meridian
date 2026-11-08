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
| 1->6 | next 3 commits | pending | - | - |
| 1->9 | next 3 commits | pending | - | - |
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
