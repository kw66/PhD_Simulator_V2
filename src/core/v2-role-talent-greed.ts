import { gameRandom } from "./v2-game-random";
import { recordPersonalIncome } from "./v2-money";
import { recordPersonalSpending, roundMoney } from "./v2-money";
import { getPlayerAttributeCap } from "./v2-player-attributes";
import { applyGreedConversionBatch, type GreedRandomCursor } from "./v2-greed-conversion-batch";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { GameState } from "./v2-types";
import { describeTalentChange, recordTalentTrigger } from "./v2-talent-history";

const precise = (value: number) => Number(value.toFixed(10));
const ATTRIBUTES = ["research", "social", "favor"] as const;

function logGreed(before: GameState, after: GameState, name: string, reason: string): GameState {
  const labels = { san: "SAN", research: "科研", social: "社交", favor: "导师好感", money: "金币" } as const;
  const effects = (Object.keys(labels) as Array<keyof typeof labels>).filter((stat) => before.player[stat] !== after.player[stat])
    .map((stat) => describeTalentChange(labels[stat], before.player[stat], after.player[stat]));
  for (const stat of ATTRIBUTES) {
    if (getPlayerAttributeCap(before, stat) !== getPlayerAttributeCap(after, stat)) {
      effects.push(describeTalentChange(`${labels[stat]}上限`, getPlayerAttributeCap(before, stat), getPlayerAttributeCap(after, stat)));
    }
  }
  return effects.length === 0 ? after : recordTalentTrigger(after, `greed:${after.totalMonths}:${after.eventHistory.length}:${name}`, {
    name, recipient: "你", reason, effects,
  });
}

function randomSource(state: GameState, injected?: () => number): { roll: () => number; finish: (value: GameState) => GameState; cursor?: GreedRandomCursor } {
  const cursor = { value: state.roleTalents?.greedRandomState ?? (((state.conferenceLocationSeed ?? 1) ^ 0x6d2b79f5) >>> 0) };
  return {
    roll: injected ?? (() => {
      cursor.value = (Math.imul(cursor.value, 1664525) + 1013904223) >>> 0;
      return cursor.value / 4294967296;
    }),
    finish: (value) => injected ? value : { ...value, roleTalents: { ...value.roleTalents!, greedRandomState: cursor.value } },
    ...(!injected ? { cursor } : {}),
  };
}

/** Queue reactions until the enclosing action/month batch has fully committed. */
export function applyGreedAttributeLoss(state: GameState, amount: number, _getRoll: () => number = gameRandom): GameState {
  if (state.selectedRoleId !== "rich-reversed" || !state.roleTalents || !(amount > 0)) return state;
  const loss = getRoleTalentLevel(state, "loss-to-money") > 0
    ? precise((state.roleTalents.greedLossRemainder ?? 0) + amount) : 0;
  const games = getRoleTalentLevel(state, "coin-game") > 0
    ? precise((state.roleTalents.coinGameRemainder ?? 0) + amount) : 0;
  const next = { ...state, player: { ...state.player, money: roundMoney(state.player.money + Math.floor(loss)) },
    roleTalents: { ...state.roleTalents, greedLossRemainder: precise(loss - Math.floor(loss)),
      coinGameRemainder: precise(games - Math.floor(games)),
      pendingCoinGames: (state.roleTalents.pendingCoinGames ?? 0) + Math.floor(games),
    },
  };
  return logGreed(state, recordPersonalIncome(next, Math.floor(loss)), "因祸得财", `三项属性实际下降累计满${Math.floor(loss)}点`);
}

export function getGreedResetTarget(state: GameState): number {
  return state.selectedRoleId === "rich-reversed" && getRoleTalentLevel(state, "spend-to-break-curse") > 0
    ? Math.floor((state.roleTalents?.greedQualifiedSpending ?? 0) / 100) : 0;
}

/** The curse is an exact reset; its dedicated loss reactions are the sole exception to reset exclusion. */
export function settleGreedReset(state: GameState): GameState {
  if (state.selectedRoleId !== "rich-reversed" || !state.roleTalents || state.totalMonths <= 1
    || state.roleTalents.lastGreedResetMonth === state.totalMonths) return state;
  const target = getGreedResetTarget(state);
  let loss = 0;
  const player = { ...state.player, san: Math.min(state.sanCap, target) };
  for (const stat of ATTRIBUTES) {
    player[stat] = Math.min(getPlayerAttributeCap(state, stat), target);
    loss = precise(loss + Math.max(0, state.player[stat] - player[stat]));
  }
  const reset = { ...state, player,
    roleTalents: { ...state.roleTalents, lastGreedResetMonth: state.totalMonths },
  };
  return applyGreedAttributeLoss(logGreed(state, reset, "金钱诅咒", `月初SAN及三项属性重置至${target}，受各自上限限制`), loss);
}

/** Deferred spending rewards cannot be overwritten by the caller's cost commit. */
export function settleGreedSpendingConversions(state: GameState, getRoll?: () => number, cursor?: GreedRandomCursor): GameState {
  if (state.selectedRoleId !== "rich-reversed" || !state.roleTalents) return state;
  const count = state.roleTalents.pendingMoneyConversions ?? 0;
  if (count <= 0) return state;
  const random = randomSource(state, getRoll);
  const next = applyGreedConversionBatch(state, count, random.roll, cursor ?? random.cursor);
  return logGreed(state, random.finish(next), "钱能通神", `实际消费累计${count}金币，随机转化${count}次`);
}

/** Freeze the game count before the first roll; losses/rewards never append to this batch. */
export function settleGreedCoinGames(state: GameState, getRoll?: () => number): GameState {
  if (state.selectedRoleId !== "rich-reversed" || !state.roleTalents) return state;
  const random = randomSource(state, getRoll);
  let next = settleGreedSpendingConversions(state, random.roll, random.cursor);
  const count = next.roleTalents?.pendingCoinGames ?? 0;
  if (count <= 0) return next === state ? state : random.finish(next);
  next = { ...next, roleTalents: { ...next.roleTalents!, pendingCoinGames: 0 } };
  const failureMultiplier = 0.4 + getRoleTalentLevel(next, "coin-game-comeback") * 0.05;
  const boundedStake = usesGameplayRulesFrom("20261022-r20");
  for (let index = 0; index < count; index += 1) {
    const moneyBefore = next.player.money;
    const multiplier = random.roll() < 0.5 ? 1.5 : failureMultiplier;
    const stake = Math.min(5, Math.max(0, moneyBefore));
    const money = roundMoney(boundedStake ? moneyBefore - stake + stake * multiplier : moneyBefore * multiplier);
    next = recordPersonalIncome({ ...next, player: { ...next.player, money } }, money - moneyBefore);
    // Wager losses are not purchases. Keep the old feedback only for old replays.
    if (!boundedStake && money < moneyBefore) next = settleGreedSpendingConversions(recordPersonalSpending(next, moneyBefore - money), random.roll, random.cursor);
  }
  return logGreed(state, random.finish(next), "金币游戏", boundedStake
    ? `本批${count}次判定，每次投入至多5金币，亏损不计消费`
    : `本批冻结${count}次判定，消费转化不会追加本批次数`);
}
