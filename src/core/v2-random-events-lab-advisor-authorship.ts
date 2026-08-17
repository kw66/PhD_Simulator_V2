import { getActualSanChange } from "./v2-sanity-rules";
import { createThreeStageRandomEvent } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorAuthorshipRandomEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  const lowFavor = state.player.favor < 6;
  const isTeacherChild = state.selectedRoleId === "teacher-child";
  const argueSanChange = getActualSanChange(-2, state.month, state.eventSupport);

  const event: PendingEvent = {
    id: `random-12-y${state.year}-m${state.month}-n${serial}`,
    title: "署名风波",
    description: "论文定稿时，你发现自己的署名和原先说好的不一样。活干了不少，这口气很难咽下去，可把话挑明也要承担后果。",
    preview: "导师抢一作了",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-12",
    stage: "act1",
    choices: [
      {
        id: `random-12-complain-${serial}`,
        label: "向导师诉苦",
        outcome: lowFavor ? "下次想 idea -5。" : "导师愿意安抚你，这次没有额外代价。",
        effects: lowFavor
          ? {
            temporaryActionEffectUpdates: {
              idea: { bonus: -5 },
            },
          }
          : {},
      },
      {
        id: `random-12-transfer-${serial}`,
        label: "转移到别人",
        outcome: isTeacherChild ? "社交 -2，直接获得一篇已发表 C 类论文。" : "社交 -1。",
        effects: isTeacherChild
          ? {
            social: -2,
            score: 1,
            grantedPublication: {
              target: "C",
              acceptedScore: 15,
            },
          }
          : {
            social: -1,
          },
      },
      {
        id: `random-12-argue-${serial}`,
        label: "据理力争",
        outcome: lowFavor ? `SAN ${argueSanChange}。` : "你把话说开了，这次没有额外代价。",
        effects: lowFavor ? { san: argueSanChange } : {},
      },
      {
        id: `random-12-pressure-${serial}`,
        label: "极端施压",
        outcome: "金钱 +2，导师好感 -2。",
        effects: {
          money: 2,
          favor: -2,
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "投稿前最后一次过稿时，导师突然提出：“这篇我来挂一作吧。”",
      "你知道核心实验、写作和返修几乎都由你完成，这句话像一盆冷水直接浇下来。",
      "办公室里空气一下安静下来，你甚至能听见空调风声。",
      "你要处理的已经不只是署名，而是和导师关系、组内声誉、后续资源之间的连锁反应。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“诉苦：成功率看关系，但可能被认为情绪化。”",
      isTeacherChild
        ? "“转移目标：你的家庭背景可能带来额外成果，但组内关系会明显受损。”"
        : "“转移目标：能暂时守住自己，但会把代价推给同门。”",
      "“据理力争：边界最清晰，但会消耗关系资本。”",
      "“极端施压：短期最猛，长期信任代价最大。”你要在“当下自保”和“长期关系”之间做一次很难两全的取舍。",
    ].join("\n\n"),
    results: {
      [`random-12-complain-${serial}`]: {
        title: "向导师诉苦",
        description: !lowFavor
          ? [
              "你把过程和贡献讲得很克制，只在最后补了一句：“这篇我真的想守住一作。”",
              "导师沉默了一会儿，叹气说：“行，一作给你，我挂通讯。”",
              "这次你守住了结果，也看见关系尚有回旋空间。",
            ].join("\n\n")
          : [
              "你硬着头皮把情绪压住，还是把话说出口：“这篇一作我想保住。”",
              "导师皱眉后答应了，但语气明显冷下来：“以后这种事别反复说。”",
              "你守住了署名，却也感到后续指导会变得更稀薄。",
            ].join("\n\n"),
      },
      [`random-12-transfer-${serial}`]: {
        title: "转移目标",
        description: isTeacherChild
          ? [
              "你试探着把风险往外推：“那要不换别人的一作……”",
              "导师居然顺着你的建议操作，甚至额外给你塞来一篇成果。",
              "短期你赚到了最现实的收益，但组里看你的眼神一下就变了。",
            ].join("\n\n")
          : [
              "你把方案抛给导师：把压力转到别的同门身上。",
              "导师接受了这个提议，你的一作暂时安全。",
              "但消息很快传开，大家都知道这主意是谁先提的。",
            ].join("\n\n"),
      },
      [`random-12-argue-${serial}`]: {
        title: "据理力争",
        description: !lowFavor
          ? [
              "你把贡献清单一条条摆出来，语气平稳但立场非常明确。",
              "导师听完后点头：“可以，一作按规范给你。”",
              "这次是规则说服了权力，你也更确认了自己的边界。",
            ].join("\n\n")
          : [
              "你把核心贡献和署名规范摆到台面上，顶着压力把话说完整。",
              "导师脸色明显不好看，但最后还是让步：“行，一作给你。”",
              "你赢下了位置，却也为这次硬碰硬付出了精神代价。",
            ].join("\n\n"),
      },
      [`random-12-pressure-${serial}`]: {
        title: "极端施压",
        description: [
          "你把话说到了最激烈的位置，场面瞬间僵住。",
          "导师被迫后退，不再碰你的一作，还转来一笔“安抚费用”。",
          "表面你赢得很彻底，但这次冲突把信任关系直接拉到危险区。",
        ].join("\n\n"),
      },
    },
  });
}
