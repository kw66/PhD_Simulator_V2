import { applyTierResist, getActualSanChange } from "./v2-sanity-rules";
import { wouldUnlockLearnToSayNo, type RandomRollProvider } from "./v2-random-events-lab-shared";
import type { GameState, PendingEvent } from "./v2-types";

function createRandomEvent1(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const becomesJunior = getRoll() < 0.5;
  const delegateSocialChange = applyTierResist(-1, state.player.social, getRoll).effectiveChange;

  return {
    id: `random-1-y${state.year}-m${state.month}-n${serial}`,
    title: "毕设辅导",
    description: "导师把一名本科生交给你带。你得在时间消耗、导师评价和组内关系之间做权衡。",
    preview: "导师让你指导本科生毕设",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-1",
    stage: "act1",
    choices: [
      {
        id: `random-1-refuse-${serial}`,
        label: "委婉拒绝",
        outcome: "导师好感 -1。",
        effects: {
          favor: -1,
          counterDeltas: { rejectedMentoringCount: 1 },
          achievementFlags: wouldUnlockLearnToSayNo(state, "mentoring") ? ["learnToSayNo"] : [],
        },
      },
      {
        id: `random-1-self-${serial}`,
        label: "亲自指导",
        outcome: becomesJunior ? "SAN -3，科研 +1，并可能成为你的师弟/师妹。" : "SAN -3。",
        effects: becomesJunior
          ? {
            san: -3,
            research: 1,
            relationshipAdditions: ["junior"],
          }
          : {
            san: -3,
          },
      },
      {
        id: `random-1-delegate-${serial}`,
        label: "转给师弟",
        outcome: delegateSocialChange < 0 ? `社交 ${delegateSocialChange}。` : "无事发生。",
        effects: delegateSocialChange < 0 ? { social: delegateSocialChange } : {},
      },
    ],
  };
}

function createRandomEvent2(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const gotInspiration = getRoll() < 0.5;
  const isLowSocial = state.player.social < 6;

  return {
    id: `random-2-y${state.year}-m${state.month}-n${serial}`,
    title: "帮忙审稿",
    description: "导师把一篇审稿任务转给了你。你要在时间消耗、职业信用和人情成本之间做选择。",
    preview: "导师让你帮忙审稿",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-2",
    stage: "act1",
    choices: [
      {
        id: `random-2-refuse-${serial}`,
        label: "婉言推辞",
        outcome: "导师好感 -1。",
        effects: {
          favor: -1,
          counterDeltas: { rejectedReviewCount: 1 },
          achievementFlags: wouldUnlockLearnToSayNo(state, "review") ? ["learnToSayNo"] : [],
        },
      },
      {
        id: `random-2-self-${serial}`,
        label: "认真审稿",
        outcome: gotInspiration ? "SAN -2，下次想 idea +4。" : "SAN -2。",
        effects: gotInspiration
          ? {
            san: -2,
            temporaryActionEffectUpdates: {
              idea: { bonus: 4 },
            },
          }
          : {
            san: -2,
          },
      },
      {
        id: `random-2-delegate-${serial}`,
        label: "交给师弟",
        outcome: isLowSocial ? "社交 -1。" : "无事发生。",
        effects: isLowSocial ? { social: -1 } : {},
      },
    ],
  };
}

function createRandomEvent14(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const roleText = getRoll() < 0.5 ? "师弟" : "师妹";
  const eventTitle = roleText === "师弟" ? "指导师弟" : "指导师妹";
  const shortTermSan = getActualSanChange(-5, state.month, state.eventSupport);

  return {
    id: `random-14-y${state.year}-m${state.month}-n${serial}`,
    title: eventTitle,
    description: `一位新入组${roleText}来请教代码与实验流程。带人会分走你的时间，但也可能积累团队资源和长期协作回报。`,
    preview: "你已经初窥科研门道了...",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-14",
    stage: "act1",
    choices: [
      {
        id: `random-14-decline-${serial}`,
        label: "精力有限，婉拒拒绝",
        outcome: "无事发生。",
        effects: {},
      },
      {
        id: `random-14-idea-${serial}`,
        label: "短期合作，分享idea",
        outcome: `SAN ${shortTermSan}，社交 +1。`,
        effects: {
          san: shortTermSan,
          social: 1,
          relationshipAdditions: ["junior"],
        },
      },
      {
        id: `random-14-long-term-${serial}`,
        label: "长期合作，共同成长",
        outcome: "获得长期指导：每月 SAN -1，总引用 +师弟师妹数 x3。",
        effects: {
          mentorshipStacks: 1,
          relationshipAdditions: ["junior"],
        },
      },
    ],
  };
}

export function createMentoringLabRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): PendingEvent | null {
  if (eventId === 1) {
    return createRandomEvent1(state, getRoll);
  }
  if (eventId === 2) {
    return createRandomEvent2(state, getRoll);
  }
  if (eventId === 14) {
    return createRandomEvent14(state, getRoll);
  }
  return null;
}
