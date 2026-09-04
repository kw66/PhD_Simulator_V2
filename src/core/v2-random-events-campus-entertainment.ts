import { applyTierResist, formatTierResistedOutcome, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { getControllerBonus } from "./v2-random-events-campus-shared";
import { createThreeStageRandomEvent, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createEntertainmentCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const controllerBonus = getControllerBonus(state);
  const terrariaSanChange = getActualSanChange(-(4 - controllerBonus), state.month, state.eventSupport);
  const magicTowerSanChange = getActualSanChange(-(6 - controllerBonus), state.month, state.eventSupport);
  const kingsSanChange = getActualSanChange(-(5 - controllerBonus), state.month, state.eventSupport);
  const socialResult = applyTierResist(1, state.player.social, getRoll);
  const researchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const socialNarrative = getTierResistedNarrative("社交", 1, socialResult);
  const researchNarrative = getTierResistedNarrative("科研", 1, researchResult);
  const controllerNarrative = controllerBonus > 0 ? `你用上了手柄，操作顺手了不少，SAN 消耗少了 ${controllerBonus} 点。` : "";

  const event: PendingEvent = {
    id: `random-15-y${state.year}-m${state.month}-n${serial}`,
    title: "游戏放松",
    description: "实验连续几轮都没有起色，你盯着终端也想不出下一步。今晚先不和结果较劲了，挑个游戏放松一会儿。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-15",
    stage: "act1",
    choices: [
      {
        id: `random-15-terraria-${serial}`,
        label: "玩泰拉瑞亚",
        outcome: `${formatTierResistedOutcome("社交", 1, socialResult)}，SAN ${terrariaSanChange}`,
        effects: {
          ...(socialResult.effectiveChange > 0 ? { social: socialResult.effectiveChange } : {}),
          san: terrariaSanChange,
        },
      },
      {
        id: `random-15-magic-tower-${serial}`,
        label: "玩魔塔50层",
        outcome: `${formatTierResistedOutcome("科研", 1, researchResult)}，SAN ${magicTowerSanChange}`,
        effects: {
          ...(researchResult.effectiveChange > 0 ? { research: researchResult.effectiveChange } : {}),
          san: magicTowerSanChange,
        },
      },
      {
        id: `random-15-grad-sim-${serial}`,
        label: "玩研究生模拟器",
        outcome: "SAN +2。",
        effects: {
          san: 2,
        },
      },
      {
        id: `random-15-kings-${serial}`,
        label: "打王者荣耀",
        outcome: `金币 +2，SAN ${kingsSanChange}。`,
        effects: {
          money: 2,
          san: kingsSanChange,
        },
      },
    ],
  };

  const controllerHint = state.eventSupport.hasGameController
    ? `你的手柄会使这些游戏选择的 SAN 消耗减少 ${controllerBonus}。`
    : "";

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "忙完一天，你回到宿舍，只想先把实验和论文放到一边。",
      "电脑刚打开，群里的朋友就发来了组队邀请。",
      "难得有一点自己的时间，你准备挑个游戏玩一会儿。",
    ].join("\n\n"),
    decisionTitle: "选择游戏",
    decisionDescription: [
      "联机最热闹，也最容易玩到深夜。",
      "魔塔要费点脑子，研究生模拟器则适合随便玩一会儿。",
      "打排位还能接点代练单，不过玩完可能更累。",
      ...(controllerHint ? [controllerHint] : []),
    ].join("\n\n"),
    results: {
      [`random-15-terraria-${serial}`]: {
        title: "联机结束",
        description: [
          "🌲 你拉上同学开了联机档，语音频道从“开荒分工”很快变成“全员指挥”。",
          "有人挖矿、有人做药、有人卡点拉怪，分工一会儿就乱了，语音里却一直没停过笑声。",
          "等你们推完关键 Boss，窗外已经很安静了。今晚虽然又睡晚了，至少没有再想实验。",
          ...(controllerNarrative ? [controllerNarrative] : []),
          ...(socialNarrative ? [socialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-15-magic-tower-${serial}`]: {
        title: "通关魔塔",
        description: [
          "🗼 你点开魔塔 50 层，熟悉的数值表瞬间把人拉进“决策模式”。",
          "每一步都要算血线、钥匙和收益，像在做一套缩小版的实验设计题。",
          "最后只剩一点血时，你刚好算对钥匙和路线，压线打过骑士队长。盯了半晚上的数值总算没有白算。",
          ...(controllerNarrative ? [controllerNarrative] : []),
          ...(researchNarrative ? [researchNarrative] : []),
        ].join("\n\n"),
      },
      [`random-15-grad-sim-${serial}`]: {
        title: "游戏一局",
        description: [
          "🎓 你点开“研究生模拟器”，几分钟后就被各种熟悉桥段逗笑了。",
          "赶截止日期、等结果、和导师沟通，这些日常被做成游戏后反而没那么压人。",
          "看到角色又碰上和自己类似的麻烦，你笑了好几次。关掉游戏时，白天那点烦躁已经散了不少。",
          "（感谢你玩这个游戏！）",
        ].join("\n\n"),
      },
      [`random-15-kings-${serial}`]: {
        title: "排位结束",
        description: [
          "👑 你开了几局排位，顺手接了代练单，状态一上来就停不下来。",
          "从对线到团战都在高强度专注里，赢一局的快感很直接，但脑力消耗也同样直接。",
          "结算界面的到账提示跳出来时，你一边揉眼睛一边想：这算是“以操作换生活费”。",
          ...(controllerNarrative ? [controllerNarrative] : []),
        ].join("\n\n"),
      },
    },
  });
}

