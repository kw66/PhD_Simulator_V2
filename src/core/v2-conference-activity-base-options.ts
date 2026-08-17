import { increaseInternshipExperimentMultiplier } from "./v2-internship-system";
import type {
  ConferenceActivityBuildState,
  ConferenceActivityContext,
  ConferenceActivityOptionDefinition,
} from "./v2-conference-activity-shared";

export function createBaseConferenceActivityOptions(
  context: ConferenceActivityContext,
  state: ConferenceActivityBuildState,
): ConferenceActivityOptionDefinition[] {
  return [
    {
      id: "tour-local",
      label: "🏖️ 顺便在当地走走",
      outcome: `逛了逛 ${context.city}，SAN +6。`,
      resultDescription: `你在 ${context.city} 走了一下午，脑子终于空下来。SAN +6。`,
      effects: {
        san: 6,
        counterDeltas: { tourCount: 1 },
      },
    },
    {
      id: "tea-break",
      label: "☕ 茶歇与晚宴交流",
      outcome: "SAN +1，社交 +1。",
      resultDescription: "几轮茶歇下来，你认识了几位同行。SAN +1，社交 +1。",
      effects: {
        san: 1,
        social: 1,
        counterDeltas: { teaBreakCount: 1 },
      },
    },
    {
      id: "experiment-discussion",
      label: "🔬 和同行深聊实验思路",
      outcome: "下次做实验多 3 次。",
      resultDescription: "和同行聊完，你找到一个能试的改法。下次做实验多 3 次。",
      effects: {
        temporaryActionEffectUpdates: {
          experiment: { extraActions: 3 },
        },
      },
    },
    {
      id: "idea-networking",
      label: "💡 广泛交流找灵感",
      outcome: "下次想 idea 多 3 次。",
      resultDescription: "几场交流后，零散想法连了起来。下次想 idea 多 3 次。",
      effects: {
        temporaryActionEffectUpdates: {
          idea: { extraActions: 3 },
        },
      },
    },
    {
      id: "peer-collaboration",
      label: "🤝 和同学约一次后续合作",
      outcome: "下次做实验 +5。",
      resultDescription: "聊到最后，你们约好会后合作。下次做实验 +5。",
      effects: {
        temporaryActionEffectUpdates: {
          experiment: { bonus: 5 },
        },
      },
    },
    {
      id: "famous-scholar",
      label: "🌟 主动请教著名学者",
      outcome: "下次想 idea ×1.25。",
      resultDescription: "对方点出一个关键问题，方向清楚了些。下次想 idea ×1.25。",
      effects: {
        temporaryActionEffectUpdates: {
          idea: { multiplier: 1.25 },
        },
        conferenceEncounterUpdates: {
          metBigBull: true,
        },
      },
    },
    {
      id: "enterprise-networking",
      label: "🏢 与企业代表深入交流",
      outcome: "下次做实验 ×1.25。",
      resultDescription: "你听到不少真实需求，下一轮实验更有针对性。下次做实验 ×1.25。",
      effects: {
        temporaryActionEffectUpdates: {
          experiment: { multiplier: 1.25 },
        },
        conferenceCareerUpdates: {
          enterpriseCount: state.conferenceCareerState.enterpriseCount + 1,
        },
        ...(state.internshipState.active
          ? { internshipStateUpdates: increaseInternshipExperimentMultiplier(state.internshipState) }
          : {}),
        triggerInternshipInvite: true,
      },
    },
  ];
}
