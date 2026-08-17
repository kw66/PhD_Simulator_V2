import { createLoverState } from "./v2-lover-system";
import type {
  ConferenceActivityBuildState,
  ConferenceActivityOptionDefinition,
} from "./v2-conference-activity-shared";

export function createAdvancedConferenceActivityOptions(
  state: ConferenceActivityBuildState,
): ConferenceActivityOptionDefinition[] {
  const options: ConferenceActivityOptionDefinition[] = [];
  const loverState = state.loverState ?? createLoverState();
  const hasLover = loverState.active || state.relationshipState.loverCount > 0;
  const encounter = state.conferenceEncounterState;

  if (state.social < 6) {
    return options;
  }

  if (encounter.bigBullCooperation) {
    options.push({
      id: "big-bull-coop",
      label: "🎓 找大牛合作（借联培继续深挖）",
      outcome: "社交 +1，下次写论文 +8，科研上限 +1。",
      resultDescription: "有了联培基础，合作聊得更具体。社交 +1，写论文 +8，科研上限 +1。",
      effects: {
        social: 1,
        temporaryActionEffectUpdates: {
          writing: { bonus: 8 },
        },
        researchCapacityStateDeltas: {
          otherCapBonus: 1,
        },
        conferenceEncounterUpdates: {
          bigBullCoopCount: encounter.bigBullCoopCount + 1,
        },
      },
    });
  } else if (!encounter.metBigBullCoop) {
    options.push({
      id: "big-bull-coop",
      label: "🎓 找大牛合作（主动争取一次机会）",
      outcome: "社交 +1，下次写论文 +8。",
      resultDescription: "你主动聊到合作，对方愿意继续跟进。社交 +1，写论文 +8。",
      effects: {
        social: 1,
        temporaryActionEffectUpdates: {
          writing: { bonus: 8 },
        },
        conferenceEncounterUpdates: {
          metBigBull: true,
          metBigBullCoop: true,
        },
      },
    });
  }

  if (!encounter.metBeautiful && !encounter.permanentlyBlockedBeautifulLover && !hasLover) {
    options.push({
      id: "beautiful-scholar",
      label: "💕 和活泼学者交流",
      outcome: "SAN +5，社交 +1。",
      resultDescription: "你们从报告聊到吃饭，意外地投缘。SAN +5，社交 +1。",
      effects: {
        san: 5,
        social: 1,
        conferenceEncounterUpdates: {
          metBeautiful: true,
          beautifulCount: state.conferenceEncounterState.beautifulCount + 1,
        },
      },
    });
  }

  if (!encounter.metSmart && !encounter.permanentlyBlockedSmartLover && !hasLover) {
    options.push({
      id: "smart-scholar",
      label: "🧠 和聪慧学者交流（深聊研究）",
      outcome: "SAN +1，社交 +1，下次想 idea 多 2 次。",
      resultDescription: "你们对着论文聊了很久，想到几个新方向。SAN +1，社交 +1，想 idea 多 2 次。",
      effects: {
        san: 1,
        social: 1,
        temporaryActionEffectUpdates: {
          idea: { extraActions: 2 },
        },
        conferenceEncounterUpdates: {
          metSmart: true,
          smartCount: state.conferenceEncounterState.smartCount + 1,
        },
      },
    });
  }

  if (
    state.research >= 12
    && encounter.metBigBullCoop
    && !encounter.bigBullCooperation
    && !encounter.permanentlyBlockedBigBullCoop
  ) {
    const nextDeepCount = encounter.bigBullDeepCount + 1;
    options.push({
      id: "big-bull-joint-training",
      label: "🌟 和上次那位大牛深入合作",
      outcome: nextDeepCount >= 2
        ? "下次写论文 +8，收到联合培养邀请。"
        : "下次写论文 +8。",
      resultDescription: nextDeepCount >= 2
        ? "几次交流后，对方发来联合培养邀请。下次写论文 +8。"
        : "这次终于聊到具体分工。下次写论文 +8。",
      effects: {
        temporaryActionEffectUpdates: {
          writing: { bonus: 8 },
        },
        conferenceEncounterUpdates: {
          bigBullDeepCount: nextDeepCount,
        },
        triggerJointTrainingInvite: nextDeepCount >= 2,
      },
    });
  }

  if (state.social >= 12 && encounter.metBeautiful && !hasLover && !encounter.permanentlyBlockedBeautifulLover) {
    const nextBeautifulCount = encounter.beautifulCount + 1;
    options.push({
      id: "beautiful-lover-development",
      label: "💕 和上次那位活泼学者继续交流",
      outcome: nextBeautifulCount >= 2
        ? "SAN +8，SAN 上限 +3，触发关系事件。"
        : "SAN +8，SAN 上限 +3。",
      resultDescription: nextBeautifulCount >= 2
        ? "聊到散场，你发现自己开始期待下次见面。SAN +8，SAN 上限 +3。"
        : "你们相处得更自然了。SAN +8，SAN 上限 +3。",
      effects: {
        san: 8,
        sanCapDelta: 3,
        conferenceEncounterUpdates: {
          beautifulCount: nextBeautifulCount,
        },
        triggerLoverDevelopment: nextBeautifulCount >= 2 ? "beautiful" : undefined,
      },
    });
  }

  if (state.social >= 12 && encounter.metSmart && !hasLover && !encounter.permanentlyBlockedSmartLover) {
    const nextSmartCount = encounter.smartCount + 1;
    options.push({
      id: "smart-lover-development",
      label: "🧠 和上次那位聪慧学者继续交流",
      outcome: nextSmartCount >= 2
        ? "SAN +1，科研 +1，触发关系事件。"
        : "SAN +1，科研 +1。",
      resultDescription: nextSmartCount >= 2
        ? "话题从论文聊到未来，你有些在意对方的回答。SAN +1，科研 +1。"
        : "你们的思路很合拍。SAN +1，科研 +1。",
      effects: {
        san: 1,
        research: 1,
        conferenceEncounterUpdates: {
          smartCount: nextSmartCount,
        },
        triggerLoverDevelopment: nextSmartCount >= 2 ? "smart" : undefined,
      },
    });
  }

  return options;
}
