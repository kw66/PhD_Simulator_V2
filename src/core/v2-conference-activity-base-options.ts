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
      outcome: `在 ${context.city} 顺便走走，SAN +6。`,
      resultDescription: `你把碎片时间留给了 ${context.city} 的街道与风景，紧绷许久的神经终于缓下来，SAN +6。`,
      effects: {
        san: 6,
        counterDeltas: { tourCount: 1 },
      },
    },
    {
      id: "tea-break",
      label: "☕ 茶歇与晚宴交流",
      outcome: "在茶歇与晚宴间维持交流，SAN +1，社交 +1。",
      resultDescription: "你把主要精力放在茶歇与晚宴交流上，既缓冲了状态，也顺手拓宽了社交触角，SAN +1，社交 +1。",
      effects: {
        san: 1,
        social: 1,
        counterDeltas: { teaBreakCount: 1 },
      },
    },
    {
      id: "experiment-discussion",
      label: "🔬 和同行深聊实验思路",
      outcome: "从同行那里摸到新的实验展开方式；下次做实验多做 3 次。",
      resultDescription: "你围着实验设计和同行反复拆解细节，把会场交流沉淀成一次确定性的实验推进优势：下次做实验多做 3 次。",
      effects: {
        temporaryActionEffectUpdates: {
          experiment: { extraActions: 3 },
        },
      },
    },
    {
      id: "idea-networking",
      label: "💡 广泛交流找灵感",
      outcome: "从密集交流里攒出新灵感；下次想 idea 多想 3 次。",
      resultDescription: "你把注意力分散到更广的交流面上，让零散火花逐渐聚成方向感：下次想 idea 多想 3 次。",
      effects: {
        temporaryActionEffectUpdates: {
          idea: { extraActions: 3 },
        },
      },
    },
    {
      id: "peer-collaboration",
      label: "🤝 和同学约一次后续合作",
      outcome: "提前约好后续合作；下次做实验分数 +5。",
      resultDescription: "你把会场里最靠谱的一段对话落成了后续合作，下一轮实验会更快进入有效推进：下次做实验分数 +5。",
      effects: {
        temporaryActionEffectUpdates: {
          experiment: { bonus: 5 },
        },
      },
    },
    {
      id: "famous-scholar",
      label: "🌟 主动请教著名学者",
      outcome: "从高质量请教中收束方向；下次想 idea ×1.25。",
      resultDescription: "你抓住机会向著名学者请教，把原本模糊的判断压缩成更高质量的方向筛选：下次想 idea ×1.25。",
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
      outcome: "产业线的信息交换让实验更接地气；下次做实验分数 ×1.25。",
      resultDescription: "你把对话推进到具体的产业需求和工程约束上，这种信息回流会直接改变你下一轮实验的组织方式：下次做实验分数 ×1.25。",
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
