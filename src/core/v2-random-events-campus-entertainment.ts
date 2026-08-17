import { getActualSanChange } from "./v2-sanity-rules";
import { getControllerBonus } from "./v2-random-events-campus-shared";
import { createThreeStageRandomEvent } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createEntertainmentCampusRandomEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  const controllerBonus = getControllerBonus(state);
  const terrariaCount = state.eventCounters.terrariaCount + 1;
  const magicTowerCount = state.eventCounters.magicTowerCount + 1;
  const gradSimCount = state.eventCounters.gradSimCount + 1;

  const event: PendingEvent = {
    id: `random-15-y${state.year}-m${state.month}-n${serial}`,
    title: "游戏放松",
    description: "实验连续几轮都没有起色，你盯着终端也想不出下一步。今晚先不和结果较劲了，挑个游戏放松一会儿。",
    preview: "学了一天，想放松一下...",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-15",
    stage: "act1",
    choices: [
      {
        id: `random-15-terraria-${serial}`,
        label: "玩泰拉瑞亚",
        outcome: `社交 +1，SAN ${getActualSanChange(-(4 - controllerBonus), state.month, state.eventSupport)}。`,
        effects: {
          social: 1,
          san: getActualSanChange(-(4 - controllerBonus), state.month, state.eventSupport),
          counterDeltas: { gamePlayCount: 1, terrariaCount: 1 },
          achievementFlags: terrariaCount >= 3 ? ["terraria300"] : [],
        },
      },
      {
        id: `random-15-magic-tower-${serial}`,
        label: "玩魔塔50层",
        outcome: `科研 +1，SAN ${getActualSanChange(-(6 - controllerBonus), state.month, state.eventSupport)}。`,
        effects: {
          research: 1,
          san: getActualSanChange(-(6 - controllerBonus), state.month, state.eventSupport),
          counterDeltas: { gamePlayCount: 1, magicTowerCount: 1 },
          achievementFlags: magicTowerCount >= 3 ? ["magicTowerMaster"] : [],
        },
      },
      {
        id: `random-15-grad-sim-${serial}`,
        label: "玩研究生模拟器",
        outcome: "SAN +2。",
        effects: {
          san: 2,
          counterDeltas: { gamePlayCount: 1, gradSimCount: 1 },
          achievementFlags: gradSimCount >= 3 ? ["thankYouPlaying"] : [],
        },
      },
      {
        id: `random-15-kings-${serial}`,
        label: "打王者荣耀",
        outcome: `金钱 +2，SAN ${getActualSanChange(-(5 - controllerBonus), state.month, state.eventSupport)}。`,
        effects: {
          money: 2,
          san: getActualSanChange(-(5 - controllerBonus), state.month, state.eventSupport),
          counterDeltas: { gamePlayCount: 1 },
        },
      },
    ],
  };

  const controllerHint = state.eventSupport.hasGameController
    ? `你的手柄会使这些游戏选择的 SAN 消耗减少 ${controllerBonus}。`
    : "";

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "一天高强度学习和科研结束后，你明显有些疲惫。",
      "你决定留一点时间给娱乐，给自己做一次情绪释放。",
      "宿舍灯光偏暖，电脑风扇轻响，你终于把注意力从“必须产出”切到“先恢复状态”。",
      "不同游戏会把你带向不同后果。",
    ].join("\n\n"),
    decisionTitle: "选择游戏",
    decisionDescription: [
      "“联机是最解压的社交补给，但也最容易失控到深夜。”",
      "“解谜闯关更像脑力训练，情绪释放慢，但可能带来思维收益。”",
      "“轻量小游戏恢复快，适合把状态拉回安全线。”",
      "“竞技代练能换零花钱，同时会把精力消耗拉高。”",
      ...(controllerHint ? [controllerHint] : []),
      "你要选的是今晚的主要目标：纯放松、练脑子、快速回血，还是冒着更高精神消耗换即时收益。",
    ].join("\n\n"),
    results: {
      [`random-15-terraria-${serial}`]: {
        title: "结果",
        description: [
          "🌲 你拉上同学开了联机档，语音频道从“开荒分工”很快变成“全员指挥”。",
          "有人挖矿、有人做药、有人卡点拉怪，节奏乱却热闹，像一次不需要汇报的团队协作。",
          "等你们推完关键 Boss，窗外已经很安静了。虽然熬夜，但那种并肩作战的轻松感真实地回来了。",
        ].join("\n\n"),
      },
      [`random-15-magic-tower-${serial}`]: {
        title: "结果",
        description: [
          "🗼 你点开魔塔 50 层，熟悉的数值表瞬间把人拉进“决策模式”。",
          "每一步都要算血线、钥匙和收益，像在做一套缩小版的实验设计题。",
          "当你最终压线击败骑士队长时，那种“推理闭环成立”的爽感和科研突破很像。",
        ].join("\n\n"),
      },
      [`random-15-grad-sim-${serial}`]: {
        title: "结果",
        description: [
          "🎓 你点开“研究生模拟器”，几分钟后就被各种熟悉桥段逗笑了。",
          "赶 deadline、等结果、和导师沟通，这些日常被做成游戏后反而没那么压人。",
          "你在“被还原”的荒诞感里放松下来，精神状态也回到了可继续工作的区间。",
          "（感谢你玩这个游戏！）",
        ].join("\n\n"),
      },
      [`random-15-kings-${serial}`]: {
        title: "结果",
        description: [
          "👑 你开了几局排位，顺手接了代练单，状态一上来就停不下来。",
          "从对线到团战都在高强度专注里，赢一局的快感很直接，但脑力消耗也同样直接。",
          "结算界面的到账提示跳出来时，你一边揉眼睛一边想：这算是“以操作换生活费”。",
        ].join("\n\n"),
      },
    },
  });
}
