import { applyTierResist, formatTierResistedOutcome, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import {
  applyStateMutation,
  createFixedEvent,
  drawInclusiveInt,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import type {
  FixedEventResolution,
  GameState,
  PendingEvent,
  TeachersDayGiftId,
} from "./v2-types";

interface TeachersDayGiftDefinition {
  id: TeachersDayGiftId;
  name: string;
  choiceLabel: string;
  amountText: string;
  highFavorHint: string;
  lowFavorHint: string;
  resultDescription: string[];
}

const TEACHERS_DAY_GIFTS: readonly TeachersDayGiftDefinition[] = [
  {
    id: "tea",
    name: "茶叶",
    choiceLabel: "送茶叶",
    amountText: "一盒茶叶",
    highFavorHint: "花 1 金币送盒茶叶，去办公室当面道声祝福，也挺自然。",
    lowFavorHint: "茶叶要花 1 金币，可你没留意过老师爱喝什么，选起来拿不准。",
    resultDescription: [
      "你买好一盒茶叶，下午敲开办公室的门。导师正对着电脑看论文，你等对方抬起头，才把盒子递过去：“老师，教师节快乐！给您带了盒茶叶。”",
      "导师接过盒子：“谢谢你的心意。”你道了声“不打扰您了”，轻轻带上门。回工位时才发现，刚才一直把空袋子攥在手里。",
    ],
  },
  {
    id: "mooncake",
    name: "月饼",
    choiceLabel: "送月饼",
    amountText: "一盒月饼",
    highFavorHint: "店里已经摆出月饼，花 1 金币带一盒过去，正好聊两句。",
    lowFavorHint: "月饼要花 1 金币。见面请老师尝尝，总比站在门口找话说容易。",
    resultDescription: [
      "你拎着一盒月饼来到办公室，等导师回完邮件，再递上盒子：“老师，教师节快乐！给您带了盒月饼，尝尝看。”",
      "导师接过盒子，向你道谢。你回了句“不客气”，又寒暄几句便告辞，没有把节日问候聊成一场临时汇报。",
    ],
  },
  {
    id: "flower",
    name: "鲜花",
    choiceLabel: "送鲜花",
    amountText: "一束鲜花",
    highFavorHint: "鲜花要花 1 金币，摆在老师桌上挺好，那堆资料旁得腾个位置。",
    lowFavorHint: "鲜花要花 1 金币，不必猜口味，只是捧进办公室还有点不好意思。",
    resultDescription: [
      "你捧着一束鲜花来到办公室，正好碰见导师整理课件。你把花递过去：“老师，教师节快乐！给您带了束花。”",
      "导师向你道谢，腾出桌角放好花束。你看着花挨着一摞资料摆好，忽然觉得这间总让人惦记进度的办公室，也有了点过节的样子。",
    ],
  },
] as const;

function getTeachersDayGift(giftId: TeachersDayGiftId | undefined): TeachersDayGiftDefinition | null {
  return TEACHERS_DAY_GIFTS.find((gift) => gift.id === giftId) ?? null;
}

function drawTeachersDayGift(getRoll: RandomRollProvider): TeachersDayGiftDefinition {
  return TEACHERS_DAY_GIFTS[drawInclusiveInt(0, TEACHERS_DAY_GIFTS.length - 1, getRoll)]
    ?? TEACHERS_DAY_GIFTS[0];
}

function getFavorLevelName(favor: number): string {
  if (favor >= 18) return "心腹";
  if (favor >= 12) return "信任";
  if (favor >= 6) return "认可";
  return "陌生";
}

function createTeachersDayResultEvent(params: {
  state: GameState;
  resultId: string;
  resultTitle: string;
  description: string;
  buttonLabel: string;
  outcome: string;
}): PendingEvent {
  return createFixedEvent({
    id: `teachers-day-result-${params.resultId}-y${params.state.year}-m${params.state.month}`,
    title: `教师节 ➜ 你的选择 ➜ ${params.resultTitle}`,
    description: params.description,
    chainId: "teachers-day",
    stage: "result",
    completionLog: params.outcome,
    choices: [
      {
        id: `teachers-day-finish-${params.resultId}-y${params.state.year}-m${params.state.month}`,
        label: params.buttonLabel,
        outcome: params.outcome,
        effects: {},
      },
    ],
  });
}

function createTeachersDayChoiceEvent(
  state: GameState,
  gift: TeachersDayGiftDefinition,
): PendingEvent {
  const noGiftHint = state.player.favor >= 6
    ? "平时和老师聊得来，发条祝福也好。你点开聊天框，又有些犹豫。"
    : "聊天框上面几条还都是“收到”。发句祝福，会不会又聊到工作？";
  const giftHint = state.player.favor >= 6 ? gift.highFavorHint : gift.lowFavorHint;
  const stampHint = state.player.favor >= 6
    ? "邮票也能送，只是要花 3 金币。你看了看价格，没急着决定。"
    : "邮票要花 3 金币。你在价格上停了一下，再看看还空着的聊天框。";

  return createFixedEvent({
    id: `teachers-day-choice-y${state.year}-m${state.month}`,
    title: "教师节 ➜ 你的选择",
    description: [
      noGiftHint,
      giftHint,
      stampHint,
    ].join("\n\n"),
    chainId: "teachers-day",
    stage: "act2",
    choices: [
      {
        id: `teachers-day-message-y${state.year}-m${state.month}`,
        label: "发祝福",
        outcome: "你选择先发一条节日祝福。",
        effects: {
          fixedEventResolution: { kind: "teachers-day-message" },
        },
      },
      {
        id: `teachers-day-gift-${gift.id}-y${state.year}-m${state.month}`,
        label: gift.choiceLabel,
        outcome: `你准备送${gift.amountText}表示心意。`,
        effects: {
          fixedEventResolution: {
            kind: "teachers-day-gift",
            teachersDayGift: gift.id,
          },
        },
      },
      {
        id: `teachers-day-stamp-y${state.year}-m${state.month}`,
        label: "送邮票",
        outcome: "你准备送一套邮票表示心意。",
        effects: {
          fixedEventResolution: { kind: "teachers-day-stamp" },
        },
      },
    ],
  });
}

export function createTeachersDayEvent(
  state: GameState,
  getRoll: RandomRollProvider = Math.random,
): PendingEvent {
  const relationText = state.player.favor >= 6 ? "还不错" : "一般";
  const favorLevelName = getFavorLevelName(state.player.favor);
  const gift = drawTeachersDayGift(getRoll);
  return createFixedEvent({
    id: `teachers-day-y${state.year}-m${state.month}`,
    title: "教师节",
    description: [
      "9 月 10 日一早，你打开实验室群，满屏都是“教师节快乐”。还没翻到底，同学又发来消息，问今天去不去办公室，有没有准备小礼物。",
      `导师在群里回了句“谢谢大家”，后面又跟上几条祝福。你和导师关系${relationText}（当前好感等级：${favorLevelName}）。`,
    ].join("\n\n"),
    chainId: "teachers-day",
    choices: [
      {
        id: `teachers-day-continue-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "你开始认真权衡这次教师节该怎么处理。",
        effects: {
          enqueueEvents: [createTeachersDayChoiceEvent(state, gift)],
        },
      },
    ],
  });
}

export function getTeachersDayResultPreviews(state: GameState, resolution: FixedEventResolution): PendingEvent[] {
  if (resolution.kind !== "teachers-day-message" && resolution.kind !== "teachers-day-gift" && resolution.kind !== "teachers-day-stamp") return [];
  return [0, 0.499999, 0.999999].flatMap((roll) => (
    resolveTeachersDayFixedEvent(structuredClone(state), resolution, () => roll).enqueueEvents ?? []
  ));
}

export function resolveTeachersDayFixedEvent(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider,
): FixedResolutionResult {
  switch (resolution.kind) {
    case "teachers-day-message":
      if (state.player.favor >= 6) {
        if (getRoll() < 0.5) {
          const ideaBonus = drawInclusiveInt(3, 5, getRoll);
          return {
            nextState: applyStateMutation(state, {
              temporaryIdeaBonus: ideaBonus,
            }, "教师节"),
            outcome: `你发去节日祝福，导师顺势分享了一个想法，下次想 idea +${ideaBonus}。`,
            enqueueEvents: [createTeachersDayResultEvent({
              state,
              resultId: "message-idea",
              resultTitle: "导师来电",
              description: [
                "你发了条微信：“老师，教师节快乐！祝您身体健康，工作顺利！”没过多久，手机响了，来电正是导师。",
                "“谢谢！正好有个想法跟你聊聊。”你赶紧找纸笔，先在手边的便签上记了几行。挂断后重新誊一遍，才发现几个问题能连起来了，连刚才随手画的箭头都有了用处。",
                `机制结算\n下次想 idea +${ideaBonus}`,
              ].join("\n\n"),
              buttonLabel: "期待明天",
              outcome: `你发了教师节祝福，导师分享了一个想法，下次想 idea +${ideaBonus}。`,
            })],
          };
        }
        return {
          nextState: state,
          outcome: "你发去节日祝福，导师礼貌回复，没有额外数值变化。",
          enqueueEvents: [createTeachersDayResultEvent({
            state,
            resultId: "message-reply",
            resultTitle: "简单祝福",
            description: [
              "你发了条微信：“老师，教师节快乐！祝您身体健康，工作顺利！”导师很快回复：“谢谢！也祝你新学期顺利。”",
              "你回了个笑脸，等了一小会儿，没再收到消息。手机扣回桌上时，你才松了口气：今天这句“谢谢”后面，确实没有跟着一份附件。",
            ].join("\n\n"),
            buttonLabel: "继续",
            outcome: "你发了教师节祝福，导师礼貌回复，无事发生。",
          })],
        };
      }

      if (getRoll() < 0.5) {
        const sanChange = getActualSanChange(-3, state.month, state.eventSupport, state.buffs);
        const favorResult = applyTierResist(1, state.player.favor, getRoll);
        const favorChange = favorResult.effectiveChange;
        const favorNarrative = getTierResistedNarrative("导师好感", 1, favorResult);
        return {
          nextState: applyStateMutation(state, {
            san: sanChange,
            favor: favorChange,
          }),
          outcome: `你发去祝福后，导师顺手把报销跑腿交给了你，SAN ${sanChange}，${formatTierResistedOutcome("导师好感", 1, favorResult)}。`,
          enqueueEvents: [createTeachersDayResultEvent({
            state,
            resultId: "message-errand",
            resultTitle: "导师请求",
            description: [
              "你发了条微信：“老师，教师节快乐！”导师很快回复：“谢谢。正好有份报销材料，下午帮我送到财务处吧。”",
              "你拿齐材料，在财务处排了快一个小时的队，回来再向导师报了受理情况。坐回工位，水杯里的茶已经凉了。你只是发了句祝福，怎么半个下午也跟着送出去了。",
              ...(favorNarrative ? [favorNarrative] : []),
              `机制结算\nSAN ${sanChange}\n${formatTierResistedOutcome("导师好感", 1, favorResult)}`,
            ].join("\n\n"),
            buttonLabel: "认命",
            outcome: `你发了教师节祝福，被叫去财务处跑腿，SAN ${sanChange}，${formatTierResistedOutcome("导师好感", 1, favorResult)}。`,
          })],
        };
      }

      return {
        nextState: state,
        outcome: "你发去节日祝福，导师简短回了一句“新学期加油”，这次无事发生。",
        enqueueEvents: [createTeachersDayResultEvent({
          state,
          resultId: "message-plain",
          resultTitle: "简单祝福",
          description: [
            "你发了条微信：“老师，教师节快乐！”过了一会儿，导师回复：“谢谢，新学期加油。”",
            "你敲了几句新学期的打算，想想又删掉，最后只回了“谢谢老师”。聊天框安静下来，你把手机放到一边，桌上的资料还摊在刚才那一页。",
          ].join("\n\n"),
          buttonLabel: "继续",
          outcome: "你发了教师节祝福，导师简短回复，无事发生。",
        })],
      };
    case "teachers-day-gift": {
      const gift = getTeachersDayGift(resolution.teachersDayGift);
      if (!gift) {
        return {
          nextState: state,
          outcome: "教师节礼物信息无效。",
        };
      }
      const favorResult = applyTierResist(1, state.player.favor, getRoll);
      const favorChange = favorResult.effectiveChange;
      const favorNarrative = getTierResistedNarrative("导师好感", 1, favorResult);
      return {
        nextState: applyStateMutation(state, {
          favor: favorChange,
          money: -1,
        }),
        outcome: `你送了${gift.name}，导师${favorChange > 0 ? "开心收下" : "收下"}，金币 -1，${formatTierResistedOutcome("导师好感", 1, favorResult)}。`,
        enqueueEvents: [createTeachersDayResultEvent({
          state,
          resultId: `gift-${gift.id}`,
          resultTitle: "礼物送达",
          description: [
            ...gift.resultDescription,
            ...(favorNarrative ? [favorNarrative] : []),
            `机制结算\n金币 -1\n${formatTierResistedOutcome("导师好感", 1, favorResult)}`,
          ].join("\n\n"),
          buttonLabel: "继续",
          outcome: `你送了${gift.name}，导师${favorChange > 0 ? "开心收下" : "收下"}，金币 -1，${formatTierResistedOutcome("导师好感", 1, favorResult)}。`,
        })],
      };
    }
    case "teachers-day-stamp": {
      const favorResult = applyTierResist(2, state.player.favor, getRoll);
      const favorChange = favorResult.effectiveChange;
      const favorNarrative = getTierResistedNarrative("导师好感", 2, favorResult);
      const outcome = `你送了邮票，导师${favorChange > 0 ? "开心收下" : "收下"}，金币 -3，${formatTierResistedOutcome("导师好感", 2, favorResult)}。`;
      return {
        nextState: applyStateMutation(state, { favor: favorChange, money: -3 }),
        outcome,
        enqueueEvents: [createTeachersDayResultEvent({
          state,
          resultId: "stamp",
          resultTitle: "邮票送达",
          description: [
            "你选好一套邮票，装进保护袋，下午带到办公室。“老师，教师节快乐！”你把邮票递过去，简单介绍了一下图案。",
            "导师接过来翻看，向你道谢。你原本准备了一段祝福，临到面前只说出一句“希望您喜欢”，说完自己也有点不好意思。",
            ...(favorNarrative ? [favorNarrative] : []),
            `机制结算\n金币 -3\n${formatTierResistedOutcome("导师好感", 2, favorResult)}`,
          ].join("\n\n"),
          buttonLabel: "继续",
          outcome,
        })],
      };
    }
    default:
      return {
        nextState: state,
        outcome: "教师节固定事件结算完成。",
      };
  }
}
