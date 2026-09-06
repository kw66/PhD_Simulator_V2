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
      resultDescription: `你把电脑留在包里，沿着 ${context.city} 的街道慢慢走了一圈。路口停下来看看招牌，累了就找地方坐会儿。没有人问实验跑到哪一步，你也终于没再下意识刷新消息。`,
      effects: {
        san: 6,
      },
    },
    {
      id: "tea-break",
      label: "☕ 茶歇与晚宴交流",
      outcome: "SAN +1，社交 +1。",
      resultDescription: "茶歇时，你从一张海报聊起，和旁边的同学交换了研究方向。晚宴上再碰到，终于不用重做一遍自我介绍。你们聊起各自踩过的坑，散席前互相留了联系方式。",
      effects: {
        san: 1,
        social: 1,
      },
    },
    {
      id: "experiment-discussion",
      label: "🔬 和同行深聊实验思路",
      outcome: "下次做实验多 3 次。",
      resultDescription: "你把拿不准的实验设置讲给几位同行听，对方追问了数据处理的细节，提醒你漏掉的对照。你在议程背面记下三组新尝试，打算回去逐一验证，而不是继续盲目改参数。",
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
      resultDescription: "你在不同会场听报告，茶歇时又追着问了几个问题。记在纸上的方法越来越杂，但整理时，你发现其中几种正好能用来重新想自己的课题，不算白走这些路。",
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
      resultDescription: "你和一位同学在海报前核对实验设置，发现彼此都被相似的问题卡过。对方分享了排查的办法，你们约好回去各试一试，再交换结果；至少这次不用独自对着报错猜。",
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
      resultDescription: "轮到提问时，你尽量把自己的问题压成几句话。对方反问你究竟想验证什么，你一时答得磕绊，却也发现自己此前把问题想得太绕。你赶紧记下这句追问，准备换个角度再想想。",
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
      resultDescription: "你在企业展台问起一项实际应用，对方没只讲效果好的部分，也谈了数据变化后失效的情况。你对照自己的实验记下几处盲点，下一轮终于不只是盯着平均分看。",
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
