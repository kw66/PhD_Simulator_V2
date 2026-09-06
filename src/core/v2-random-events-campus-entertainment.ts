import { applyTierResist, formatTierResistedOutcome, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { createThreeStageRandomEvent, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createEntertainmentCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const terrariaSanChange = getActualSanChange(-4, state.month, state.eventSupport);
  const magicTowerSanChange = getActualSanChange(-6, state.month, state.eventSupport);
  const kingsSanChange = getActualSanChange(-5, state.month, state.eventSupport);
  const socialResult = applyTierResist(1, state.player.social, getRoll);
  const researchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const socialNarrative = getTierResistedNarrative("社交", 1, socialResult);
  const researchNarrative = getTierResistedNarrative("科研", 1, researchResult);

  const event: PendingEvent = {
    id: `random-15-y${state.year}-m${state.month}-n${serial}`,
    title: "游戏放松",
    description: "实验连续几轮都没有起色，你盯着终端也想不出下一步。今晚先别和结果较劲，挑个游戏放松一会儿。",
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

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "忙完一天，你回到宿舍，只想先把实验和论文放到一边。",
      "电脑刚打开，群里的朋友就发来组队邀请。",
      "难得有一点自己的时间，你准备挑个游戏玩一会儿。",
    ].join("\n\n"),
    decisionTitle: "选择游戏",
    decisionDescription: [
      "联机最热闹，也最容易一不小心玩到深夜。",
      "魔塔要费点脑子，研究生模拟器则适合随手玩一会儿。",
      "打排位还能接点代练单，不过打完可能比开始时更累。",
    ].join("\n\n"),
    results: {
      [`random-15-terraria-${serial}`]: {
        title: "联机结束",
        description: [
          "🌲 你拉上同学开了联机档，语音频道从“开荒分工”很快变成“全员指挥”。",
          "有人挖矿、有人做药、有人卡点拉怪，分工一会儿就乱了，语音里却一直没停过笑声。",
          "等你们推完关键 Boss，窗外已经很安静了。今晚又睡晚了，但至少暂时没再想实验。",
          ...(socialNarrative ? [socialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-15-magic-tower-${serial}`]: {
        title: "通关魔塔",
        description: [
          "🗼 你打开魔塔 50 层，一路算血量、钥匙和路线。原本只想放松，结果又拿出纸笔，把几种走法挨个比较。",
          "终于通关时，你只剩一点血。路线倒是越算越清楚，人却盯着数值累了半宿——换了个游戏，还是没逃过算账。",
          ...(researchNarrative ? [researchNarrative] : []),
        ].join("\n\n"),
      },
      [`random-15-grad-sim-${serial}`]: {
        title: "游戏一局",
        description: [
          "🎓 你打开“研究生模拟器”，本想暂时逃开科研，却又在游戏里赶起了论文。看着角色碰上熟悉的麻烦，你没忍住笑了。",
          "同样是等结果、见导师，隔着屏幕看反而没那么压人。关掉游戏时，白天积下的烦躁散了不少。",
          "（感谢你玩这个游戏！）",
        ].join("\n\n"),
      },
      [`random-15-kings-${serial}`]: {
        title: "排位结束",
        description: [
          "👑 你接了一笔代练单，连打几局排位。从对线到团战都不敢分神，原本说好的放松又成了一场加班。",
          "完成约定后，报酬到账。你揉揉眼睛，放下手机：生活费多了一点，今晚也确实一点没闲着。",
        ].join("\n\n"),
      },
    },
  });
}

