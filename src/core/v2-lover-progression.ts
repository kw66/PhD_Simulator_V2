import { getActiveOperationSanDelta, addOrReplaceBuffs } from "./v2-buffs";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { addPaperCollaboration } from "./v2-paper-collaboration";
import { getLoverName } from "./v2-lover-system";
import { getResearchCap } from "./v2-research-cap-system";
import { recordTalentTrigger } from "./v2-talent-history";
import type { GameState, LoverProgressState, LoverTypeId, PaperActionType } from "./v2-types";

const LOVER_RELATION_MAX = 40;
export const LOVER_TASK_MAX = 100;
export const LOVER_DATE_MONEY_COST = 2;
export const LOVER_ROUTES = ["play", "study", "shopping"] as const;
export type LoverRoute = typeof LOVER_ROUTES[number];
const ROUTE_LABELS = { play: "玩耍", study: "学习", shopping: "购物" };

export function createLoverProgressState(type?: LoverTypeId, random: () => number = Math.random): LoverProgressState {
  return {
    active: Boolean(type),
    research: type ? (type === "smart" ? 9 : 3) + Math.floor(random() * 4) : 0,
    intimacy: type ? (type === "beautiful" ? 9 : 3) + Math.floor(random() * 4) : 0,
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
  if (route === "play") return Math.floor((lover.intimacy + state.player.social) / 2);
  if (route === "study") return Math.floor((lover.research + state.player.research) / 2);
  return Math.floor(lover.intimacy / 2) + 10;
}

export function getLoverRouteCost(state: GameState, route: LoverRoute): { money: number; san: number } {
  return { money: route === "play" ? 2 : route === "shopping" ? 3 : 0,
    san: route === "study" ? Math.max(0, 4 + getActiveOperationSanDelta(state.buffs)) : 0 };
}

export function getLoverDateFailure(state: GameState, route: LoverRoute): string | null {
  if (state.phase !== "playing" || !state.loverState.active || !state.loverProgressState.active) return "恋爱后解锁";
  if (state.loverProgressState.taskUsedThisMonth || state.loverProgressState.lastDateTotalMonths === state.totalMonths) return "本月已约会，下月恢复";
  const cost = getLoverRouteCost(state, route);
  if (state.player.money < cost.money) return `金币不足，需要${cost.money}`;
  if (state.player.san < cost.san) return `SAN不足，需要${cost.san}`;
  return null;
}

export function getLoverPassiveGains(state: GameState): { play: number; study: number } {
  const intimacy = state.loverProgressState.intimacy;
  return state.loverState.type === "beautiful"
    ? { play: intimacy, study: Math.floor(intimacy / 2) }
    : { play: Math.floor(intimacy / 2), study: intimacy };
}

export function getLoverNextReward(state: GameState, route: LoverRoute): string {
  if (route === "shopping") return "下次购物免单、亲密+2";
  const cycle = getRoute(state, route).completed % 3;
  return (route === "play"
    ? ["SAN+6", "SAN上限+1", "下月SAN消耗-1"]
    : [`论文随机一项+${state.loverProgressState.research}分`, "永久idea、实验、写作各+1分", "双方科研较低者+1，相同不提升"])[cycle]! + "、亲密+1";
}

export function settlePendingLoverHelp(state: GameState, random: () => number = Math.random): GameState {
  const help = state.loverProgressState.pendingPaperHelp;
  if (state.phase !== "playing" || !help || !state.loverState.active) return state;
  const fields: PaperActionType[] = ["idea", "experiment", "writing"];
  const targets = state.papers.flatMap((paper) => !paper.nonFirstAuthor && (paper.status === "draft" || paper.status === "journal-reviewing")
    ? fields.filter((field) => field === "idea" || (field === "experiment" ? paper.idea > 0 : paper.experiment > 0)).map((field) => ({ paper, field })) : []);
  if (targets.length === 0) return state;
  const target = targets[Math.floor(random() * targets.length)]!;
  const paper = addPaperCollaboration(target.paper, { paperId: target.paper.id,
    collaborator: { id: help.collaboratorId, name: help.name }, scores: { [target.field]: help.amount } });
  return pushLog({ ...state,
    papers: state.papers.map((entry) => entry.id === paper.id ? paper : entry),
    loverProgressState: { ...state.loverProgressState, pendingPaperHelp: null },
  }, `恋人帮助：${help.name}帮你完善《${paper.title}》，${{ idea: "idea", experiment: "实验", writing: "写作" }[target.field]}+${help.amount}`);
}

function advanceRoute(state: GameState, route: LoverRoute, gain: number): GameState {
  const original = getRoute(state, route);
  const total = original.progress + gain;
  const completions = Math.floor(total / LOVER_TASK_MAX);
  let nextState: GameState = { ...state, loverProgressState: { ...state.loverProgressState,
    routes: { play: getRoute(state, "play"), study: getRoute(state, "study"), shopping: getRoute(state, "shopping"),
      [route]: { progress: total % LOVER_TASK_MAX, completed: original.completed + completions } },
  } };
  for (let completion = 0; completion < completions; completion += 1) {
    const count = original.completed + completion + 1;
    const cycle = (count - 1) % 3;
    const lover = nextState.loverProgressState;
    const intimacy = Math.min(20, lover.intimacy + (route === "shopping" ? 2 : 1));
    const effects = [`亲密+${intimacy - lover.intimacy}（${lover.intimacy}→${intimacy}）`];
    nextState = { ...nextState, loverProgressState: { ...lover, intimacy } };
    if (route === "play") {
      if (cycle === 0) {
        const san = Math.min(nextState.sanCap, nextState.player.san + 6);
        effects.push(`SAN+${san - nextState.player.san}`);
        nextState = { ...nextState, player: { ...nextState.player, san } };
      } else if (cycle === 1) {
        nextState = { ...nextState, sanCap: nextState.sanCap + 1 };
        effects.push("SAN上限+1");
      } else {
        const month = state.totalMonths + 1;
        nextState.loverProgressState.sanDiscountMonths = [...new Set([...(lover.sanDiscountMonths ?? []), month])];
        effects.push("下月主动操作SAN消耗-1，最低为0");
      }
    } else if (route === "shopping") {
      nextState.loverProgressState.giftCoupons = (lover.giftCoupons ?? 0) + 1;
      effects.push("购物免单+1");
    } else if (cycle === 0) {
      const stored = lover.pendingPaperHelp;
      nextState.loverProgressState.pendingPaperHelp = stored ?? { amount: lover.research,
        collaboratorId: `lover:${state.loverState.startTotalMonths}:${getLoverName(state.loverState)}`, name: getLoverName(state.loverState) };
      effects.push(stored ? "已有一次论文帮助待使用" : `论文随机一项+${lover.research}分，无可操作论文时保留一次`);
    } else if (cycle === 1) {
      const previous = nextState.buffs.find((buff) => buff.id === "lover-study-score");
      const bonus = (previous?.actionEffects?.idea?.bonus ?? 0) + 1;
      nextState = { ...nextState, buffs: addOrReplaceBuffs(nextState.buffs, [{
        id: "lover-study-score", name: "共同学习", source: "恋人约会", timing: "permanent", remainingMonths: null,
        actionEffects: { idea: { bonus }, experiment: { bonus }, writing: { bonus } },
      }]) };
      effects.push(`永久idea、实验、写作各+1分（累计+${bonus}）`);
    } else if (lover.research < nextState.player.research) {
      const research = Math.min(20, lover.research + 1);
      nextState.loverProgressState.research = research;
      effects.push(`恋人科研+${research - lover.research}`);
    } else if (nextState.player.research < lover.research) {
      const research = Math.min(20, getResearchCap(nextState.researchCapacityState), nextState.player.research + 1);
      const gain = Math.max(0, research - nextState.player.research);
      nextState = { ...nextState, player: { ...nextState.player, research: nextState.player.research + gain } };
      effects.push(`你的科研+${gain}`);
    } else effects.push("双方科研相同，本次不提升科研");
    nextState = recordTalentTrigger(nextState, `lover:${state.loverState.startTotalMonths}:${getLoverName(state.loverState)}:${route}:${count}`, {
      name: "恋人", recipient: `你与${getLoverName(state.loverState)}`, reason: `约会·${ROUTE_LABELS[route]}进度满100，第${count}次`, effects,
    });
  }
  return nextState;
}

export function advanceLoverDate(state: GameState, route: LoverRoute): GameState {
  const failure = getLoverDateFailure(state, route);
  if (failure) return pushNoOpLog(state, `约会：${failure}`);
  const cost = getLoverRouteCost(state, route);
  const gain = getLoverRouteGain(state, route);
  const paid = { ...state, player: { ...state.player, san: state.player.san - cost.san, money: state.player.money - cost.money },
    loverProgressState: { ...state.loverProgressState, lastDateTotalMonths: state.totalMonths, taskUsedThisMonth: true } };
  return settlePendingLoverHelp(advanceRoute(pushLog(paid,
    `约会·${ROUTE_LABELS[route]}：进度+${gain}${cost.money ? `，金币-${cost.money}` : ""}${cost.san ? `，SAN-${cost.san}` : ""}`), route, gain));
}

export function activateLoverMonthlyDiscount(state: GameState): GameState {
  if (!state.loverProgressState.sanDiscountMonths?.includes(state.totalMonths)) return state;
  return { ...state, buffs: addOrReplaceBuffs(state.buffs, [{
    id: "lover-play-discount", name: "约会余韵", source: "恋人玩耍", timing: "monthly", remainingMonths: 1, activeOperationSanDelta: -1,
  }]) };
}

export function advanceLoverMonth(state: GameState): GameState {
  const lover = state.loverProgressState;
  if (state.phase !== "playing" || !state.loverState.active || !lover.active
    || state.totalMonths <= (state.loverState.startTotalMonths ?? state.totalMonths)
    || state.totalMonths <= (lover.lastAdvancedTotalMonths ?? -1)) return state;
  const gains = getLoverPassiveGains(state);
  let nextState: GameState = { ...activateLoverMonthlyDiscount(state), loverProgressState: { ...lover, taskUsedThisMonth: false, lastAdvancedTotalMonths: state.totalMonths,
    sanDiscountMonths: (lover.sanDiscountMonths ?? []).filter((month) => month > state.totalMonths) } };
  nextState = advanceRoute(nextState, "play", gains.play);
  nextState = advanceRoute(nextState, "study", gains.study);
  return settlePendingLoverHelp(nextState);
}
