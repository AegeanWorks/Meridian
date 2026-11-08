# Implicit State Machines in Meridian

Status: verified inventory. This is the list requested before any fix. An
**implicit state machine** is a set of states encoded in a nullable field, a
boolean, a status string or a URL fragment, with transitions enforced (or only
assumed) by code.

Method: map every stateful surface from `src/`, re-read each claimed transition,
then run the live modules and the browser dogfood to separate real behaviour
from comments. Line anchors are from the pre-fix tree.

## Summary

| Area | Machines | Enforcement today |
|---|---|---|
| Plan and URL state | 9 | Mixed: some guards, several ad-hoc transitions |
| Derived schedule state | 5 | Pure and tested |
| UI interaction state | 5 | Ad-hoc (one gap) |
| Static server | 1 | Guarded and tested |
| **Total** | **20** | **11 sound, 9 with gaps** |

The gaps are the cross-cutting findings at the end; nine machines have one.
A machine being "sound" means its states and transitions match the code; it
does not mean every transition is reachable from the UI.

## 1. Plan and URL state

| Machine | States | Source | Enforcement / gap |
|---|---|---|---|
| **Plan schema version** | missing, current (`1`), unsupported | `STATE_VERSION`, payload `v`; `state.js:10`, `:52`, `:91` | **Gap:** `decodePlan` drops `v` before `normalizePlan`, so `v:2`, `v:99` and `v:"2"` all load as version 1. Contradicts `.aikit/guidelines.md`. |
| **Share-hash read** | absent, valid, invalid | `decodePlan`; `state.js:91`, `main.js:355`, `:377` | **Gap:** the three outcomes collapse to "plan or null". A malformed `#p=` is silently replaced by the default plan on load and silently ignored on `hashchange`; no user feedback. |
| **Plan mutation source** | default, decoded, edited | `init`, `applyPlan`, `resetPlan`; `main.js:153`, `:234`, `:363` | Mostly guarded by `normalizePlan`. **Gap:** `setDate` (`main.js:240`) checks only the `YYYY-MM-DD` shape, so an impossible date enters the plan unnormalized. |
| URL sync | clean, dirty, foreign fragment | `writeHash`, `planEquals`; `main.js:77`, `state.js:131` | **Gap:** the accessible skip link (`index.html:16`) writes `#grid` into the same fragment the plan owns. The plan hash is lost until the next `writeHash`. |
| **Selected slot** | none, selected, clamped | `state.slot`, `clampSlot`, `setSlot`; `main.js:99`, `:165`, `grid.js:91` | **Gap:** `clampSlot` does not reject a non-finite start, so `meridian.setSlot({start: NaN})` reaches `slotSummary` and throws (`columns[NaN]`). Hardcodes `24` instead of `DAY_HOURS`/`MAX_SLOT_HOURS`. |
| Duration preference | preset, custom | `state.duration`, `syncDuration`, `setSlot`; `main.js:106`, `:165` | **Gap:** the dropdown and the selected slot are two sources of truth, reconciled by an unnamed rule: sync only when `slot.hours <= 12`. A 13 h+ drag leaves them disagreeing. |
| Participant set | single, plural, full | `participants`, `MAX_PARTICIPANTS`; `main.js:201`, `:210`, `:234` | Sound. Remove refuses the last person; add refuses above 12; Reset restores 2 (or 1). |
| **Zone validity and form** | candidate, valid, invalid | `isValidTimeZone`, `normalizeParticipant`, setters; `time.js:74`, `state.js:35`, `main.js:176`, `:210`, `:246` | Invalid zones are refused. **Gap:** a valid lowercase zone is stored as typed, so `europe/istanbul` renders the label `istanbul` and produces a non-canonical share link. |
| **Work day** | open, zero-length, wrap-around | `workOf`, `isWorkHour`; `schedule.js:13`, `:20` | `normalizeParticipant` clamps hours, but **`addParticipant` accepts any integer** (e.g. `99` or `-5`) from the public AX surface; `changeParticipant` does no validation. `start === end` meaning "no work day" is intentional and pinned. |

## 2. Derived schedule state (pure)

| Machine | States | Source | Enforcement / gap |
|---|---|---|---|
| Cell category | night, early, day, work, evening | `hourCategory`; `schedule.js:27` | Sound and tested; work hours win over clock-derived categories. |
| Overlap band | work, awake, none | `overlapColumns`; `schedule.js:35` | Sound; each column is all-work, else all-awake, else unbanded. |
| Slot quality | work, awake, mixed | `slotQuality`; `schedule.js:97` | Sound and tested; `offenders` names who is outside. |
| Best-slot outcome | shared work, shared awake, none | `bestSlotFor`; `schedule.js:145` | Sound; work window first, awake fallback, `null` when neither exists. |
| Zone catalog source | platform list, curated fallback | `allTimeZones`; `zones.js:73` | Sound; platform list when available, curated list otherwise. |

## 3. UI interaction state

| Machine | States | Source | Enforcement / gap |
|---|---|---|---|
| **Drag selection** | idle, dragging (anchored), idle | `dragging`, `anchor`, pointer events; `grid.js:157-176` | **Gap:** only `pointerup` ends a drag. `pointercancel` or a window blur leaves `dragging` true, so a later pointer move keeps resizing the slot. |
| Live clock / now marker | ticking, today, other day | 20 s timer, `updateNow`; `main.js:398`, `grid.js:104` | Sound; marker hidden unless the shown date is today in the reference zone. |
| Toast | idle, ok, error (auto-clear) | `say`, `statusTimer`; `main.js:67` | Sound; a new message clears the previous timer, and the tone is removed on clear. |
| Calendar action | disabled (no slot), enabled (slot) | `paintSummary`; `main.js:118` | Sound; changing the slot repaints, Reset returns to disabled. |
| Clipboard outcome | async ok, legacy ok, failed | `copyText`; `clipboard.js:6` | Sound and tested; each outcome is reported honestly. |

## 4. Static server

| Machine | States | Source | Enforcement / gap |
|---|---|---|---|
| HTTP request outcome | served, not found, method not allowed, traversal refused | `safePath`, handler; `scripts/serve.mjs` | Sound and tested: GET/HEAD only, public entries only, `..`, encoded traversal and NUL refused. |

## Cross-cutting findings (verified)

1. **Persisted state is not version-safe.** The project guideline says a loader
   refuses an unsupported version without modifying the file. Live probe:
   `decodePlan` accepted `v:2`, `v:99` and `v:"2"` and returned version 1.
2. **Bad input fails silently or catastrophically.** A malformed share link is
   replaced with the example plan; `2026-02-31` builds a grid whose cells are
   all `1970-01-01` (probe: `startUtc: null`, `dayOffset: -1`); a non-finite
   slot throws `TypeError: Cannot read properties of undefined (reading
   'startUtc')`.
3. **The AX surface bypasses normalization.** `globalThis.meridian` exposes
   `setDate`, `setSlot` and `addParticipant`, but only `addParticipant`'s zone is
   validated; dates, slot numbers and work hours are not.
4. **Duration has two sources of truth.** The dropdown stores the desired
   length; a selected slot stores the actual length; they are reconciled by the
   unnamed `<= 12` rule, so long drags silently diverge.
5. **The URL fragment has two owners.** The plan codec and the skip link both
   write `location.hash`; a11y navigation can drop the shareable plan.
   **Fixed by P10.**
6. **Empty states are implicit but sound.** `start === end` means "no work
   day"; no shared work window falls back to awake; no slot disables calendar
   actions. These are correct but undocumented.
7. **Derived machines are sound.** Categories, overlap, quality, best window
   and zone catalog are pure, deterministic and covered by the unit suite.

## Post-fix status (ADR-002)

Eight of the nine gap machines are closed at their boundaries:

- plan version (P2): an unsupported `v` is refused; a missing `v` is legacy 1.
- share-hash read (P3): `empty`/`valid`/`invalid`, with a visible message for
  an invalid link.
- plan mutation and date (P4): impossible dates are refused and date stepping
  lives in `src/core/time.js` as `stepDateISO`.
- selected slot (P5): `normalizeSlot` clears a non-finite selection instead of
  letting it reach `slotSummary`.
- duration (P7): `MAX_SYNCED_DURATION` and `nextDuration` name the previously
  implicit `<= 12` rule.
- work day (P6): `normalizeWorkHour` guards add, change and normalization.
- zone form (P9): `canonicalZone` stores the catalog casing.
- drag (P8): `pointercancel` and window blur end the gesture.

The ninth, URL fragment ownership (P10), is closed: the skip link now moves
focus to the timeline without replacing the plan hash. P1 makes every machine
above readable at `meridian.machines`.

## Verification pass (findings re-checked)

- Re-read all of `src/core` and `src/ui`, plus `index.html`, `scripts/serve.mjs`
  and every test. Each claimed transition was matched to its call site.
- Live probe 1 (`state.js`): `v:1` -> 1, `v:2`/`v:99`/`v:"2"` -> 1; missing `v`
  -> 1; `normalizePlan({version:2})` -> 1; lowercase zone is valid and labels
  `istanbul`; `normalizeParticipant` clamps `99/-5` but the add path does not.
- Live probe 2 (`schedule.js`): `slotSummary(plan, NaN, 1)` throws; an impossible
  date produces `startUtc: null` columns and 1970 cells.
- Baseline before edits: `npm test` -> **47 tests, 47 pass**; `npm run dogfood`
  -> **[OK]** over the real UI.
- Re-checked the gaps: version, hash feedback, date, slot, work hours, duration,
  drag cancel, zone form and skip-link ownership are all confirmed; the derived
  machines and the server have no gap.
- After edits: `npm test` -> **59 tests, 59 pass** across 8 suites;
  `npm run dogfood` -> **[OK]**, including malformed-link, impossible-date,
  non-finite-slot, lowercase-zone, cancelled-drag and AX-surface checks.

## Evidence anchors

- Plan/version/hash: `src/core/state.js:10`, `:15`, `:35`, `:52`, `:73`, `:91`,
  `:119`, `:131`; `src/ui/main.js:77`, `:84`, `:99`, `:106`, `:153`, `:165`,
  `:240`, `:355`, `:363`.
- Schedule: `src/core/schedule.js:8-11`, `:20`, `:27`, `:35`, `:52`, `:66`,
  `:97`, `:120`, `:145`.
- Time/zones: `src/core/time.js:31`, `:46`, `:53`, `:74`, `:89`; `src/core/zones.js:73`,
  `:87`, `:96`.
- UI: `src/ui/grid.js:12`, `:91`, `:104`, `:157-176`, `:179`; `src/ui/panel.js:11`;
  `src/ui/format.js:26`; `src/ui/clipboard.js:6`; `index.html:16`.
- Server: `scripts/serve.mjs` (`safePath`, `handle`, `startServer`).
