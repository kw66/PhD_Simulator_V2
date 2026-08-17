import { applyStateMutation, drawWeightedTriplet, type FixedResolutionResult, type RandomRollProvider } from "./v2-fixed-events-shared";
import {
  createCcigActivityResultEvent,
  createCcigAttendResultEvent,
  createCcigDecisionEvent,
  createCcigEvent,
  createCcigSkipResultEvent,
} from "./v2-fixed-events-ccig-events";
import { getCcigSelfPayCost } from "./v2-fixed-events-ccig-shared";
import type { FixedEventResolution, GameState } from "./v2-types";

export { createCcigEvent };

export function resolveCcigFixedEvent(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider,
): FixedResolutionResult {
  switch (resolution.kind) {
    case "ccig-open":
      return {
        nextState: state,
        outcome: "选择是否参会。",
        enqueueEvents: [createCcigDecisionEvent(state)],
      };
    case "ccig-skip":
      return {
        nextState: state,
        outcome: "本次不参会。",
        enqueueEvents: [createCcigSkipResultEvent(state)],
      };
    case "ccig-advisor": {
      const nextState = applyStateMutation(state, { favor: -1 });
      if (nextState.player.favor < 0) {
        return {
          nextState,
          outcome: "导师好感 -1，关系跌破下限。",
        };
      }
      return {
        nextState,
        outcome: "导师好感 -1，报销通过。",
        enqueueEvents: [createCcigAttendResultEvent(state, "advisor", 0)],
      };
    }
    case "ccig-self": {
      const { actualCost } = getCcigSelfPayCost(state);
      const nextState = actualCost === 0 ? state : applyStateMutation(state, { money: -actualCost });
      if (nextState.player.money < 0) {
        return {
          nextState,
          outcome: `金钱 -${actualCost}，余额跌破下限。`,
        };
      }
      return {
        nextState,
        outcome: actualCost === 0
          ? "装备减免生效，参会免费。"
          : `金钱 -${actualCost}。`,
        enqueueEvents: [createCcigAttendResultEvent(state, "self", actualCost)],
      };
    }
    case "ccig-activity-listen": {
      const tempBonus = drawWeightedTriplet(4, 6, getRoll);
      return {
        nextState: state,
        outcome: `下次想 idea +${tempBonus}，永久 idea +1。`,
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "listen",
          title: "领域年会 ➜ 会场入场 ➜ 满载而归",
          description: "听完报告，又请教了几位同行。下一轮实验有了思路。",
          preview: "会场交流沉淀成了明确的课题收益",
          outcome: `下次想 idea +${tempBonus}，以后每次想 idea +1。`,
          effects: {
            temporaryActionEffectUpdates: { idea: { bonus: tempBonus } },
            ideaBonus: 1,
          },
        })],
      };
    }
    case "ccig-activity-travel":
      return {
        nextState: state,
        outcome: "SAN +5。",
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "travel",
          title: "领域年会 ➜ 会场入场 ➜ 旅途愉快",
          description: "只听核心场次，其余时间逛了城市。心情轻松不少。",
          preview: "把一部分参会时间换成状态修复",
          outcome: "SAN +5。",
          effects: { san: 5 },
        })],
      };
    case "ccig-activity-food": {
      const nextState = applyStateMutation(state, { money: -2 });
      if (nextState.player.money < 0) {
        return {
          nextState,
          outcome: "金钱 -2，余额跌破下限。",
        };
      }
      return {
        nextState,
        outcome: "金钱 -2。",
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "food",
          title: "领域年会 ➜ 会场入场 ➜ 大快朵颐",
          description: "请几位同学吃了当地菜。关系近了一些。",
          preview: "用一顿饭换回更顺的合作氛围",
          outcome: "SAN +2，社交 +1。",
          effects: { san: 2, social: 1 },
        })],
      };
    }
    default:
      return {
        nextState: state,
        outcome: "CCIG 固定事件结算完成。",
      };
  }
}
