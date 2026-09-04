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
      resultDescription: "有了之前联培的基础，你们没有再停留在客套交流，而是直接核对数据、分工和时间表。会后，对方把下一版合作计划发进共享文档。",
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
      resultDescription: "你在报告结束后主动介绍了自己的课题，也拿出一页已经完成的结果。对方愿意会后继续看材料，并留下了后续联系的方式。",
      effects: {
        social: 1,
        temporaryActionEffectUpdates: {
          writing: { bonus: 8 },
        },
        conferenceEncounterUpdates: {
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
      resultDescription: "你们从刚才的报告聊到各自课题组，又顺路一起去吃了晚饭。散场时，原本正式的同行交流已经变得轻松很多。",
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
      resultDescription: "你们对着同一篇论文聊了很久，一边质疑实验设置，一边在纸上改方法。分开时，你已经记下两条值得继续试的新方向。",
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
        ? "你们把合作方案又往前推进了一步。会后不久，对方正式发来联合培养邀请，希望把这项合作长期做下去。"
        : "你们没有再泛泛聊方向，而是把数据、实验和写作分工逐项定了下来。会后第一项任务已经落到共享文档里。",
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
        ? "你们从会场一路聊到地铁口，分别时又约了下一次见面。回酒店的路上，你发现自己已经开始期待那一天。"
        : "再次见面以后，话题很快从报告转到近况和旅行。你们相处得比上次自然，也约好明天继续一起逛会场。",
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
        ? "话题从论文慢慢聊到毕业以后的打算。你开始在意对方会去哪里，也留心对方是否问了同样的问题。"
        : "你们又对着同一张方法图讨论了很久，常常一句话就能接上对方的思路。散场以后，聊天仍没有马上停下来。",
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
