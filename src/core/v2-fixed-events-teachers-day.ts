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
    highFavorHint: "“送盒茶叶要花 1 金币，带到办公室，顺便当面祝老师节日快乐。”",
    lowFavorHint: "“送盒茶叶要花 1 金币，拿不准老师的口味，就挑份常见的茶。”",
    resultDescription: [
      "你买好一盒茶叶，下午敲开办公室的门。导师正对着电脑看论文，你等对方抬起头，才把盒子递过去：“老师，教师节快乐！给您带了盒茶叶。”",
      "导师接过盒子：“谢谢你的心意。”你道了声“不打扰您了”，轻轻带上门。",
    ],
  },
  {
    id: "mooncake",
    name: "月饼",
    choiceLabel: "送月饼",
    amountText: "一盒月饼",
    highFavorHint: "“店里正摆着月饼，花 1 金币买一盒，带给老师当节日点心。”",
    lowFavorHint: "“送盒月饼要花 1 金币，当面说声节日快乐，再请老师尝尝。”",
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
    highFavorHint: "“送束鲜花要花 1 金币，放在老师办公桌上，也添点节日气氛。”",
    lowFavorHint: "“送束鲜花要花 1 金币，不必猜老师爱吃什么，送份节日心意就好。”",
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
    ? "“和老师相处还算熟悉，发条祝福，聊上两句也挺好。”"
    : "“发个祝福就好，简单自然也挺好。”";
  const giftHint = state.player.favor >= 6 ? gift.highFavorHint : gift.lowFavorHint;
  const stampHint = state.player.favor >= 6
    ? "“送套邮票也很有心意，不过要花 3 金币。”"
    : "“送套邮票有点贵，要花 3 金币。”";

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
      "9 月 10 日一早，你打开实验室群，满屏都是“教师节快乐”。正准备跟上一句，又看到同学在讨论要不要带点小礼物。",
      `你和导师关系${relationText}（当前好感等级：${favorLevelName}），也开始琢磨该怎么表示一下。`,
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
                "“谢谢！正好有个想法跟你聊聊。”你边听边记，把可能的切入点写了下来。挂断电话，你翻回那页笔记，已经想好明天先从哪里梳理思路，不再只对着空白文档发愁。",
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
              "你回了个笑脸，收起手机，继续整理桌上的资料。祝福送到就好，倒也不用把聊天框里的每个字都分析一遍。",
            ].join("\n\n"),
            buttonLabel: "继续",
            outcome: "你发了教师节祝福，导师礼貌回复，无事发生。",
          })],
        };
      }

      if (getRoll() < 0.5) {
        const sanChange = getActualSanChange(-3, state.month, state.eventSupport);
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
              "你拿齐材料，在财务处排了快一个小时的队，回来又把受理情况告诉导师。对方道了声谢，你看看时间，半个下午已经没了——祝福发出去了，跑腿任务也领回来了。",
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
            "你没有再追发一段长消息，回了句“谢谢老师”就收起手机，照常做自己的事。节日问候到这里结束，聊天框安静下来。",
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
