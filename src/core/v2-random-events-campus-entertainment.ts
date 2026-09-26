import { applyTierResist, formatTierResistedOutcome, formatActualSanChange, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { createThreeStageRandomEvent, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createEntertainmentCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const terrariaSanChange = getActualSanChange(-4, state.month, state.eventSupport, state.buffs);
  const magicTowerSanChange = getActualSanChange(-6, state.month, state.eventSupport, state.buffs);
  const kingsSanChange = getActualSanChange(-5, state.month, state.eventSupport, state.buffs);
  const socialResult = applyTierResist(1, state.player.social, getRoll);
  const researchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const socialNarrative = getTierResistedNarrative("社交", 1, socialResult);
  const researchNarrative = getTierResistedNarrative("科研", 1, researchResult);

  const event: PendingEvent = {
    id: `random-15-y${state.year}-m${state.month}-n${serial}`,
    title: "游戏放松",
    description: "回到宿舍，你把记着实验参数的本子合上，电脑右下角正好弹出组队邀请：“来不来？就差你了。”",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-15",
    stage: "act1",
    choices: [
      {
        id: `random-15-terraria-${serial}`,
        label: "玩泰拉瑞亚",
        outcome: `${formatTierResistedOutcome("社交", 1, socialResult)}，${formatActualSanChange(-4, state.month, state.eventSupport, state.buffs)}`,
        effects: {
          ...(socialResult.effectiveChange > 0 ? { social: socialResult.effectiveChange } : {}),
          san: terrariaSanChange,
        },
      },
      {
        id: `random-15-magic-tower-${serial}`,
        label: "玩魔塔50层",
        outcome: `${formatTierResistedOutcome("科研", 1, researchResult)}，${formatActualSanChange(-6, state.month, state.eventSupport, state.buffs)}`,
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
        outcome: `金币 +2，${formatActualSanChange(-5, state.month, state.eventSupport, state.buffs)}。`,
        effects: {
          money: 2,
          san: kingsSanChange,
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "回到宿舍，你合上记实验参数的本子。群里的朋友发来邀请：“来不来？就差你了。”",
      "游戏图标挨着终端快捷方式。你解开缠在鼠标上的耳机线，群里已经有人开始试麦。",
    ].join("\n\n"),
    decisionTitle: "选择游戏",
    decisionDescription: [
      "“泰拉瑞亚，房间开好了！”耳机里有人催你，接着保证只玩“一小会儿”⏱️。你看了眼时间，已经想起上次说这句话以后，大家又挖了多深的矿。桌面上还躺着没通关的魔塔，卡住的那层一直让你惦记。",
      "旁边的研究生模拟器倒让你笑了一下：白天刚从实验室回来，晚上还要再读一个研？手机又弹出一条王者代练单，有报酬，也有明确的段位要求。你把耳机戴正，今晚是陪朋友闹一阵、自己玩，还是再挣点零花钱，得先回个话了。",
    ].join("\n\n"),
    results: {
      [`random-15-terraria-${serial}`]: {
        title: "联机结束",
        description: [
          "🌲 你拉上同学联机。挖矿的迷了路，做药的赶来救人，你一边拉怪一边在语音里报位置。",
          "推完 Boss，大家还在追问是谁把门拆了。你笑着摘下耳机，宿舍走廊已没了动静，说好的“一小会儿”果然没算数。",
          ...(socialNarrative ? [socialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-15-magic-tower-${serial}`]: {
        title: "通关魔塔",
        description: [
          "🗼 你打开魔塔 50 层，为省一把钥匙反复算路线。刚合上的本子又被翻开，实验参数旁多了几行血量和伤害。",
          "剩一点血通关，你才算清之前哪一步多挨了打。揉揉发酸的眼睛，本来拿来放松的半个晚上，又花在了验算上。",
          ...(researchNarrative ? [researchNarrative] : []),
        ].join("\n\n"),
      },
      [`random-15-grad-sim-${serial}`]: {
        title: "游戏一局",
        description: [
          "🎓 你打开“研究生模拟器”。轮到游戏角色见导师，你居然先检查了一遍角色的状态，反应过来才笑出声😅。",
          "这回不用你抱着电脑去办公室解释进度。玩完一局，你往椅背上一靠，白天绷着的肩膀总算松了下来。",
          "（感谢你玩这个游戏！）",
        ].join("\n\n"),
      },
      [`random-15-kings-${serial}`]: {
        title: "排位结束",
        description: [
          "👑 接了代练单，你连打几局排位，连拧开水杯都要等回城那几秒。",
          "完成约定，报酬到账。你发完截图，放下手机揉揉眼睛：钱是挣到了，坐姿也跟白天守实验时差不多。",
        ].join("\n\n"),
      },
    },
  });
}

