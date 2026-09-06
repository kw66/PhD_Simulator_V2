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
            "你挑了几场贴近课题的报告，边听边记。遇到没跟上的地方，先把图和关键词抄下来，留着回去查。",
            "茶歇时，你拿着笔记请教了一处实验设计，才发现自己一直把问题想窄了。回程再翻笔记，几处想法渐渐接上了，连以后该怎么提问也有了点头绪。",
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
            "有人追问基线和实验设置，你指着图解释了几轮，也把对方的疑问记在空白处。",
            "收海报时嗓子已经有些哑了，好在路过的同行不只是看了个标题，多少记住了你在做什么。",
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
        合肥: "沿着包河慢慢散步，在树荫下坐了一会儿",
        成都: "在宽窄巷子走走停停，找了家茶馆歇脚",
        苏州: "逛了平江路，在河边慢慢走了一下午",
        西安: "在大雁塔附近闲逛，坐在广场边歇了会儿",
        重庆: "坐轻轨穿过山城，又在洪崖洞看了夜景",
      } as Record<string, string>)[location] ?? "在附近的街巷随意走走";
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
            "你把会务袋放回酒店，留了些空当出门走走。今天不用给每段时间都排上正事。",
            `你${attraction}，路上没再反复琢磨那几个实验。`,
            "回酒店时腿有点酸，脑子倒是松快了不少。",
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
            "饭桌上聊起刚听的报告，也吐槽各自没跑通的实验，话题比会场里随意得多。结账时你主动买了单，这顿饭花了钱，好歹也吃得舒坦。",
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
