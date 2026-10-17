export const CURRENT_GAMEPLAY_RULESET = "20261017-r4";
export const SUPPORTED_GAMEPLAY_RULESETS = ["20261016-r1", "20261017-r2", "20261017-r3", CURRENT_GAMEPLAY_RULESET] as const;
export type GameplayRuleset = typeof SUPPORTED_GAMEPLAY_RULESETS[number];
let replayRuleset: GameplayRuleset | undefined;

/** Ordinary play uses current rules; old commands replay under their original rules. */
export function usesCurrentGameplayRules(): boolean {
  return replayRuleset === undefined || replayRuleset === CURRENT_GAMEPLAY_RULESET;
}
export function withGameplayRuleset<T>(ruleset: GameplayRuleset, action: () => T): T {
  const previous = replayRuleset;
  replayRuleset = ruleset;
  try { return action(); } finally { replayRuleset = previous; }
}
