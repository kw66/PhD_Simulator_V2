import { applyTierResist, getActualSanChange } from "./v2-sanity-rules";
import {
  applyStateMutation,
  createFixedEvent,
  drawInclusiveInt,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

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
    preview: params.resultTitle,
    chainId: "teachers-day",
    stage: "result",
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

function createTeachersDayChoiceEvent(state: GameState): PendingEvent {
  const noGiftHint = state.player.favor >= 6
    ? "“和导师关系还行，应该不会计较这些形式上的东西吧……说不定还能趁机聊聊学术？”"
    : "“什么都不送的话……万一导师正好有事找我帮忙，那就尴尬了……”";
  const teaHint = state.player.favor >= 6
    ? "“送盒茶叶表示一下心意，1 金币不算贵，导师平时也爱喝茶。”"
    : "“送盒茶叶比较稳妥，1 金币就能让导师记住我的好。”";
  const flowerHint = state.player.favor >= 6
    ? "“送束鲜花也不错，2 金币，既体面又不会太贵重。”"
    : "“送束鲜花比较得体，2 金币也不算太贵，应该能给导师留个好印象。”";
  const stampHint = state.player.favor >= 6
    ? "“导师喜欢集邮，送套邮票肯定能让他高兴。不过 3 金币有点肉疼……”"
    : "“送套邮票的话，导师肯定印象深刻。就是 3 金币有点贵……”";

  return createFixedEvent({
    id: `teachers-day-choice-y${state.year}-m${state.month}`,
    title: "教师节 ➜ 你的选择",
    description: [
      noGiftHint,
      teaHint,
      flowerHint,
      stampHint,
      "你在心里反复衡量：发祝福最省成本、送茶叶更稳妥、鲜花更有仪式感、邮票最容易拉开记忆点。关键不在“贵不贵”，而在你想传达哪种关系信号。",
    ].join("\n\n"),
    preview: "在祝福与送礼之间做选择",
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
        id: `teachers-day-tea-y${state.year}-m${state.month}`,
        label: "送茶叶",
        outcome: "你准备送一盒茶叶表示心意。",
        effects: {
          fixedEventResolution: { kind: "teachers-day-tea" },
        },
      },
      {
        id: `teachers-day-flower-y${state.year}-m${state.month}`,
        label: "送鲜花",
        outcome: "你准备送一束鲜花表示敬意。",
        effects: {
          fixedEventResolution: { kind: "teachers-day-flower" },
        },
      },
      {
        id: `teachers-day-stamp-y${state.year}-m${state.month}`,
        label: "送邮票",
        outcome: "你准备送一套邮票让导师记住你。",
        effects: {
          fixedEventResolution: { kind: "teachers-day-stamp" },
        },
      },
    ],
  });
}

export function createTeachersDayEvent(state: GameState): PendingEvent {
  const relationText = state.player.favor >= 6 ? "还不错" : "一般";
  return createFixedEvent({
    id: `teachers-day-y${state.year}-m${state.month}`,
    title: "教师节",
    description: [
      "9 月 10 日一早，实验室群里开始刷“教师节快乐”。",
      "有人说发条消息就够，有人说最好准备点心意，气氛微妙地卷了起来。",
      `你和导师关系${relationText}（当前好感 ${state.player.favor}），开始权衡怎么做最得体。`,
      "这件事不只是礼物本身，更像一次“分寸感”测试：既不能太轻飘，也不能越过边界。",
    ].join("\n\n"),
    preview: "教师节到了，要给导师送礼物吗？",
    chainId: "teachers-day",
    choices: [
      {
        id: `teachers-day-continue-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "你开始认真权衡这次教师节该怎么处理。",
        effects: {
          enqueueEvents: [createTeachersDayChoiceEvent(state)],
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
              consecutiveStampGiftCount: 0,
            }),
            outcome: `你发去节日祝福，导师顺势分享了一个想法，下次想 idea +${ideaBonus}。`,
            enqueueEvents: [createTeachersDayResultEvent({
              state,
              resultId: "message-idea",
              resultTitle: "导师来电",
              description: [
                "你想了想，决定不送礼物。",
                "毕竟平时和导师关系不错，他应该不会在意这些形式上的东西。",
                "你发了条微信：“老师，教师节快乐！祝您身体健康，工作顺利！”",
                "导师很快回复：“谢谢！对了，我最近有个想法想和你聊聊，明天来办公室一趟？”",
                "你心里一动，导师主动找你聊想法，这可是难得的机会！",
                `机制结算\n下次想 idea +${ideaBonus}`,
              ].join("\n\n"),
              buttonLabel: "期待明天",
              outcome: `导师分享了一个想法，下次想 idea +${ideaBonus}。`,
            })],
          };
        }
        return {
          nextState: applyStateMutation(state, { consecutiveStampGiftCount: 0 }),
          outcome: "你发去节日祝福，导师礼貌回复，没有额外数值变化。",
          enqueueEvents: [createTeachersDayResultEvent({
            state,
            resultId: "message-reply",
            resultTitle: "简单祝福",
            description: [
              "你想了想，决定不送礼物。",
              "毕竟平时和导师关系不错，他应该不会在意这些形式上的东西。",
              "你发了条微信：“老师，教师节快乐！祝您身体健康，工作顺利！”",
              "导师很快回复：“谢谢！好好做科研就是最好的礼物。”",
              "你松了口气，看来导师确实不在意这些。",
              "机制结算\n无直接数值变化",
            ].join("\n\n"),
            buttonLabel: "继续",
            outcome: "无事发生。",
          })],
        };
      }

      if (getRoll() < 0.5) {
        const sanChange = getActualSanChange(-3, state.month, state.eventSupport);
        return {
          nextState: applyStateMutation(state, {
            san: sanChange,
            consecutiveStampGiftCount: 0,
          }),
          outcome: `你发去祝福后，导师顺手把报销跑腿丢给了你，SAN ${sanChange}。`,
          enqueueEvents: [createTeachersDayResultEvent({
            state,
            resultId: "message-errand",
            resultTitle: "导师请求",
            description: [
              "你想了想，决定不送礼物。",
              "你发了条微信：“老师，教师节快乐！”",
              "消息发出去没多久，导师回复：“谢谢。对了，我这边有几张发票要报销，你下午有空帮我跑一趟财务处吧。”",
              "你看着消息，心里有点郁闷……教师节变成了跑腿日。",
              "财务处的队伍排得老长，你站在队尾，感觉身心俱疲……",
              `机制结算\nSAN ${sanChange}`,
            ].join("\n\n"),
            buttonLabel: "认命",
            outcome: `被叫去财务处跑腿，SAN ${sanChange}。`,
          })],
        };
      }

      return {
        nextState: applyStateMutation(state, { consecutiveStampGiftCount: 0 }),
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
            "机制结算\n无直接数值变化",
          ].join("\n\n"),
          buttonLabel: "继续",
          outcome: "无事发生。",
        })],
      };
    case "teachers-day-tea": {
      const favorChange = applyTierResist(1, state.player.favor, getRoll).effectiveChange;
      return {
        nextState: applyStateMutation(state, {
          favor: favorChange,
          money: -1,
          consecutiveStampGiftCount: 0,
        }),
        outcome: favorChange > 0
          ? `你送出茶叶，金钱 -1，导师好感 +${favorChange}。`
          : "你送出茶叶，金钱 -1，但这次没有额外拉近关系。",
        enqueueEvents: [createTeachersDayResultEvent({
          state,
          resultId: "tea",
          resultTitle: "礼物送达",
          description: [
            "你决定送一盒茶叶。",
            "下午，你拎着精心挑选的茶叶来到导师办公室。敲门进去，导师正在批改论文。",
            "“老师，教师节快乐！”你递上茶叶，“这是给您的小礼物，知道您爱喝茶。”",
            "导师接过茶叶，笑着说：“哎呀，还破费了。”他打开包装看了看：“嗯，这茶不错啊，正好最近喝完了。”",
            "他拍了拍你的肩膀：“谢谢你的心意！”",
            `机制结算\n金币 -1\n导师好感度 ${favorChange > 0 ? "+" : ""}${favorChange}`,
          ].join("\n\n"),
          buttonLabel: "继续",
          outcome: favorChange > 0
            ? `金币 -1，导师好感 +${favorChange}。`
            : "金币 -1，导师好感没有变化。",
        })],
      };
    }
    case "teachers-day-flower": {
      const rawFavor = drawInclusiveInt(1, 2, getRoll);
      const favorChange = applyTierResist(rawFavor, state.player.favor, getRoll).effectiveChange;
      return {
        nextState: applyStateMutation(state, {
          favor: favorChange,
          money: -2,
          consecutiveStampGiftCount: 0,
        }),
        outcome: favorChange > 0
          ? `你送出鲜花，金钱 -2，导师好感 +${favorChange}。`
          : "你送出鲜花，金钱 -2，但这次没有额外拉近关系。",
        enqueueEvents: [createTeachersDayResultEvent({
          state,
          resultId: "flower",
          resultTitle: "礼物送达",
          description: [
            "你决定送一束鲜花。",
            "下午，你捧着精心挑选的康乃馨来到导师办公室。敲门进去，导师正在批改学生的作业。",
            "“老师，教师节快乐！”你递上鲜花，“这是给您的小心意。”",
            "导师接过花束，脸上露出惊喜的笑容：“哎呀，真漂亮！”他闻了闻花香，“谢谢你，有心了。”",
            "他找来一个花瓶，小心地把花插好，放在办公桌上：“这下办公室都亮堂了不少。”",
            `机制结算\n金币 -2\n导师好感度 ${favorChange > 0 ? "+" : ""}${favorChange}`,
          ].join("\n\n"),
          buttonLabel: "继续",
          outcome: favorChange > 0
            ? `金币 -2，导师好感 +${favorChange}。`
            : "金币 -2，导师好感没有变化。",
        })],
      };
    }
    case "teachers-day-stamp": {
      const favorChange = applyTierResist(2, state.player.favor, getRoll).effectiveChange;
      const consecutiveCount = state.eventCounters.consecutiveStampGiftCount + 1;
      const unlockAchievement = consecutiveCount >= 3;
      const prefix = favorChange > 0
        ? `你送出邮票，金钱 -3，导师好感 +${favorChange}。`
        : "你送出邮票，金钱 -3，但这次没有额外拉近关系。";
      return {
        nextState: applyStateMutation(state, {
          favor: favorChange,
          money: -3,
          consecutiveStampGiftCount: consecutiveCount,
          unlockLoveMyTeacher: unlockAchievement,
        }),
        outcome: unlockAchievement
          ? `${prefix}连续 3 年在教师节赠送邮票，解锁成就「吾爱吾师」。`
          : `${prefix}连续送邮票记录 ${consecutiveCount} 年。`,
        enqueueEvents: [createTeachersDayResultEvent({
          state,
          resultId: "stamp",
          resultTitle: "导师大喜",
          description: [
            "你决定送一套珍藏邮票。",
            "下午，你拎着精心包装的邮票来到导师办公室。敲门进去，导师正在整理书架上的集邮册。",
            "“老师，教师节快乐！”你递上邮票，“听说您喜欢集邮，这是我特意挑选的。”",
            "导师接过邮票，眼睛一亮：“哎呀！”他小心翼翼地打开包装，“这套邮票我找了很久了！”",
            "他仔细端详着每一枚邮票，满脸笑容：“你真是有心了，太感谢了！这可是稀罕货啊。”",
            ...(unlockAchievement
              ? ["导师翻开集邮册，指着前两年你送的邮票：“你看，这些都是你送的。连续三年了，真是个好学生！”"]
              : []),
            `机制结算\n金币 -3\n导师好感度 ${favorChange > 0 ? "+" : ""}${favorChange}${unlockAchievement ? "\n解锁成就“吾爱吾师”（连续 3 年赠送邮票）" : ""}`,
          ].join("\n\n"),
          buttonLabel: "继续",
          outcome: unlockAchievement
            ? `${prefix}连续 3 年赠送邮票，解锁成就“吾爱吾师”。`
            : `${prefix}连续送邮票记录 ${consecutiveCount} 年。`,
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
