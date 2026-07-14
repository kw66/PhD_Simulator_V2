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
        outcome: "你开始认真权衡这次年会到底值不值得去。",
        enqueueEvents: [createCcigDecisionEvent(state)],
      };
    case "ccig-skip":
      return {
        nextState: state,
        outcome: "你决定先把资源留在手里，接受这次机会成本。",
        enqueueEvents: [createCcigSkipResultEvent(state)],
      };
    case "ccig-advisor": {
      const nextState = applyStateMutation(state, { favor: -1 });
      if (nextState.player.favor < 0) {
        return {
          nextState,
          outcome: "你试图让导师报销，但这次关系成本已经把你压到了底线之外。",
        };
      }
      return {
        nextState,
        outcome: "导师同意了报销，你把这次线下窗口争取了下来。",
        enqueueEvents: [createCcigAttendResultEvent(state, "advisor", 0)],
      };
    }
    case "ccig-self": {
      const { actualCost } = getCcigSelfPayCost(state);
      const nextState = actualCost === 0 ? state : applyStateMutation(state, { money: -actualCost });
      if (nextState.player.money < 0) {
        return {
          nextState,
          outcome: `你硬着头皮自费参会，但实际支出 ${actualCost} 金钱已经超过了你当前现金承受范围。`,
        };
      }
      return {
        nextState,
        outcome: actualCost === 0
          ? "整装待发替你吃掉了这次出行成本，你几乎零成本拿到了参会资格。"
          : `你决定自己承担 ${actualCost} 金钱的参会成本。`,
        enqueueEvents: [createCcigAttendResultEvent(state, "self", actualCost)],
      };
    }
    case "ccig-activity-listen": {
      const tempBonus = drawWeightedTriplet(4, 6, getRoll);
      return {
        nextState: state,
        outcome: `你把今天主要押在报告与交流上；下次想 idea +${tempBonus}，以后每次想 idea +1。`,
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "listen",
          title: "领域年会 ➜ 会场入场 ➜ 满载而归",
          description: "你把一天几乎都放在报告厅，从 keynote 听到分论坛，笔记写了好几页。茶歇时你主动和几位学者交流，把自己课题里的瓶颈直接拿出来请教。回程路上，你已经列好下一轮要验证的几个想法，脑子里久违地很清晰。",
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
        outcome: "你给自己留出了一段从学术高压里抽离的时间；SAN +5。",
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "travel",
          title: "领域年会 ➜ 会场入场 ➜ 旅途愉快",
          description: "你只听了核心场次，其余时间留给了城市本身。沿着街道慢慢走、看风景、找馆子，让大脑从连续几个月的高压节奏里短暂抽离。这天没有带来明显学术进展，但你明显感觉焦虑阈值被拉低了。",
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
          outcome: "你想请同学吃饭，但这 2 金钱的预算已经把现金线彻底压穿了。",
        };
      }
      return {
        nextState,
        outcome: "你把会场里更松弛的一圈关系攒到了一张饭桌上。",
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "food",
          title: "领域年会 ➜ 会场入场 ➜ 大快朵颐",
          description: "你约了几位同学去吃当地菜。饭桌上从“最近在做什么”聊到“你这个方向怎么落地”，气氛比会场里松很多。这顿饭花了钱，但你换回了更顺的合作关系和更轻的心理负担。",
          preview: "用一顿饭换回更顺的合作氛围",
          outcome: "金钱已在上一幕结算；本次再获得 SAN +2、社交 +1。",
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
