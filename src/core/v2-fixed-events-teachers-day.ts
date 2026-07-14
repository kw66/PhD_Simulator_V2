import { applyTierResist, getActualSanChange } from "./v2-sanity-rules";
import {
  applyStateMutation,
  createFixedEvent,
  drawInclusiveInt,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

function createTeachersDayChoiceEvent(state: GameState): PendingEvent {
  const relationText = state.player.favor >= 6 ? "还不错" : "一般";

  return createFixedEvent({
    id: `teachers-day-choice-y${state.year}-m${state.month}`,
    title: "教师节 ➜ 你的选择",
    description: `你和导师当前关系${relationText}（当前好感 ${state.player.favor}）。发祝福最省成本，送茶叶更稳妥，鲜花更有仪式感，邮票最容易让导师记住你。关键不在“贵不贵”，而在你想传达哪种关系信号。`,
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
  return createFixedEvent({
    id: `teachers-day-y${state.year}-m${state.month}`,
    title: "教师节",
    description: "9 月 10 日一早，实验室群里开始刷“教师节快乐”。有人觉得发条消息就够，也有人觉得最好准备点心意，气氛微妙地卷了起来。这件事不只是礼物本身，更像一次“分寸感”测试：既不能太轻飘，也不能越过边界。",
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
          };
        }
        return {
          nextState: applyStateMutation(state, { consecutiveStampGiftCount: 0 }),
          outcome: "你发去节日祝福，导师礼貌回复，没有额外数值变化。",
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
        };
      }

      return {
        nextState: applyStateMutation(state, { consecutiveStampGiftCount: 0 }),
        outcome: "你发去节日祝福，导师简短回了一句“好好学习”，这次无事发生。",
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
      };
    }
    default:
      return {
        nextState: state,
        outcome: "教师节固定事件结算完成。",
      };
  }
}
