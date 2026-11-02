# Decisions

Why this project is built the way it is, oldest first. One entry per decision that changes a
contract, a dependency, a data format or the architecture; IDs are consecutive and never reused.

### ADR-001: First screenshot keepers are desktop plan plus 390px phone
- **Date**: 2026-11-03
- **Status**: Accepted
- **Context**: The README showed only the 2026-10-30 capture while `media.json` carried the same path twice (99b468f/d8bf86e); the embeddable-build commits landed since.
- **Decision**: Merge the duplicate 10-30 entry (keep the human d8bf86e review as history) and add `2026-11-03-home.png` (default two-zone plan, 1440x900) plus `2026-11-03-mobile.png` (same build at 390x844, calendar-button clip disclosed) from `npm start` at commit `981454d`, in `.aikit/media.json` and the README `aegean:screenshots` block.
- **Consequences**: README proves desktop and responsive proof together. Reproduce with: `npm start`, headless `--screenshot` at both window sizes.

<!-- Entry format:
### ADR-NNN: <decision in one line>
- **Date**: YYYY-MM-DD
- **Status**: Accepted
- **Context**: <what forced the decision>
- **Decision**: <what was decided>
- **Consequences**: <what follows, including what it costs>
-->
