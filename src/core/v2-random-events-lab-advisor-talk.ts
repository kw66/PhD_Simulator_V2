import { getActualSanChange } from "./v2-sanity-rules";
import { createThreeStageRandomEvent } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorTalkRandomEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isHighResearch = state.player.research >= 6;
  const isHighFavor = state.player.favor >= 6;
  const internshipSanChange = getActualSanChange(-6, state.month, state.eventSupport);

  const event: PendingEvent = {
    id: `random-5-y${state.year}-m${state.month}-n${serial}`,
    title: "导师约谈",
    description: "导师突然发来一句“来我办公室一趟”，没说是什么事。一路上，你把最近的进度和失误都想了一遍。",
    preview: "导师找你谈话",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-5",
    stage: "act1",
    choices: [
      {
        id: `random-5-report-${serial}`,
        label: "认真汇报",
        outcome: isHighResearch ? "下次想 idea +5。" : "导师好感 -1。",
        effects: isHighResearch
          ? {
            temporaryActionEffectUpdates: {
              idea: { bonus: 5 },
            },
          }
          : {
            favor: -1,
          },
      },
      {
        id: `random-5-ask-${serial}`,
        label: "请教推进方法",
        outcome: isHighFavor ? "科研 +1。" : "导师好感 -1。",
        effects: isHighFavor ? { research: 1 } : { favor: -1 },
      },
      {
        id: `random-5-intern-${serial}`,
        label: "提出去实习",
        outcome: isHighFavor ? `SAN ${internshipSanChange}，金钱 +5，下次实验 +5。` : "导师好感 -1。",
        effects: isHighFavor
          ? {
            san: internshipSanChange,
            money: 5,
            temporaryActionEffectUpdates: {
              experiment: { bonus: 5 },
            },
          }
          : {
            favor: -1,
          },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师叫你去办公室单独谈话。",
      "你不确定是例行沟通，还是要问责近期进度。",
      "走到门口时，你已经在脑内把最近几周的实验和论文节点快速过了一遍。",
      "这次对话可能影响后续资源和信任，甚至决定你接下来能不能拿到关键支持。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“如实汇报最体面，但也意味着把短板和拖延都摊在桌面上。”",
      "“请教方法像一次试探：关系到位是点拨，关系不到位是碰壁。”",
      "“提实习是在争取个人路径，也是在挑战导师对你当前优先级的判断。”你要决定今天是优先保关系、保成长，还是主动争取个人节奏。",
    ].join("\n\n"),
    results: {
      [`random-5-report-${serial}`]: {
        title: "汇报进展",
        description: isHighResearch
          ? [
              "你打开PPT，详细汇报了最近的研究进展。",
              "导师听得很认真，不时点头，还提出了几个很有价值的建议。",
              "“不错，思路很清晰。”导师说，“顺着这个方向继续深入，应该能出成果。”",
              "你感觉收获很大，对下一步的研究方向更加明确了。",
            ].join("\n\n")
          : [
              "你支支吾吾地汇报了一下最近的“进展”。",
              "导师越听眉头皱得越紧：“就这些？你这段时间都在干什么？”",
              "你被问得哑口无言，只能低头认错。",
              "“回去好好反思一下。”导师叹了口气。",
            ].join("\n\n"),
      },
      [`random-5-ask-${serial}`]: {
        title: "当面请教",
        description: isHighFavor
          ? [
              "“导师，我最近在研究方法上遇到了一些困惑，想请教您。”",
              "导师放下手中的工作，认真地听你描述问题，然后耐心地给你讲解。",
              "“做科研要有自己的方法论，不能只是埋头苦干……”导师传授了不少经验。",
              "你感觉茅塞顿开，科研能力有了明显提升。",
            ].join("\n\n")
          : [
              "“导师，我想请教一下科研方法……”",
              "导师抬头看了你一眼：“这些基础的东西自己去看文献，我很忙。”",
              "你讪讪地退出办公室，感觉导师对你有些不耐烦。",
            ].join("\n\n"),
      },
      [`random-5-intern-${serial}`]: {
        title: isHighFavor ? "安排实习" : "谈话结束",
        description: isHighFavor
          ? [
              "“导师，我想利用假期去企业实习一段时间，积累一些实践经验。”",
              "导师想了想：“可以，但是科研不能落下，实习期间也要保持进度。”",
              "你连忙点头答应。虽然会很累，但能赚点钱还能学到东西，值了！",
              "实习期间你白天上班，晚上还要抽空做实验，累得够呛，但收获也不少。",
            ].join("\n\n")
          : [
              "“导师，我想去企业实习一段时间……”",
              "话还没说完，导师就打断了你：“实习？你论文写完了吗？实验做完了吗？”",
              "你被问得哑口无言。",
              "“先把手头的事情做好再说别的。”导师的语气明显不悦。",
            ].join("\n\n"),
      },
    },
  });
}
