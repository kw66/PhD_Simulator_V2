export const CURRENT_GAMEPLAY_RULESET = "20261020-r12";
export const SUPPORTED_GAMEPLAY_RULESETS = ["20261016-r1", "20261017-r2", "20261017-r3", "20261017-r4", "20261017-r5", "20261017-r6", "20261018-r7", "20261018-r8", "20261018-r9", "20261019-r10", "20261019-r11", CURRENT_GAMEPLAY_RULESET] as const;
export type GameplayRuleset = typeof SUPPORTED_GAMEPLAY_RULESETS[number];
let replayRuleset: GameplayRuleset | undefined;

/** Ordinary play includes all fixes; replay retains the rules at the time of each command. */
export function usesGameplayRulesFrom(minimum: GameplayRuleset): boolean {
  return replayRuleset === undefined || SUPPORTED_GAMEPLAY_RULESETS.indexOf(replayRuleset) >= SUPPORTED_GAMEPLAY_RULESETS.indexOf(minimum);
}
/** The original r4 behavior fixes remain active in r4 replays after later releases. */
export function usesCurrentGameplayRules(): boolean {
  return usesGameplayRulesFrom("20261017-r4");
}
export function withGameplayRuleset<T>(ruleset: GameplayRuleset, action: () => T): T {
  const previous = replayRuleset;
  replayRuleset = ruleset;
  try { return action(); } finally { replayRuleset = previous; }
}
