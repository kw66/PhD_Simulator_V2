# Decimal attribute consumer audit — 2026-10-08

The confirmed rule is deterministic percentage resistance for research, social and advisor favor. Each raw point retains 100%, 75%, 50% or 25% according to the updated attribute tier; fractional raw remainders retain the same fraction. Resistance does not draw randomness. This supersedes older stochastic resistance examples.

## Fixes

| Consumer | Finding and resolution |
| --- | --- |
| Fellow creation | `createCustomFellowProgressProfile` floored already resolved research from recruitment. Preserve research and affinity decimals when storing the profile. Recruitment preview, deferred patches and final profiles now agree. |
| Fellow cooperation | Preserve decimal affinity and externally supplied cooperation progress; completion counts remain integers and overflow is retained. |
| Summer travel refresh | Removed reconstruction of resistance as either zero or one resisted point and reuse of stale/capped effects. Refresh computes the original raw social +1 against current social, including previously capped zero rewards, without rerolling. Preview refresh does not settle; confirmation applies the resolved decimal once. |
| Conference activities | Base/advanced option builders previously returned raw +1 research/social effects directly. Resolve those raw rewards once in the builders and format their actual result. Pass the player's research capacity through the engine builder so research above 20 is supported. The generic event settlement remains a direct application of pre-resolved effects. |
| Lover paper help | Stored research and lower-partner growth remain decimal. Paper scoring deliberately normalizes contributions to integers; the reward preview, pending output amount and actual-help log now agree with that existing output rule. |

## Audited rules retained

- `getResearchCap` and `clampResearchToCap` already preserve decimals in the inspected worktree. Added regression coverage for fractional attributes and caps; no additional cap-helper edit was needed.
- Fellow proactive collaboration retains `floor(player research) + random integer 0..5`, explicitly recorded in `PAPER_COLLABORATION.md`. Fellow monthly project output retains its existing integer-output formula. These operations never rewrite stored research.
- Fellow pending paper-help amounts and `v2-paper-collaboration.ts` normalize paper output to whole points. Lover help now uses the same output boundary. Research-operation candidate scores, review scores, thesis/career progress and completion counts retain their explicit rounding formulas.
- Lover active-route and passive-route floors are explicit formulas in `LOVER_SYSTEM.md`; retained. Initial research and lower-partner research rewards already use deterministic resistance and preserve fractional results.
- Conference favor costs and random/fixed-event producers using `applyTierResist` retain their resolved decimals. Direct event settlement and deferred numeric patches do not invoke resistance again; explicit zero effects remain zero.
- Campus social events reserve their poker/resistance/attendance/song draw slots explicitly. Conference decisions reserve three favor slots before activity selection. Kept those fixed partitions even though resistance no longer consumes randomness. Regression checks cover branch/option identity and no live randomness during refresh.
- Recruitment candidate RNG streams, candidate identity, cohort and collision behavior remain unchanged. Guided undergraduates start below tier 6, so their existing research +1 is unresisted by definition.

## Regression expectations

Initial raw research `2 * academicYear + offset` produces these values for offsets 0–3: year 2 `[4, 5, 6, 6.75]`, year 4 `[7.5, 8.25, 9, 9.75]`, year 6 `[10.5, 11.25, 12, 12.5]`. Raw 15 becomes `6 + 8 * 0.75 + 0.5 = 12.5` because the last step starts at tier 12. Smart-lover +4 joins the initial raw reward before this calculation; intimacy is the next independent draw.

Annual snapshot example: player research 6 with raw inheritance +1 becomes 6.75; fellows starting `[6, 6, 10]` with raw rewards `[3, 3, 2]` become `[8.25, 8.25, 11.5]`; lover research 6 with raw +2 becomes 7.5. Calendar attribution and once-only settlement assertions are retained.

## Scope and validation

Excluded from edits: `v2-sanity-rules.ts`, `v2-advisor-progress.ts`, content, monthly effects, lab payroll/projects, fellow finance, ending system, all `src/app` files, and other workers' tests. The existing unrelated finance change in `v2-fellow-research.ts` is preserved.

Owned tests: `v2-decimal-attributes`, `v2-fellow-progression`, `v2-relationship-initialization`, `v2-recruitment-rng`, `v2-lab-inheritance-calendar`: 73/73 pass. These exercise decimals, caps, recruitment finalization, deferred zero effects, single resistance settlement, summer refresh and fixed random partitions. Typecheck and diff whitespace checks pass.

Earlier adjacent diagnostic snapshot: 160/169 tests passed. Report: `.codex-temp/decimal-consumers-adjacent-tests.json`. Eight failures concerned prior stochastic/integer resistance expectations in conference/fixed-event suites. One fellow-research test compared the full paper after month advancement; that case passes on a subsequent isolated run, so the earlier mismatch is not classified as a confirmed decimal bug. Those test files were not edited by this task.

After the fixed-event worker updated expectations, a combined run of the five owned suites plus `v2-fixed-event-refresh` passes 85/85. All six reunion cases retain the no-global-RNG assertion. The reported extra draw could not be reproduced in either an isolated or combined run. Current code resolves the winter branch from `fixedResultPreview.rolls` and calls deterministic resistance without drawing; no production change or assertion removal was made for that report. The earlier diagnostic report is a snapshot of an actively changing shared worktree, not the final full-suite status. No commit was created.
