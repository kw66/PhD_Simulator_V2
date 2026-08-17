import { applyStateMutation, drawWeightedTriplet, type FixedResolutionResult, type RandomRollProvider } from "./v2-fixed-events-shared";
import {
  createCcigActivityResultEvent,
  createCcigAttendResultEvent,
  createCcigDecisionEvent,
  createCcigEvent,
  createCcigSkipResultEvent,
} from "./v2-fixed-events-ccig-events";
import { getCcigLocation, getCcigSelfPayCost } from "./v2-fixed-events-ccig-shared";
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
          title: "领域年会会场活动 ➜ 参会选择 ➜ 满载而归",
          description: [
            "你把一天几乎都放在报告厅，从 keynote 听到分论坛，笔记写了好几页。",
            "茶歇时你主动和几位学者交流，把自己课题里的瓶颈直接拿出来请教。",
            "回程路上，你已经列好下一轮要验证的三个想法，脑子里久违地很清晰。",
          ].join("\n\n"),
          preview: "会场交流沉淀成了明确的课题收益",
          outcome: `下次想 idea +${tempBonus}，以后每次想 idea +1。`,
          effects: {
            temporaryActionEffectUpdates: { idea: { bonus: tempBonus } },
            ideaBonus: 1,
          },
        })],
      };
    }
    case "ccig-activity-travel": {
      const location = getCcigLocation(state.year);
      const attraction = ({
        合肥: "沿着包河散步，又去看了三河古镇",
        成都: "去了宽窄巷子和锦里，还看了大熊猫",
        苏州: "逛了平江路和园林，在河边慢慢走了一下午",
        西安: "参观了兵马俑和大雁塔，感受千年古都的魅力",
        重庆: "坐轻轨穿过山城，又在洪崖洞看了夜景",
      } as Record<string, string>)[location] ?? "在当地的著名景点游玩";
      return {
        nextState: state,
        outcome: "SAN +5。",
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "travel",
          title: "领域年会会场活动 ➜ 参会选择 ➜ 旅途愉快",
          description: [
            "你只听了核心场次，其余时间留给了城市本身。",
            `你${attraction}，让大脑从连续几个月的高压节奏里短暂抽离。`,
            "这天没有带来明显学术进展，但你明显感觉焦虑阈值被拉低了。",
          ].join("\n\n"),
          preview: "把一部分参会时间换成状态修复",
          outcome: "SAN +5。",
          effects: { san: 5 },
        })],
      };
    }
    case "ccig-activity-food": {
      const location = getCcigLocation(state.year);
      const food = ({
        合肥: "庐州烤鸭、臭鳜鱼、三河米饺",
        成都: "火锅、串串、担担面",
        苏州: "松鼠鳜鱼、苏式汤面、桂花糖藕",
        西安: "肉夹馍、羊肉泡馍、凉皮",
        重庆: "重庆火锅、小面、酸辣粉",
      } as Record<string, string>)[location] ?? "当地特色美食";
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
          title: "领域年会会场活动 ➜ 参会选择 ➜ 大快朵颐",
          description: [
            `你约了几位同学去吃${location}当地菜：${food}。`,
            "饭桌上从“最近在做什么”聊到“你这个方向怎么落地”，气氛比会场里松很多。",
            "这顿饭花了钱，但你换回了更顺的合作关系和更轻的心理负担。",
          ].join("\n\n"),
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
