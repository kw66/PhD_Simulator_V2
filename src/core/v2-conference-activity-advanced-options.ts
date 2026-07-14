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
      outcome: "借联培继续深挖合作，社交 +1，下次写论文分数 +8，科研上限 +1。",
      resultDescription: "联培已经把合作通道打开，你这次继续把对话往更细处推进。按旧版真实口径，这会立刻带来社交 +1、下次写论文分数 +8，以及科研上限 +1。",
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
      outcome: "主动围住大牛聊研究，社交 +1，下次写论文分数 +8。",
      resultDescription: "你顶着会场人流把话题推进到具体合作点，成功换来一次更高质量的写作反馈窗口：下次写论文分数 +8，社交 +1。",
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
      outcome: "轻松的聊天让你状态回升，SAN +5，社交 +1。",
      resultDescription: "你和那位活泼学者一路从报告聊到城市小吃，紧绷感一下松了下来，SAN +5，社交 +1。",
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
      outcome: "交流研究细节，SAN +1，社交 +1，下次想 idea 多想 2 次。",
      resultDescription: "你们围着研究细节越聊越深，既提振了一点状态，也为下一次想 idea 留下了更宽的展开空间：SAN +1，社交 +1，下次想 idea 多想 2 次。",
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
        ? "合作默契进一步成形，下次写论文分数 +8，并触发联合培养邀请。"
        : "继续打磨合作细节，下次写论文分数 +8。",
      resultDescription: nextDeepCount >= 2
        ? "你们把合作讨论推进到了更实质的层面，这次交流既会反映到下一轮写作推进，也终于把联合培养邀约推到了台前。"
        : "你们继续围绕合作细节来回拆解，下一轮写作会直接吃到这次深聊留下的增益：下次写论文分数 +8。",
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
        ? "关系明显更近一步，SAN +8，SAN 上限 +3，并触发发展关系。"
        : "相处更自然了，SAN +8，SAN 上限 +3。",
      resultDescription: nextBeautifulCount >= 2
        ? "你们从会场一路聊到散场，熟悉感已经不止是偶遇式的轻松。按旧版真实口径，这次推进会立刻带来 SAN +8、SAN 上限 +3，并触发后续的发展关系事件。"
        : "你们这次相处比上回更自然，也更能让人卸下紧绷。按旧版真实口径，这次推进会立刻带来 SAN +8、SAN 上限 +3。",
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
        ? "关系更进一步，SAN +1，科研 +1，并触发发展关系。"
        : "讨论更投机了，SAN +1，科研 +1。",
      resultDescription: nextSmartCount >= 2
        ? "你们把这次讨论一路推到彼此未来想做的事上。按旧版真实口径，这次推进会立刻带来 SAN +1、科研 +1，并触发后续的发展关系事件。"
        : "这次交流让你们的讨论更像共同推进而不是简单寒暄。按旧版真实口径，这次推进会立刻带来 SAN +1、科研 +1。",
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
