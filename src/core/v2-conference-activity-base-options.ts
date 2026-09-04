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
      outcome: "SAN +6。",
      resultDescription: `你只听了最相关的几场报告，下午沿着 ${context.city} 的街道慢慢走了一圈。暂时不用盯实验和投稿，脑子也跟着松了下来。`,
      effects: {
        san: 6,
      },
    },
    {
      id: "tea-break",
      label: "☕ 茶歇与晚宴交流",
      outcome: "SAN +1，社交 +1。",
      resultDescription: "茶歇时，你和邻座聊起彼此的研究，又在晚宴上碰到几位同方向的学生。离场前，你们互相留下联系方式，约好以后交换论文和代码。",
      effects: {
        san: 1,
        social: 1,
      },
    },
    {
      id: "experiment-discussion",
      label: "🔬 和同行深聊实验思路",
      outcome: "下次做实验多 3 次。",
      resultDescription: "你把卡住的实验设置拿给几位同行看，对方很快指出一个可能混淆结果的变量。你在议程背面记下三组新对照，回去就能直接开跑。",
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
      resultDescription: "你在几个会场之间来回听报告，把不同方向的方法记在同一页纸上。回头整理时，几条原本无关的线索刚好能接到自己的问题上。",
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
      resultDescription: "你和一位同学从海报聊到实验细节，发现双方的数据和方法刚好能互补。你们当场建了共享文档，约好回去后先跑一轮小实验。",
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
      resultDescription: "报告结束后，你追上主讲人，简短说明了自己的问题和现有结果。对方没有直接给答案，只提醒你重新检查问题定义；这一句正好点中了卡住的地方。",
      effects: {
        temporaryActionEffectUpdates: {
          idea: { multiplier: 1.25 },
        },
      },
    },
    {
      id: "enterprise-networking",
      label: "🏢 与企业代表深入交流",
      outcome: "下次做实验 ×1.25。",
      resultDescription: "你在企业展台聊了几组真实业务里的失败案例，发现常用数据集忽略了不少边界情况。回去以后，下一轮实验该补哪些场景已经清楚多了。",
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
