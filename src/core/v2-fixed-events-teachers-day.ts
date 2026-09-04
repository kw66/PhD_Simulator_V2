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
    highFavorHint: "“送盒茶叶表示一下心意，1 金币不算贵，导师平时也爱喝茶。”",
    lowFavorHint: "“送盒茶叶也不错，1 金币不算太贵，平时还能喝。”",
    resultDescription: [
      "你决定送一盒茶叶。",
      "下午，你拎着精心挑选的茶叶来到导师办公室。敲门进去，导师正在批改论文。",
      "“老师，教师节快乐！”你递上茶叶，“这是给您的小礼物，知道您爱喝茶。”",
      "导师接过茶叶，笑着说：“哎呀，还破费了。这茶不错啊，正好最近喝完了。”",
      "导师拍了拍你的肩膀：“谢谢你的心意！”",
    ],
  },
  {
    id: "mooncake",
    name: "月饼",
    choiceLabel: "送月饼",
    amountText: "一盒月饼",
    highFavorHint: "“中秋也快到了，送盒月饼正合适，1 金币就当提前祝个节。”",
    lowFavorHint: "“送盒月饼也不错，1 金币不算太贵，也有点节日气氛。”",
    resultDescription: [
      "你决定送一盒月饼。",
      "下午，你拎着月饼来到导师办公室。敲门进去，导师正在回复邮件。",
      "“老师，教师节快乐！中秋也快到了，这盒月饼给您尝尝。”",
      "导师接过盒子看了看：“谢谢，正好晚上带回去和家里人一起吃。”",
      "你们又聊了几句最近的进度，气氛比平时轻松不少。",
    ],
  },
  {
    id: "flower",
    name: "鲜花",
    choiceLabel: "送鲜花",
    amountText: "一束鲜花",
    highFavorHint: "“送束鲜花也不错，1 金币，简单体面，也有点节日气氛。”",
    lowFavorHint: "“送束鲜花也不错，1 金币不算太贵，放在办公室也好看。”",
    resultDescription: [
      "你决定送一束鲜花。",
      "下午，你捧着一束康乃馨来到导师办公室。敲门进去，导师正在批改学生的作业。",
      "“老师，教师节快乐！”你递上鲜花，“这是给您的小心意。”",
      "导师接过花束，笑着说：“还特意买了花，谢谢你。”",
      "导师找来一个花瓶把花插好，放在办公桌一角。",
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
    ? "“和导师关系还行，应该不会计较这些形式上的东西吧……说不定还能趁机聊聊学术？”"
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
      "9 月 10 日一早，实验室群里开始刷“教师节快乐”。",
      "有人说发条消息就够，有人说最好准备点心意，气氛微妙地卷了起来。",
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
                "你想了想，决定不送礼物。",
                "毕竟平时和导师关系不错，导师应该不会在意这些形式上的东西。",
                "你发了条微信：“老师，教师节快乐！祝您身体健康，工作顺利！”",
                "导师很快回复：“谢谢！对了，我最近有个想法想和你聊聊，明天来办公室一趟？”",
                "你心里一动，导师主动找你聊想法，这可是难得的机会！",
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
              "你想了想，决定不送礼物。",
                "毕竟平时和导师关系不错，导师应该不会在意这些形式上的东西。",
              "你发了条微信：“老师，教师节快乐！祝您身体健康，工作顺利！”",
              "导师很快回复：“谢谢！好好做科研就是最好的礼物。”",
              "你松了口气，看来导师确实不在意这些。",
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
              "你想了想，决定不送礼物。",
              "你发了条微信：“老师，教师节快乐！”",
              "消息发出去没多久，导师回复：“谢谢。对了，我这边有几张发票要报销，你下午有空帮我跑一趟财务处吧。”",
              "你看着消息，心里有点郁闷……教师节变成了跑腿日。",
              "财务处的队伍一直排到门外，你在队尾站了快一个小时，回来时下午已经过了一半。",
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
        outcome: "你发去节日祝福，导师简短回了一句“好好学习”，这次无事发生。",
        enqueueEvents: [createTeachersDayResultEvent({
          state,
          resultId: "message-plain",
          resultTitle: "简单祝福",
          description: [
            "你想了想，决定不送礼物。",
            "你发了条微信：“老师，教师节快乐！”",
            "消息发出去后，导师过了一会儿回复：“谢谢，好好学习。”",
            "虽然回复有些简短，但至少没什么坏事发生。",
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
            "你决定送一套邮票。",
            "下午，你把邮票送到导师办公室，简单说了句：“老师，教师节快乐！”",
            "导师接过邮票，笑着道谢，顺口和你聊了几句最近的研究进展。",
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
