import { getConferenceActivityTravelSanRecovery, resolveConferenceActivityAttributes } from "./v2-conference-activity-shared";
import type {
  ConferenceActivityBuildState,
  ConferenceActivityContext,
  ConferenceActivityOptionDefinition,
} from "./v2-conference-activity-shared";

export function createBaseConferenceActivityOptions(
  context: ConferenceActivityContext,
  state: ConferenceActivityBuildState,
  getRoll: () => number = Math.random,
): ConferenceActivityOptionDefinition[] {
  const options: ConferenceActivityOptionDefinition[] = [
    {
      id: "tour-local",
      label: "顺便旅游",
      outcome: `SAN +${getConferenceActivityTravelSanRecovery(context.region)}。`,
      resultDescription: `你把电脑留在包里，沿着${context.city}的街道慢慢走了一圈。更新鲜的场景和没见过的事物接连从眼前经过，没有人问实验跑到哪一步，你也终于没再下意识刷新消息。`,
      effects: {
        san: getConferenceActivityTravelSanRecovery(context.region),
      },
    },
    {
      id: "tea-break",
      label: "茶歇交友",
      outcome: "社交 +1。",
      resultDescription: "茶歇时，你从一张海报聊起，和旁边的同学交换了研究方向。晚宴上再碰到，终于不用重做一遍自我介绍。你们聊起各自踩过的坑，散席前互相留了联系方式。",
      effects: {
        social: 1,
      },
    },
    {
      id: "experiment-discussion",
      label: "同行交流实验",
      outcome: "下次做实验 +3 次。",
      resultDescription: "你把拿不准的实验设置讲给几位同行听。对方问了句“这个对照做过吗”，你翻了翻记录，还真没有。议程背面很快记满三组新尝试，这趟回去，显卡又有得忙了。",
      effects: {
        temporaryActionEffectUpdates: {
          experiment: { extraActions: 3 },
        },
      },
    },
    {
      id: "idea-networking",
      label: "广泛交流idea",
      outcome: "下次想idea +3 次。",
      resultDescription: "你在几个会场间来回跑，笔记上画满箭头，连页边都没放过。整理时，几种看似不搭边的方法竟和自己的课题接上了。你赶紧补了几行字，免得明天只记得“当时觉得很有道理”。",
      effects: {
        temporaryActionEffectUpdates: {
          idea: { extraActions: 3 },
        },
      },
    },
    {
      id: "famous-scholar",
      label: "与著名学者交流",
      outcome: "下次想idea ×1.25。",
      resultDescription: "排队时，你把问题在心里练了两遍。轮到你，对方听完反问一句“你究竟想验证什么”，倒把你问住了。回去看笔记，方法画了半页，问题只有一行，确实该先把这一行想清楚。",
      effects: {
        temporaryActionEffectUpdates: {
          idea: { multiplier: 1.25 },
        },
      },
    },
  ];
  return options.map((option) => resolveConferenceActivityAttributes(option, state, getRoll));
}
