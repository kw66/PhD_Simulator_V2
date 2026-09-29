import { applyTierResist, formatTierResistedOutcome, formatActualSanChange, getActualSanChange } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { createThreeStageRandomEvent, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createEntertainmentCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const terrariaSanChange = getActualSanChange(-4, state.month, state.eventSupport, state.buffs);
  const magicTowerSanChange = getActualSanChange(-6, state.month, state.eventSupport, state.buffs);
  const rocoSanChange = getActualSanChange(-5, state.month, state.eventSupport, state.buffs);
  const playsV2 = getRoll() >= 0.5;
  const catchesShinyWolf = getRoll() < 0.5;
  const gradSimSanGain = playsV2 ? 3 : 2;
  const rocoMoneyGain = catchesShinyWolf ? 4 : 2;
  const socialResult = applyTierResist(1, state.player.social, getRoll);
  const researchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const introDescription = [
    "改完最后一处代码，你把几组实验在服务器上排好队，检查日志没报错，才往椅背上一靠。结果还得等上好几个小时，盯着终端也不会让显卡跑得更快。",
    "你把终端缩到一旁，翻了翻电脑和手机里的游戏。趁实验慢慢跑，自己也该放松一下了。",
  ].join("\n\n");

  const event: PendingEvent = {
    id: `random-15-y${state.year}-m${state.month}-n${serial}`,
    title: "游戏放松",
    description: introDescription,
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
        outcome: `条件：游玩 ${playsV2 ? "v2" : "v1"}（50%）｜结果：SAN +${gradSimSanGain}。`,
        effects: {
          san: gradSimSanGain,
        },
      },
      {
        id: `random-15-kings-${serial}`,
        label: "玩洛克王国世界",
        outcome: `条件：${catchesShinyWolf ? "抓到异色" : "未抓到异色"}（50%）｜结果：${formatActualSanChange(-5, state.month, state.eventSupport, state.buffs)}，金币 +${rocoMoneyGain}。`,
        effects: {
          money: rocoMoneyGain,
          san: rocoSanChange,
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription,
    decisionTitle: "选择游戏",
    decisionDescription: [
      "泰拉瑞亚可以喊同学联机，不过你们说的“再打一只 Boss”，向来不止一只。魔塔的存档还卡在十楼，那几把钥匙究竟该怎么省，你一直没算明白。",
      "研究生模拟器也出了新版：白天读研，晚上还读研，多少有点不服输。手机里的洛克王国世界倒是有另一种玩法，帮人抓恶魔狼挣点零花钱，要是遇上稀罕的异色，说不定还能多赚些。",
    ].join("\n\n"),
    results: {
      [`random-15-terraria-${serial}`]: {
        title: "联机结束",
        description: [
          "🌲 你喊上同学联机，搭好平台准备打骷髅王。语音里有人问：“三百颗够吗？”话音刚落，一群人就被追得满地图跑，你边报位置边笑，走位比白天调参还乱。",
          "捡回掉落、补点物资、再试一次，说好的打一只就睡，硬是联机打了个通宵。窗外天都亮了，你们还在互相翻旧账。服务器跑出了结果，你自己倒是快没电了。",
        ].join("\n\n"),
      },
      [`random-15-magic-tower-${serial}`]: {
        title: "十楼的埋伏",
        description: [
          "🗼 你打开魔塔 50 层，刚踏进十楼就中了骷髅队长的埋伏。门一关，才发现这点攻击和血量根本不够。你盯着失败画面不服气：前面到底多开了哪扇门？",
          "你一遍遍读档，算伤害、改路线，连少挨一下打都要在纸上验算。实验参数旁密密麻麻添了半页数字，眼睛也熬酸了。本来想歇歇脑子，最后只是换了个课题。",
        ].join("\n\n"),
      },
      [`random-15-grad-sim-${serial}`]: {
        title: playsV2 ? "新版再读研" : "旧版再读研",
        description: (playsV2 ? [
          "🎓 你点开研究生模拟器 v2，原本只想看看新版改了什么，结果给游戏里的自己排起了科研和项目。明明刚把实验排完队，怎么又开始安排工作了？",
          "嘴上这么说，你还是觉得新版更好玩，一边玩一边笑出了声。这次进度不顺，关掉网页就能下班。想到这里，白天积下的烦闷也散了不少。",
        ] : [
          "🎓 你翻出研究生模拟器 v1，熟悉的界面一下把你拉了进去。轮到游戏里的自己见导师，你居然先坐直了，反应过来才笑出声。",
          "白天读研，晚上还读研，好在这回不用真抱着电脑去解释进度。玩完一局，你往椅背上一靠，绷着的肩膀总算松了下来。",
        ]).join("\n\n"),
      },
      [`random-15-kings-${serial}`]: {
        title: catchesShinyWolf ? "异色到手" : "抓狼收工",
        description: (catchesShinyWolf ? [
          "🐺 你打开洛克王国世界手游，帮人抓恶魔狼，跑了半晚上才等到异色。黑白炫彩的恶魔狼到手时，你赶紧截了张图，困意都被惊喜赶跑了一半。",
          "这只稀罕配色卖了个好价钱，报酬比平时多了一笔。你揉着发酸的手指放下手机：服务器还在跑，你倒先靠抓狼挣上了钱。只是这半晚上的精神头，也一并交代进去了。",
        ] : [
          "🐺 你打开洛克王国世界手游，接下帮人抓恶魔狼的活。绕了一圈又一圈，每次都凑近看颜色，盼着碰上黑白炫彩的异色，结果始终没等到。",
          "约好的恶魔狼倒是抓齐了，你交给对方，领了报酬便收工。手指和眼睛都累得够呛，原本想靠游戏放松，最后给自己又接了份活。",
        ]).join("\n\n"),
      },
    },
  });
}

