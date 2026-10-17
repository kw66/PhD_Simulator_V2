import { gameRandom } from "./v2-game-random";
import { usesCurrentGameplayRules } from "./v2-rule-context";
import { getCaptainLevel, getCaptainLoverId, getCaptainLoverIntimacyCap, getCaptainLoverResearchCap, getCaptainLoverRouteMax, getCaptainLoverHelpQueue, setCaptainLoverHelpQueue, isCaptain } from "./v2-captain-state";
import { recordAchievementSanCapGain } from "./v2-achievement-runtime-types";
import { getEffectiveResearch, getEffectiveSocial } from "./v2-effective-attributes";
import { getRecoveredSan } from "./v2-san-recovery";
import { getRelationshipSanCost, addOrReplaceBuffs } from "./v2-buffs";
import { pushLog, pushMilestoneLog, pushNoOpLog } from "./v2-engine-helpers";
import { addPaperCollaboration } from "./v2-paper-collaboration";
import { getLoverName } from "./v2-lover-system";
import { applyPlayerAttributeChange } from "./v2-player-attributes";
import { formatSanPayment, paySanCost, quoteSanPayment } from "./v2-role-talent-costs";
import { generateRelationshipResearch } from "./v2-relationship-research";
import { formatMoney, recordPersonalSpending } from "./v2-money";
import { applyTierResist } from "./v2-sanity-rules";
import { describeResistedTalentReward, describeTalentReward, recordTalentTrigger } from "./v2-talent-history";
import type { GameState, LoverProgressState, LoverTypeId } from "./v2-types";

const LOVER_RELATION_MAX = 40;
export const LOVER_TASK_MAX = 100;
export const LOVER_DATE_MONEY_COST = 2;
export const LOVER_ROUTES = ["play", "study", "shopping"] as const;
export type LoverRoute = typeof LOVER_ROUTES[number];
const ROUTE_LABELS = { play: "玩耍", study: "学习", shopping: "购物" };

export function createLoverProgressState(type?: LoverTypeId, random: () => number = gameRandom, academicYear = 1): LoverProgressState {
  return {
    active: Boolean(type),
    research: type ? generateRelationshipResearch(academicYear, random, type === "smart" ? 3 : 0) : 0,
    intimacy: type ? applyTierResist(3 + Math.floor(random() * 4) + (type === "beautiful" ? 3 : 0), 0, random).effectiveChange : 0,
    taskProgress: 0,
    taskMax: LOVER_TASK_MAX,
    relationProgress: 0,
    relationMax: LOVER_RELATION_MAX,
    canInteract: false,
    taskUsedThisMonth: false,
    completedTaskCount: 0,
    routes: { play: { progress: 0, completed: 0 }, study: { progress: 0, completed: 0 }, shopping: { progress: 0, completed: 0 } },
    giftCoupons: 0,
    pendingPaperHelp: null,
    sanDiscountMonths: [],
  };
}

function getRoute(state: GameState, route: LoverRoute) {
  return state.loverProgressState.routes?.[route] ?? { progress: 0, completed: 0 };
}

export function getLoverRouteProgress(state: GameState, route: LoverRoute): number {
  return getRoute(state, route).progress;
}

export function getLoverRouteGain(state: GameState, route: LoverRoute): number {
  const lover = state.loverProgressState;
  if (route === "play") return Math.floor((lover.intimacy + getEffectiveSocial(state)) / 2);
  if (route === "study") return Math.floor((lover.research + getEffectiveResearch(state)) / 2);
  return Math.floor(lover.intimacy / 2) + 10;
}

export function getLoverRouteCost(state: GameState, route: LoverRoute): { money: number; san: number } {
  return { money: route === "play" ? 2 : route === "shopping" ? 3 : 0,
    san: route === "study" ? getRelationshipSanCost(state, 4) : 0 };
}

export function getLoverDateFailure(state: GameState, route: LoverRoute): string | null {
  if (state.phase !== "playing" || !state.loverState.active || !state.loverProgressState.active) return "恋爱后解锁";
  if (state.loverProgressState.taskUsedThisMonth || state.loverProgressState.lastDateTotalMonths === state.totalMonths) return "本月已约会，下月恢复";
  const cost = getLoverRouteCost(state, route);
  if (state.player.money < cost.money) return `金币不足，需要${cost.money}`;
  if (!quoteSanPayment({ ...state, player: { ...state.player, money: state.player.money - cost.money } }, cost.san).allowed) return `SAN不足，需要${cost.san}`;
  return null;
}

export function getLoverPassiveGains(state: GameState): { play: number; study: number } {
  const gain = Math.floor(state.loverProgressState.intimacy / 2);
  return state.loverState.type === "beautiful"
    ? { play: gain * 2, study: gain }
    : { play: gain, study: gain * 2 };
}

export function getLoverNextReward(state: GameState, route: LoverRoute): string {
  const intimacyGain = applyTierResist(route === "shopping" ? 2 : 1, state.loverProgressState.intimacy, () => 0, getCaptainLoverIntimacyCap(state)).effectiveChange;
  const intimacyReward = `、亲密 +${formatMoney(intimacyGain)}`;
  if (route === "shopping") return `下次购物免单${intimacyReward}`;
  const cycle = getRoute(state, route).completed % 3;
  return (route === "play"
    ? ["SAN +6", "SAN上限 +1", "下月SAN消耗 -1"]
    : [`论文最低项 +${Math.max(0, Math.floor(state.loverProgressState.research))}分`, "永久idea、实验、写作各 +1分", "双方科研较低者 +1，相同不提升"])[cycle]! + intimacyReward;
}

export function settlePendingLoverHelp(state: GameState, random: () => number = gameRandom): GameState {
  let next = state;
  do {
    const settled = settlePendingLoverHelpPass(next, random);
    if (settled === next) return next;
    next = settled;
  } while (isCaptain(next));
  return next;
}

function settlePendingLoverHelpPass(state: GameState, random: () => number): GameState {
  const help = state.loverProgressState.pendingPaperHelp;
  if (state.phase !== "playing" || !help || !state.loverState.active) return state;
  const targets = state.papers.flatMap((paper) => !paper.nonFirstAuthor && (paper.status === "draft" || paper.status === "journal-reviewing")
    ? (["idea", "experiment", "writing"] as const)
      .filter((field) => field === "idea" || (field === "experiment" ? paper.idea > 0 : paper.experiment > 0))
      .map((field) => ({ paper, field })) : []);
  if (targets.length === 0) return state;
  const lowestScore = Math.min(...targets.map(({ paper, field }) => paper[field]));
  const lowestTargets = targets.filter(({ paper, field }) => paper[field] === lowestScore);
  const target = lowestTargets[Math.floor(random() * lowestTargets.length)]!;
  const paper = addPaperCollaboration(target.paper, { paperId: target.paper.id,
    collaborator: { id: help.collaboratorId, name: help.name }, scores: { [target.field]: help.amount } });
  let nextState: GameState = { ...state,
    papers: state.papers.map((entry) => entry.id === paper.id ? paper : entry),
    loverProgressState: { ...state.loverProgressState, pendingPaperHelp: null },
  };
  if (isCaptain(state)) nextState = setCaptainLoverHelpQueue(nextState, getCaptainLoverHelpQueue(state).slice(1));
  return pushMilestoneLog(nextState, `恋人帮助：${help.name}帮你完善《${paper.title}》，${{ idea: "idea", experiment: "实验", writing: "写作" }[target.field]} +${paper[target.field] - target.paper[target.field]}`, "lover-help");
}

function advanceRoute(
  state: GameState,
  route: LoverRoute,
  gain: number,
  source = "约会",
  random: () => number = gameRandom,
  operationStartState: GameState = state,
): GameState {
  const original = getRoute(state, route);
  const total = original.progress + gain;
  const maximum = getCaptainLoverRouteMax(state);
  const completions = Math.floor(total / maximum);
  let nextState: GameState = { ...state, loverProgressState: { ...state.loverProgressState,
    routes: { play: getRoute(state, "play"), study: getRoute(state, "study"), shopping: getRoute(state, "shopping"),
      [route]: { progress: total % maximum, completed: original.completed + completions } },
  } };
  for (let completion = 0; completion < completions; completion += 1) {
    const count = original.completed + completion + 1;
    const cycle = (count - 1) % 3;
    const lover = nextState.loverProgressState;
    const playerResearch = getEffectiveResearch(nextState, operationStartState);
    const intimacyResult = applyTierResist(route === "shopping" ? 2 : 1, lover.intimacy, random, getCaptainLoverIntimacyCap(nextState));
    const intimacy = lover.intimacy + intimacyResult.effectiveChange;
    const effects = [describeResistedTalentReward("亲密", lover.intimacy, intimacyResult)];
    nextState = { ...nextState, loverProgressState: { ...lover, intimacy } };
    if (route === "play") {
      if (cycle === 0) {
        const san = getRecoveredSan(nextState.player.san, nextState.sanCap, 6, nextState.selectedRoleId);
        effects.push(describeTalentReward("SAN", 6, nextState.player.san, san));
        nextState = { ...nextState, player: { ...nextState.player, san } };
      } else if (cycle === 1) {
        nextState = recordAchievementSanCapGain({ ...nextState, sanCap: nextState.sanCap + 1 }, 1);
        effects.push("SAN上限 +1");
      } else {
        const month = state.totalMonths + 1;
        nextState.loverProgressState.sanDiscountMonths = [...new Set([...(lover.sanDiscountMonths ?? []), month])];
        effects.push("下月SAN消耗 -1，最低为0");
      }
    } else if (route === "shopping") {
      nextState.loverProgressState.giftCoupons = (lover.giftCoupons ?? 0) + 1;
      effects.push("购物免单 +1");
    } else if (cycle === 0) {
      const stored = lover.pendingPaperHelp;
      const amount = Math.max(0, lover.research) * (1 + 0.2 * getCaptainLevel(nextState, getCaptainLoverId(nextState), "teacher-child"));
      const help = { amount, collaboratorId: `lover:${state.loverState.startTotalMonths}:${getLoverName(state.loverState)}`,
        name: getLoverName(state.loverState) };
      if (isCaptain(nextState)) {
        nextState = setCaptainLoverHelpQueue(nextState, [...getCaptainLoverHelpQueue(nextState), help]);
        effects.push(`论文帮助已保留（最低项 +${Math.floor(amount)}分）`);
      } else {
        nextState.loverProgressState.pendingPaperHelp = stored ?? help;
        effects.push(stored ? `已有一次论文帮助待生效（${Math.floor(stored.amount)}分），不叠加`
          : `论文帮助已就绪（最低项 +${Math.floor(amount)}分）`);
      }
    } else if (cycle === 1) {
      const previous = nextState.buffs.find((buff) => buff.id === "lover-study-score");
      const bonus = (previous?.actionEffects?.idea?.bonus ?? 0) + 1;
      nextState = { ...nextState, buffs: addOrReplaceBuffs(nextState.buffs, [{
        id: "lover-study-score", name: "共同学习", source: "恋人学习", timing: "permanent", remainingMonths: null,
        actionEffects: { idea: { bonus }, experiment: { bonus }, writing: { bonus } },
      }]) };
      effects.push(`永久idea、实验、写作各 +1分（累计 +${bonus}）`);
    } else if (lover.research < playerResearch) {
      const result = applyTierResist(1, lover.research, random, getCaptainLoverResearchCap(nextState));
      nextState.loverProgressState.research = lover.research + result.effectiveChange;
      effects.push(describeResistedTalentReward("恋人科研", lover.research, result));
    } else if (playerResearch < lover.research) {
      const before = nextState.player.research;
      const change = applyPlayerAttributeChange(nextState, "research", 1, "ordinary");
      const result = change.result;
      effects.push(describeResistedTalentReward("你的科研", before, result));
      nextState = change.state;
    } else effects.push("双方科研相同，本次不提升科研");
    nextState = recordTalentTrigger(nextState, `lover:${state.loverState.startTotalMonths}:${getLoverName(state.loverState)}:${route}:${count}`, {
      name: "恋人", recipient: `你与${getLoverName(state.loverState)}`, reason: `${source}·${ROUTE_LABELS[route]}进度满${maximum}，第${count}次`, effects,
    });
  }
  return nextState;
}

export function advanceLoverDate(state: GameState, route: LoverRoute): GameState {
  const failure = getLoverDateFailure(state, route);
  if (failure) return pushNoOpLog(state, `约会：${failure}`);
  const cost = getLoverRouteCost(state, route);
  const gain = getLoverRouteGain(state, route);
  const prepared = { ...state, player: { ...state.player, money: state.player.money - cost.money } };
  const payment = quoteSanPayment(prepared, cost.san);
  const paid = recordPersonalSpending({ ...paySanCost(prepared, cost.san),
    loverProgressState: { ...state.loverProgressState, lastDateTotalMonths: state.totalMonths, taskUsedThisMonth: true } }, cost.money);
  return settlePendingLoverHelp(advanceRoute(pushLog(paid,
    `约会·${ROUTE_LABELS[route]}：进度 +${gain}${cost.money ? `，金币 -${cost.money}` : ""}${cost.san ? `，${formatSanPayment(payment)}` : ""}`), route, gain, "约会", gameRandom, state));
}

export function activateLoverMonthlyDiscount(state: GameState): GameState {
  if (!state.loverProgressState.sanDiscountMonths?.includes(state.totalMonths)) return state;
  const alreadyActive = state.buffs.some((buff) => buff.id === "lover-play-discount" && buff.remainingMonths === 1);
  const nextState = { ...state, buffs: addOrReplaceBuffs(state.buffs, [{
    id: "lover-play-discount", name: "约会余韵", source: "恋人玩耍", timing: "monthly", remainingMonths: 1, activeOperationSanDelta: -1,
  }]) };
  return alreadyActive ? nextState : pushMilestoneLog(nextState,
    `约会余韵生效：你与${getLoverName(state.loverState)}的玩耍奖励，本月SAN消耗 -1，最低为0`, "lover-discount");
}

export function advanceLoverMonth(state: GameState): GameState {
  const lover = state.loverProgressState;
  if (state.phase !== "playing" || !state.loverState.active || !lover.active
    || state.totalMonths <= (state.loverState.startTotalMonths ?? state.totalMonths)
    || state.totalMonths <= (lover.lastAdvancedTotalMonths ?? -1)) return state;
  const gains = getLoverPassiveGains(state);
  const accumulated = Number(((state.captainState?.loverAdvanceRemainder ?? 0)
    + 0.1 * getCaptainLevel(state, getCaptainLoverId(state), "chosen")).toFixed(10));
  const advances = 1 + (isCaptain(state) ? Math.floor(accumulated) : 0);
  let nextState: GameState = { ...activateLoverMonthlyDiscount(state), loverProgressState: { ...lover, taskUsedThisMonth: false, lastAdvancedTotalMonths: state.totalMonths,
    monthlyActivity: `玩耍进度 +${gains.play}，学习进度 +${gains.study}`,
    sanDiscountMonths: (lover.sanDiscountMonths ?? []).filter((month) => month > state.totalMonths) } };
  if (isCaptain(nextState)) nextState = { ...nextState, captainState: { ...nextState.captainState!, loverAdvanceRemainder: Number((accumulated - Math.floor(accumulated)).toFixed(10)) } };
  const totalGains = { play: 0, study: 0 };
  for (let index = 0; index < advances; index++) {
    const currentGains = isCaptain(nextState) ? getLoverPassiveGains(nextState) : gains;
    totalGains.play += currentGains.play;
    totalGains.study += currentGains.study;
    nextState = advanceRoute(nextState, "play", currentGains.play, "每月相处");
    nextState = settlePendingLoverHelp(advanceRoute(nextState, "study", currentGains.study, "每月相处"));
  }
  if (usesCurrentGameplayRules()) nextState = { ...nextState, loverProgressState: { ...nextState.loverProgressState,
    monthlyActivity: `玩耍进度 +${totalGains.play}，学习进度 +${totalGains.study}${advances > 1 ? `（推进${advances}次）` : ""}` } };
  const rewardDetails = nextState.eventHistory.slice(state.eventHistory.length)
    .flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger?.name === "恋人"
      ? stage.talentTrigger.effects : []));
  if (rewardDetails.length > 0) {
    nextState = { ...nextState, loverProgressState: { ...nextState.loverProgressState,
      monthlyActivity: `${nextState.loverProgressState.monthlyActivity}；${rewardDetails.join("；")}` } };
  }
  return settlePendingLoverHelp(nextState);
}
