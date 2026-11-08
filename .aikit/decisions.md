# Decisions

Why this project is built the way it is, oldest first. One entry per decision that changes a
contract, a dependency, a data format or the architecture; IDs are consecutive and never reused.

### ADR-001: First screenshot keepers are desktop plan plus 390px phone
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: The README showed only the 2026-10-30 capture while `media.json` carried the same path twice (99b468f/d8bf86e); the embeddable-build commits landed since.
- **Decision**: Merge the duplicate 10-30 entry (keep the human d8bf86e review as history) and add `2026-11-03-home.png` (default two-zone plan, 1440x900) plus `2026-11-03-mobile.png` (same build at 390x844, calendar-button clip disclosed) from `npm start` at commit `981454d`, in `.aikit/media.json` and the README `aegean:screenshots` block.
- **Consequences**: README proves desktop and responsive proof together. Reproduce with: `npm start`, headless `--screenshot` at both window sizes.

### ADR-002: State machines are explicit and validated at their boundaries
- **Date**: 2026-11-08
- **Status**: Accepted
- **Context**: A verified inventory found 20 implicit state machines and seven gaps: the plan's `v` was ignored (so v2/v99 loaded as v1, against the persisted-state rule in `guidelines.md`), a malformed share link was silently replaced, `2026-02-31` produced a 1970 grid, a non-finite slot threw in the summary, `addParticipant` stored work hours like 99, the duration/selected-slot rule was an unnamed `<= 12`, a cancelled drag kept resizing, and lowercase zones kept lowercase labels.
- **Decision**: Add `src/core/machines.js` as the read-only registry (20 machines) and expose it as `meridian.machines`; validate the plan version, hash outcome, date, slot, duration, work hours and zone form at their boundaries; keep the existing duration sync rule (now `MAX_SYNCED_DURATION`/`nextDuration`); end drags on `pointercancel` and blur. The inventory and proposal verdicts live in `docs/state_machines.md` and `docs/state_machine_proposals.md`.
- **Consequences**: Old links without `v` still load as version 1; a future version is refused with a visible message; impossible dates, non-finite slots and out-of-range work hours leave the plan unchanged instead of breaking it; lowercase zones render and share in catalog form. The deferred proposals (fragment ownership, zero-length work-day warning, slot binding, pure reducer, full AX snapshot) remain documented in the proposals file.

<!-- Entry format:
### ADR-NNN: <decision in one line>
- **Date**: YYYY-MM-DD
- **Status**: Accepted
- **Context**: <what forced the decision>
- **Decision**: <what was decided>
- **Consequences**: <what follows, including what it costs>
-->
