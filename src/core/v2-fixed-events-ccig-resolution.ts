import { type FixedResolutionResult, type RandomRollProvider } from "./v2-fixed-events-shared";
import {
  createCcigAttendResultEvent,
  createCcigDecisionEvent,
  createCcigSkipResultEvent,
} from "./v2-fixed-events-ccig-decision-events";
import { createCcigActivityResultEvent } from "./v2-fixed-events-ccig-activity-events";
import { getCcigLocation, getCcigSelfPayCost } from "./v2-fixed-events-ccig-shared";
import { combineEffectMultipliers } from "./v2-numeric-modifiers";
import { applyTierResist, formatTierResistedOutcome, formatActualSanChange, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import type { FixedEventResolution, GameState } from "./v2-types";

export function resolveCcigFixedEvent(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider,
): FixedResolutionResult {
  const eventState = resolution.ccigCalendar ? { ...state, ...resolution.ccigCalendar } : state;
  switch (resolution.kind) {
    case "ccig-open":
      return {
        nextState: state,
        outcome: "选择是否参会。",
        enqueueEvents: [createCcigDecisionEvent(eventState)],
      };
    case "ccig-skip":
      return {
        nextState: state,
        outcome: "本次不参会。",
        enqueueEvents: [createCcigSkipResultEvent(eventState)],
      };
    case "ccig-advisor": {
      const { actualCost } = getCcigSelfPayCost(state);
      const favorResult = applyTierResist(-1, state.player.favor, getRoll);
      const favorChange = favorResult.effectiveChange;
      const favorNarrative = getTierResistedNarrative("导师好感", -1, favorResult);
      const nextState = state;
      const settlement = formatTierResistedOutcome("导师好感", -1, favorResult);
      const fundingSettlement = `科研经费 -${actualCost}`;
      return {
        nextState,
        outcome: `${settlement}，${fundingSettlement}，报销通过。`,
        enqueueEvents: [createCcigAttendResultEvent(eventState, "advisor", ["导师报销", settlement, fundingSettlement], favorNarrative, {
          ...(favorChange < 0 ? { favor: favorChange } : {}),
          advisorProgressStateDeltas: { funding: -actualCost },
          labFinanceCategory: "conference-travel",
        })],
      };
    }
    case "ccig-self": {
      const { actualCost } = getCcigSelfPayCost(state);
      const nextState = state;
      const costText = actualCost === 0 ? "参会费用 0" : `金币 -${actualCost}`;
      return {
        nextState,
        outcome: `${costText}。`,
        enqueueEvents: [createCcigAttendResultEvent(eventState, "self", ["自费参会", costText], "", actualCost > 0 ? { money: -actualCost } : {})],
      };
    }
    case "ccig-activity-listen": {
      const tempBonus = 5;
      const activityOutcome = `下次想 idea +${tempBonus}，永久 idea +1`;
      const completionLog = [resolution.ccigAttendanceSummary, activityOutcome].filter(Boolean).join("；");
      return {
        nextState: state,
        outcome: `下次想 idea +${tempBonus}，永久 idea +1。`,
        enqueueEvents: [createCcigActivityResultEvent({
          state: eventState,
          mode: "listen",
          title: "VALSE活动 ➜ 选择安排 ➜ 活动结果",
          description: [
            "你先听 Tutorial 梳理多模态模型的方法，再去 Workshop 听视频生成和三维空间理解的讨论。讲者放出的演示很漂亮，台下却接连追问训练数据、失败案例和评测是否公平。你原本只顾着记新方法，听着听着，也在笔记里补上了这些问题。",
            "茶歇时，你拿自己的实验困惑请教讲者，对方换个角度解释，你才发现把问题想窄了。回去能试的新思路有了，判断问题的方法也学到一点；最大的问号旁总算补上了几行字。",
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
        1.25,
      ]);
      const sanChange = getActualSanChange(-2, state.month, state.eventSupport, state.buffs);
      const activityOutcome = `${formatActualSanChange(-2, state.month, state.eventSupport, state.buffs)}；论文宣传倍率 +25%`;
      const completionLog = [resolution.ccigAttendanceSummary, `海报展示《${paper.title}》`, activityOutcome].filter(Boolean).join("；");
      return {
        nextState: state,
        outcome: `展示《${paper.title}》。`,
        enqueueEvents: [createCcigActivityResultEvent({
          state: eventState,
          mode: "poster",
          title: "VALSE活动 ➜ 选择安排 ➜ 活动结果",
          description: [
            "你贴好海报，向同行介绍工作。有人追问基线和实验设置，你指着图解释，把疑问记在空白处。",
            "收海报时，开场白已说得不用过脑子，嗓子也哑了。有同行拍照说回去细看，你赶紧指了指角落的论文链接。",
            `涉及论文：**《${paper.title}》**`,
          ].join("\n\n"),
          outcome: `${activityOutcome}。`,
          completionLog,
          effects: {
            san: sanChange,
            paperUpdates: [{
              id: paper.id,
              publication: {
                ...paper.publication,
                promotionMultiplier,
                posterExposed: true,
              },
            }],
          },
        })],
      };
    }
    case "ccig-activity-travel": {
      const location = getCcigLocation(eventState.year);
      const attraction = ({
        珠海: "沿着情侣路慢慢走，在海边吹了会儿风",
        武汉: "沿着江滩散步，看轮渡慢慢驶过江面",
        重庆: "坐轻轨穿过山城，又在洪崖洞看了夜景",
      } as Record<string, string>)[location] ?? "在附近的街巷随意走走";
      const activityOutcome = "SAN +4";
      const completionLog = [resolution.ccigAttendanceSummary, activityOutcome].filter(Boolean).join("；");
      return {
        nextState: state,
        outcome: "SAN +4。",
        enqueueEvents: [createCcigActivityResultEvent({
          state: eventState,
          mode: "travel",
          title: "VALSE活动 ➜ 选择安排 ➜ 活动结果",
          description: [
            "你把会务袋放回酒店，留了些空当出门走走。今天不用给每段时间都排上正事。",
            `你${attraction}，路上没再反复琢磨那几个实验。回酒店时腿有点酸，脑子倒是松快了不少。`,
          ].join("\n\n"),
          outcome: `${activityOutcome}。`,
          completionLog,
          effects: { san: 4 },
        })],
      };
    }
    case "ccig-activity-food": {
      const location = getCcigLocation(eventState.year);
      const food = ({
        珠海: "白灼虾、清蒸鱼、蚝仔煎蛋",
        武汉: "排骨藕汤、武昌鱼、豆皮",
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
          state: eventState,
          mode: "food",
          title: "VALSE活动 ➜ 选择安排 ➜ 活动结果",
          description: [
            `你和几位同学约好 AA 聚餐，一起品尝${location}当地菜：${food}。`,
            `大家从报告聊到没跑通的实验，越聊越熟悉。结账时各付各的，你付了自己那份 2 金币，约好回去继续交流；几个只认得胸牌的名字总算对上了人。${socialNarrative}`,
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
        outcome: "领域年会结算完成。",
      };
  }
}
