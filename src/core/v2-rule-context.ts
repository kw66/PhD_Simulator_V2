export const CURRENT_GAMEPLAY_RULESET = "20261024-r47";
export const SUPPORTED_GAMEPLAY_RULESETS = ["20261016-r1", "20261017-r2", "20261017-r3", "20261017-r4", "20261017-r5", "20261017-r6", "20261018-r7", "20261018-r8", "20261018-r9", "20261019-r10", "20261019-r11", "20261020-r12", "20261021-r13", "20261021-r14", "20261022-r15", "20261022-r16", "20261022-r17", "20261022-r18", "20261022-r19", "20261022-r20", "20261022-r21", "20261022-r22", "20261022-r23", "20261022-r24", "20261022-r25", "20261022-r26", "20261022-r27", "20261023-r28", "20261023-r29", "20261023-r30", "20261023-r31", "20261023-r32", "20261023-r33", "20261023-r34", "20261023-r35", "20261023-r36", "20261023-r37", "20261023-r38", "20261023-r39", "20261023-r40", "20261023-r41", "20261023-r42", "20261023-r43", "20261023-r44", "20261023-r45", "20261023-r46", CURRENT_GAMEPLAY_RULESET] as const;
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
