# State-Machine Proposals

Status: analysis and verification of the fixes proposed after
`docs/state_machines.md`. Nine proposals pass and are implemented; five are
deferred with the reason. The inventory is the source of the gaps.

## Decision criteria

A proposal passes only when **all** hold:

1. **UX/DX/AX gain is concrete** - it removes a hidden state, a wrong verdict, a
   silent failure, a crash, or a discoverability gap.
2. **No pinned behaviour is weakened** - an existing unit test or dogfood step
   that pins current behaviour is a product decision, not a bug to edit away.
3. **Blast radius is bounded** - one machine's boundary or one read-only
   surface; no multi-surface rewrite without a migration.
4. **Failing-first evidence exists** - the test or dogfood assertion fails on
   the old tree and passes after the change.
5. **The full suite and the read-only gates pass** - no gate is bypassed.

## Proposals and verdicts

| # | Proposal | UX | DX | AX | Risk | Verdict |
|---|---|---|---|---|---|---|
| P1 | Declare the machines in `src/core/machines.js` and expose them to the AX surface | Med | High | High | Low | **PASS** |
| P2 | Refuse an unsupported plan schema version | High | High | High | Low | **PASS** |
| P3 | Return an explicit hash-read outcome and report a malformed share link | High | Med | High | Low | **PASS** |
| P4 | Reject impossible dates and move date stepping into the core | High | Med | High | Low | **PASS** |
| P5 | Normalize the selected slot at the boundary and stop the NaN crash | Med | High | High | Low | **PASS** |
| P6 | Normalize work hours at every plan boundary | Low | High | High | Low | **PASS** |
| P7 | Name the duration sync rule and bound duration values | Med | Med | High | Low | **PASS** |
| P8 | End a drag on `pointercancel` and window blur | Med | Med | Med | Low | **PASS** |
| P9 | Canonicalize zone identifiers on input | Med | Med | High | Med | **PASS** |
| P10 | Give the plan exclusive ownership of the URL fragment | Med | Low | Med | Med | Deferred |
| P11 | Warn when a work day is zero-length | Low | Med | Med | Med | Deferred |
| P12 | Choose column-bound or instant-bound slots across date/zone changes | Med | Low | Med | Med | Deferred |
| P13 | Extract the whole UI state into a pure reducer | Low | High | High | High | Deferred |
| P14 | Expose a complete AX snapshot (status, hash outcome, every machine) | Low | Med | Med | Low | Deferred |

## Implemented proposals

### P1 - explicit registry

`src/core/machines.js` declares every machine from the inventory as data:
states, initial state, allowed transitions, source and the known gap. The table
is deep-frozen; `canTransition` is the read-only query; `globalThis.meridian`
exposes the same table as `meridian.machines` for agents. Unit tests assert every
transition target is a declared state, every initial state is a state, and the
runtime vocabularies match: cell categories equal `CATEGORY_TEXT` keys, hash
outcomes equal `HASH_STATUS` values, quality levels equal the three values
`slotQuality` returns, and the plan-version state names the live
`STATE_VERSION`.

Why it passes: additive, no runtime transition changes; DX gets one place to
change a vocabulary, AX gets a machine-readable contract, and a drift test makes
the documentation falsifiable.

### P2 - version-safe persisted state

`normalizePlan` refuses `raw.version` when it is present and not
`STATE_VERSION`; `decodePlan` now passes the payload's `v` through instead of
dropping it. A payload without `v` is treated as the legacy version 1 so old
hand-written links keep working.

Why it passes: the project guideline already requires a loader to refuse an
unsupported version without modifying the file. The change is one guard at the
loader boundary; valid v1 links and every current test are unchanged.

Failing-first: `decodePlan` accepted `v:2`, `v:99` and `v:"2"` on the old tree.

### P3 - explicit hash-read outcome

`readShareHash(hash)` returns `{status, plan}` where status is `empty`, `valid`
or `invalid` (`HASH_STATUS`). `main.js` loads a plan from the valid outcome,
keeps the example plan with an error toast on the invalid outcome, and shows the
error on a later `hashchange` without replacing the current plan.

Why it passes: the user finally learns that a shared link was unreadable, and a
non-plan fragment such as the skip link's `#grid` is `empty`, not `invalid`, so
it does not raise a false error.

### P4 - date validation and core date stepping

`setDate` validates with `parseDateISO`, not a shape-only regex, and returns
`false` without touching the plan for an impossible date. `dateStep` moves to
`src/core/time.js` as `stepDateISO`, which validates its input and handles month,
year and leap-day boundaries.

Why it passes: an impossible date previously produced a grid of 1970 cells with
no error; the fix is one validator at the mutation boundary and keeps the date
stepper's behaviour.

Failing-first: probe showed `2026-02-31` produced `startUtc: null` columns and
1970-01-01 cells.

### P5 - slot boundary normalization

`normalizeSlot(slot)` returns `null` for a non-finite start and clamps a finite
start to `0..DAY_HOURS-1` and hours to `1..min(MAX_SLOT_HOURS, DAY_HOURS-start)`.
`clampSlot` uses it, so the AX setter cannot reach `slotSummary` with `NaN`.

Why it passes: the old `clampSlot` propagated `NaN` and `slotSummary` threw
`TypeError`; a normalized null clears the selection instead of crashing. Every
UI path already supplies finite columns, so no visible flow changes.

Failing-first: probe showed `slotSummary(plan, NaN, 1)` threw
`Cannot read properties of undefined (reading 'startUtc')`.

### P6 - work-hour normalization

The private `clampHour` becomes the exported `normalizeWorkHour(value, fallback)`
and is used by `normalizeParticipant`, `addParticipant` and
`changeParticipant`. A non-integer or out-of-range value falls back to the
current/default hour instead of entering the schedule.

Why it passes: the UI selects only 0-23, so the visible flow is unchanged; the
AX boundary stops storing `99` or `-5`, which produced nonsensical work windows.

### P7 - explicit duration rule

`normalizeDuration` bounds the Length value to `1..MAX_SLOT_HOURS` and
`nextDuration(current, hours)` names the existing rule: a selected slot updates
the desired length only when it is at most `MAX_SYNCED_DURATION` (12). The
threshold is preserved exactly, so long drags still do not rewrite the user's
meeting length, but the rule is now a tested function instead of an unnamed
`<= 12` in `main.js`.

Why it passes: no UX change; DX/AX get a named, testable invariant. The old
behaviour is pinned by the new tests.

### P8 - drag terminal states

`grid.js` ends the drag on `pointerup`, `pointercancel` and window `blur`. A
cancelled gesture no longer leaves `dragging` true, so the next pointer move
cannot keep resizing the slot.

Why it passes: normal drags and clicks are unchanged; the only changed path is
one that previously stuck. Dogfood dispatches `pointercancel` mid-gesture and
asserts the slot no longer follows the pointer.

### P9 - canonical zone identifiers

`canonicalZone(value)` trims, matches the catalog case-insensitively, and falls
back to any alias `Intl` accepts. Plan normalization, participant add/change,
the reference zone and the default plan all store the canonical form. An invalid
zone still returns `null` and keeps the previous value.

Why it passes: `europe/istanbul` no longer renders the label `istanbul` or
produce a non-canonical share link; valid aliases outside the catalog still work.
The blast radius is the zone input boundary only, covered by unit tests and a
dogfood step.

## Deferred proposals and why

- **P10 (fragment ownership).** The skip link's `#grid` replaces the plan hash
  until the next write. Fixing it means changing the accessible skip-link
  behaviour (intercept the click and move focus) or introducing a second state
  channel. That is an accessibility/product decision, not a mechanical guard;
  the plan remains intact in memory and the Copy link button restores the hash.
- **P11 (zero-length work day).** `start === end` meaning "no work day" is
  pinned by a test and is a coherent choice. A warning is a product decision;
  the machine is now documented as `zero-length`.
- **P12 (slot binding).** The selected slot is column-bound: changing the date
  or reference zone keeps the column, not the instant. Both readings are
  defensible; changing it silently would break the date stepper's expected
  behaviour. Documented, not changed.
- **P13 (pure reducer).** Extracting all UI state would give the strongest DX/AX
  contract, but it rewrites the bootstrap, grid and panel in one step and needs
  a migration for the timers and drag gesture. The boundary helpers and the
  registry already remove the dangerous transitions.
- **P14 (full AX snapshot).** `meridian.duration`, `meridian.hashStatus` and
  `meridian.machines` are added; a full serializable snapshot is a follow-up so
  it does not become a second state surface to keep in sync.

## Verification

- Baseline before edits: `npm test` -> **47 tests, 47 pass**; `npm run dogfood`
  -> **[OK]**.
- Failing-first: the new unit tests fail on the old exports; the new dogfood
  assertions fail on the old UI (impossible date accepted, malformed hash
  silent, cancelled drag still resizes).
- After implementation: full `npm test` and `npm run dogfood` results are
  recorded in the task checkpoint and the final report.
