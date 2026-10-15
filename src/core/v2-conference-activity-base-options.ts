import { gameRandom } from "./v2-game-random";
import { getConferenceActivityTravelSanRecovery, resolveConferenceActivityAttributes } from "./v2-conference-activity-shared";
import { canTriggerConferenceInternshipInvite, hasOngoingInternship } from "./v2-internship-system";
import type {
  ConferenceActivityBuildState,
  ConferenceActivityContext,
  ConferenceActivityOptionDefinition,
} from "./v2-conference-activity-shared";

export function createBaseConferenceActivityOptions(
  context: ConferenceActivityContext,
  state: ConferenceActivityBuildState,
  getRoll: () => number = gameRandom,
): ConferenceActivityOptionDefinition[] {
  const options: ConferenceActivityOptionDefinition[] = [
    {
      id: "tour-local",
      label: "顺便旅游",
      outcome: `SAN +${getConferenceActivityTravelSanRecovery(context.region)}。`,
      resultDescription: [
        `你把胸牌收进包里，沿着${context.city}的街道慢慢走。起初还在想刚才没答好的问题，后来被路边的小店和陌生招牌吸引，索性收起导航，🚶走到哪儿算哪儿。`,
        "坐下来歇脚时，你才发现已经很久没刷新过实验日志。照片里没有曲线和表格，只有今天见到的新鲜景色。 📷论文的问题还在，但回去以后再想，似乎也没那么令人烦躁了。",
      ].join("\n\n"),
      effects: {
        san: getConferenceActivityTravelSanRecovery(context.region),
      },
    },
    {
      id: "tea-break",
      label: "茶歇交友",
      outcome: "社交 +1。",
      resultDescription: [
        "你端着咖啡问旁边的人：“你们也做这个方向？”对方叹了口气，说刚被审稿人要求补一套实验。你顺势讲起自己的经历，几个人越聊越投入，☕咖啡凉了也没人注意。",
        "晚宴上再碰到，你已经敢招手叫对方过来坐。大家交换了联系方式，约好以后有问题可以互相问问。 🤝回到住处，你给新认识的人发了句“今天聊得很开心”，这次没有反复改上半天。",
      ].join("\n\n"),
      effects: {
        social: 1,
      },
    },
    {
      id: "experiment-discussion",
      label: "实验交流",
      outcome: "下次做实验 +3 次。",
      resultDescription: [
        "你打开那张始终对不上的结果表，请几位同行帮忙看看。有人问数据怎么划分，有人追问训练设置，最后一位指着表格说：“先别加模块，🔬把这个对照单独跑一遍呢？”",
        "你们在议程背面列出几组验证，把混在一起的问题拆开。回去的路上，你给每组实验写好名称和要观察的现象。 📝终于不用再凭感觉乱改参数，这趟回去，显卡又有得忙了。",
      ].join("\n\n"),
      effects: {
        temporaryActionEffectUpdates: {
          experiment: { extraActions: 3 },
        },
      },
    },
    {
      id: "idea-networking",
      label: "idea交流",
      outcome: "下次想idea +3 次。",
      resultDescription: [
        "你从一张海报问到另一张，听不同方向的人解释自己为什么这样做。有个看似不相关的方法，让你忽然想起课题里一直绕不过去的假设：💡“如果把这个前提换掉呢？”",
        "对方没急着说可不可行，反而和你一起列了几种情况。等你回到住处，笔记上已经多出几条能继续追的思路。 📝你赶紧写清每条的来由，免得明天只剩一句“当时觉得很有道理”。",
      ].join("\n\n"),
      effects: {
        temporaryActionEffectUpdates: {
          idea: { extraActions: 3 },
        },
      },
    },
    {
      id: "famous-scholar",
      label: "学者请教",
      outcome: "下次想idea ×1.25。",
      resultDescription: [
        "轮到你时，准备好的长篇介绍只说了一半，就被对方问住：“先不谈怎么做，你最想回答的问题是什么？” 🤔你停了一会儿，试着把那堆方法名拿掉，重新说了一遍。",
        "对方点点头，提醒你找一个能推翻自己想法的例子，再决定实验值不值得做。回去看笔记，原本画了半页的模块被你划掉几处。 ✏️方向没有凭空变简单，但下一步该想什么，终于清楚了一些。",
      ].join("\n\n"),
      effects: {
        temporaryActionEffectUpdates: {
          idea: { multiplier: 1.25 },
        },
      },
    },
    {
      id: "enterprise-networking",
      label: "企业交流",
      outcome: "下次做实验 ×1.25" + (canTriggerConferenceInternshipInvite({
        ...state,
        totalMonths: state.totalMonths ?? 0,
        papers: state.papers ?? [],
        externalPublications: state.externalPublications ?? [],
        internshipCount: state.internshipCount ?? 0,
      }, state.conferenceCareerState.enterpriseCount + 1) ? "；实习邀约。" : "。"),
      resultDescription: [
        state.conferenceCareerState.enterpriseCount === 0
          ? "你在企业展台看完演示，问起论文里的方法真正上线后会遇到什么问题。对方切到一页失败样例：光照、延迟和数据漂移，哪个都不会因为榜单分数好看就消失。📝你把这些容易忽略的限制记了下来。"
          : "有了此前逛企业展台的经验，你这次没有停留在产品介绍，直接问起评测数据和线上反馈。展台代表拿出一个失败案例，你顺着排查过程追问，🔬逐渐发现自己的实验里还缺了几组很有价值的对照。",
        canTriggerConferenceInternshipInvite({
          ...state,
          totalMonths: state.totalMonths ?? 0,
          papers: state.papers ?? [],
          externalPublications: state.externalPublications ?? [],
          internshipCount: state.internshipCount ?? 0,
        }, state.conferenceCareerState.enterpriseCount + 1)
          ? "聊完技术，对方又问起你的论文和项目经历，随后提到团队正在招实习生，可以再详细聊聊岗位。你留下联系方式，把刚才讨论的实验方案也记在旁边，📩等着会后的进一步消息。"
          : hasOngoingInternship({ internshipState: state.internshipState, totalMonths: state.totalMonths ?? 0 })
            ? "你也谈起自己已经安排的实习，把问题落到能实际验证的环节上。对方建议先缩小测试范围，再逐项排查误差来源。离开展台时，🛠️你已经整理出一套比盲目堆实验更有章法的尝试顺序。"
            : "对方建议先把失败样例分组，再挑最可能的原因做验证，不必一开始就把所有设置扫一遍。你对照自己的实验记录补了几行：回学校后，🔍先从这些最有把握查清的问题做起。",
      ].join("\n\n"),
      effects: {
        temporaryActionEffectUpdates: { experiment: { multiplier: 1.25 } },
        conferenceCareerUpdates: { enterpriseCount: state.conferenceCareerState.enterpriseCount + 1 },
        ...(canTriggerConferenceInternshipInvite({
          ...state,
          totalMonths: state.totalMonths ?? 0,
          papers: state.papers ?? [],
          externalPublications: state.externalPublications ?? [],
          internshipCount: state.internshipCount ?? 0,
        }, state.conferenceCareerState.enterpriseCount + 1) ? { triggerInternshipInvite: true } : {}),
      },
    },
  ];
  return options.map((option) => resolveConferenceActivityAttributes(option, state, getRoll));
}
