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
      resultDescription: "有了联培合作的基础，这次见面不必再从自我介绍聊起。你们对着关键实验讨论写作安排，对方把推理中的缺口逐一指出，你也学会了更仔细地核对结论。",
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
      resultDescription: "报告结束后，你等主讲人稍微空下来，拿出自己的论文，说明想合作的问题。对方指出论证里最该补清楚的部分，又留下联系方式；你赶紧记下，免得转头只记得自己紧张。",
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
      resultDescription: "你和邻座从刚才的报告聊到各自课题组，对方说起组会里的小插曲，逗得你差点忘了手里的茶。临走前你们交换了联系方式，原本拘谨的自我介绍也变成了闲聊。",
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
      resultDescription: "你们对着同一篇论文讨论了很久，把疑问写在空白处，再挨个想能怎么验证。聊到后来，你发现自己不只是在点头，已经能接着对方的思路提出别的假设。",
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
        ? "你们接着之前的讨论，把论文里还没说清楚的几处推理逐一理顺。临近散场，对方提起联合培养，愿意把合作做得更深入；你先记下邀请，准备和导师认真商量。"
        : "这次再聊合作，你不再只介绍方向，而是把实验依据和写作难点摊开。对方帮你理顺论证，也和你约好后续分工；你终于知道，会后那封邮件具体该写什么。",
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
        ? "你们聊完报告，又说起最近各自忙些什么。分别时，对方问下次什么时候能见，你也认真翻了翻日程；走出一段才发现，自己还在回想刚才那句话。"
        : "再次碰面，你们很快聊起近况，连等电梯的空当都没闲下来。对方问起你上回提过的烦心事，你有点意外，原来那些随口说的话一直有人记着。",
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
        ? "你们先对着方法图推敲实验，又聊到毕业后的打算。几个原本没想明白的地方终于通了，而对方说起想去的城市时，你发现自己听得比刚才还认真。"
        : "你们又对着方法图讨论了很久，这回你能顺着对方的反问解释自己的判断。聊完研究还舍不得散，索性继续说些课题之外的事；你发现自己已经没那么怕冷场了。",
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
