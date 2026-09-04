import { drawInclusiveInt, type FixedResolutionResult, type RandomRollProvider } from "./v2-fixed-events-shared";
import {
  createCcigActivityResultEvent,
  createCcigAttendResultEvent,
  createCcigDecisionEvent,
  createCcigSkipResultEvent,
} from "./v2-fixed-events-ccig-events";
import { getCcigLocation, getCcigSelfPayCost } from "./v2-fixed-events-ccig-shared";
import { combineEffectMultipliers } from "./v2-numeric-modifiers";
import { applyTierResist, formatTierResistedOutcome, getTierResistedNarrative } from "./v2-sanity-rules";
import type { FixedEventResolution, GameState } from "./v2-types";

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
      const favorResult = applyTierResist(-1, state.player.favor, getRoll);
      const favorChange = favorResult.effectiveChange;
      const favorNarrative = getTierResistedNarrative("导师好感", -1, favorResult);
      const nextState = state;
      const settlement = formatTierResistedOutcome("导师好感", -1, favorResult);
      return {
        nextState,
        outcome: `${settlement}，报销通过。`,
        enqueueEvents: [createCcigAttendResultEvent(state, "advisor", ["导师报销", settlement], favorNarrative, favorChange < 0 ? { favor: favorChange } : {})],
      };
    }
    case "ccig-self": {
      const { actualCost } = getCcigSelfPayCost(state);
      const nextState = state;
      const costText = actualCost === 0 ? "参会费用 0" : `金币 -${actualCost}`;
      return {
        nextState,
        outcome: `${costText}。`,
        enqueueEvents: [createCcigAttendResultEvent(state, "self", ["自费参会", costText], "", actualCost > 0 ? { money: -actualCost } : {})],
      };
    }
    case "ccig-activity-listen": {
      const tempBonus = drawInclusiveInt(4, 6, getRoll);
      const activityOutcome = `下次想 idea +${tempBonus}，永久 idea +1`;
      const completionLog = [resolution.ccigAttendanceSummary, activityOutcome].filter(Boolean).join("；");
      return {
        nextState: state,
        outcome: `下次想 idea +${tempBonus}，永久 idea +1。`,
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "listen",
          title: "年会活动 ➜ 选择安排 ➜ 活动结果",
          description: [
            "你把一天几乎都放在报告厅，从院士的主旨报告听到分论坛，笔记写了好几页。",
            "茶歇时你主动和几位学者交流，把自己课题里的瓶颈直接拿出来请教。",
            "回程路上，你已经列好下一轮要验证的三个想法，脑子里久违地很清晰。",
          ].join("\n\n"),
          outcome: `${activityOutcome}。`,
          completionLog,
          effects: {
            temporaryActionEffectUpdates: { idea: { bonus: tempBonus } },
            ideaBonus: 1,
          },
        })],
      };
    }
    case "ccig-activity-poster": {
      const paper = [...state.papers, ...state.externalPublications].find((entry) => (
        entry.id === resolution.ccigPaperId
        && entry.status === "published"
        && entry.target === "A"
        && entry.nonFirstAuthor !== true
        && entry.publication
      ));
      if (!paper?.publication) {
        return {
          nextState: state,
          outcome: "没有找到可展示的 A 类论文。",
        };
      }
      const promotionMultiplier = combineEffectMultipliers([
        paper.publication.promotionMultiplier ?? 1,
        1.5,
      ]);
      const activityOutcome = `SAN -2；《${paper.title}》宣传倍率 +50%`;
      const completionLog = [resolution.ccigAttendanceSummary, "海报展示", activityOutcome].filter(Boolean).join("；");
      return {
        nextState: state,
        outcome: `展示《${paper.title}》。`,
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "poster",
          title: "年会活动 ➜ 选择安排 ➜ 活动结果",
          description: [
            `你把《${paper.title}》的海报贴上展板，留在旁边向过来的同行介绍工作。`,
            "有人追问实验细节，也有人拍下海报，约你会后继续交流。",
            "一天下来讲得口干舌燥，这篇论文倒是让更多人记住了。",
          ].join("\n\n"),
          outcome: `${activityOutcome}。`,
          completionLog,
          effects: {
            san: -2,
            paperUpdates: [{
              id: paper.id,
              publication: {
                ...paper.publication,
                promotionMultiplier,
              },
            }],
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
      const activityOutcome = "SAN +5";
      const completionLog = [resolution.ccigAttendanceSummary, activityOutcome].filter(Boolean).join("；");
      return {
        nextState: state,
        outcome: "SAN +5。",
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "travel",
          title: "年会活动 ➜ 选择安排 ➜ 活动结果",
          description: [
            "你只听了核心场次，其余时间留给了城市本身。",
            `你${attraction}，一整天都没再想实验和论文。`,
            "晚上回到酒店时，你已经轻松了不少。",
          ].join("\n\n"),
          outcome: `${activityOutcome}。`,
          completionLog,
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
      // The activity result is its own confirmation stage; defer the meal cost
      // until that final click just like the other activity effects.
      const nextState = state;
      const socialResult = applyTierResist(1, state.player.social, getRoll);
      const socialGain = socialResult.effectiveChange;
      const socialNarrative = getTierResistedNarrative("社交", 1, socialResult);
      const activityOutcome = `金币 -2，SAN +2，${formatTierResistedOutcome("社交", 1, socialResult)}`;
      const completionLog = [resolution.ccigAttendanceSummary, activityOutcome].filter(Boolean).join("；");
      return {
        nextState,
        outcome: "金币 -2。",
        enqueueEvents: [createCcigActivityResultEvent({
          state,
          mode: "food",
          title: "年会活动 ➜ 选择安排 ➜ 活动结果",
          description: [
            `你约了几位同学去吃${location}当地菜：${food}。`,
            "饭桌上从“最近在做什么”聊到“你这个方向怎么落地”，气氛比会场里松很多。",
            "一顿饭下来，大家熟了不少，还约好以后互相交流代码和数据。",
            ...(socialNarrative ? [socialNarrative] : []),
          ].join("\n\n"),
          outcome: `${activityOutcome}。`,
          completionLog,
          effects: socialGain > 0 ? { money: -2, san: 2, social: socialGain } : { money: -2, san: 2 },
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
