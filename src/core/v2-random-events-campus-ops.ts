import { applyTierResist, formatTierResistedOutcome, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import {
  createThreeStageRandomEvent,
  formatProbabilityCondition,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createOpsCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const reinstallSanChange = getActualSanChange(-3, state.month, state.eventSupport, state.buffs);
  const taobaoFailureSanChange = getActualSanChange(-2, state.month, state.eventSupport, state.buffs);
  const reinstallSuccess = getRoll() < 0.5;
  const taobaoSuccess = getRoll() < 0.5;
  const reportSocialResult = applyTierResist(-2, state.player.social, getRoll);
  const reportSocialChange = reportSocialResult.effectiveChange;
  const reportSocialNarrative = getTierResistedNarrative("社交", -2, reportSocialResult);
  const reinstallSocialResult = applyTierResist(-1, state.player.social, getRoll);
  const reinstallSocialChange = reinstallSocialResult.effectiveChange;
  const reinstallSocialNarrative = getTierResistedNarrative("社交", -1, reinstallSocialResult);

  const event: PendingEvent = {
    id: `random-13-y${state.year}-m${state.month}-n${serial}`,
    title: "显卡故障",
    description: "实验室服务器突然离线，几张显卡接连报错。组群里的“你们还能连上吗”一条接一条，排队的任务全停在原地。",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-13",
    stage: "act1",
    choices: [
      {
        id: `random-13-advisor-${serial}`,
        label: "催导师修",
        outcome: "永久实验 -2。",
        effects: {
          experimentBonus: -2,
        },
      },
      {
        id: `random-13-report-${serial}`,
        label: "举报挖矿",
        outcome: formatTierResistedOutcome("社交", -2, reportSocialResult),
        effects: reportSocialChange < 0 ? { social: reportSocialChange } : {},
      },
      {
        id: `random-13-reinstall-${serial}`,
        label: "自己重装",
        outcome: reinstallSuccess
          ? `${formatProbabilityCondition("重装成功", 0.5)}｜SAN ${reinstallSanChange}。`
          : `${formatProbabilityCondition("重装失败", 0.5)}｜SAN ${reinstallSanChange}｜${formatTierResistedOutcome("社交", -1, reinstallSocialResult)}｜下次实验 ×0.25`,
        effects: reinstallSuccess
          ? { san: reinstallSanChange }
          : {
            san: reinstallSanChange,
            ...(reinstallSocialChange < 0 ? { social: reinstallSocialChange } : {}),
            temporaryActionEffectUpdates: {
              experiment: { multiplier: 0.25 },
            },
          },
      },
      {
        id: `random-13-taobao-${serial}`,
        label: "淘宝找人",
        outcome: taobaoSuccess
          ? `${formatProbabilityCondition("维修成功", 0.5)}｜金币 -2。`
          : `${formatProbabilityCondition("维修翻车", 0.5)}｜金币 -4｜SAN ${taobaoFailureSanChange}。`,
        effects: taobaoSuccess
          ? { money: -2 }
          : { money: -4, san: taobaoFailureSanChange },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "凌晨跑到一半的实验突然中断，日志里显卡反复报错。组群里的“你们还能连上吗”一条接一条，排队的任务全卡住了。",
      "掉线前还有几项来路不明的占用。机箱风扇照常转着，同门凑过来看日志，等你说说情况。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "报错截图可以发给导师安排检修。不过坏卡未必能换新，往后可能得挤着剩下的算力跑。",
      "上报异常占用能查清有没有人在挖矿。只是查到组里人，之后还要天天在实验室碰面。",
      "自己重装得花精力，弄坏公共环境还要向同门解释。淘宝能找到维修，可低报价未必是最后付的钱。",
    ].join("\n\n"),
    results: {
      [`random-13-advisor-${serial}`]: {
        title: "找导师",
        description: [
          "你把报错截图发给导师，导师安排同门逐张排查。坏卡被停用，剩下的卡总算能接着跑任务。",
          "空出的卡位没补上。你把原本打算并行跑的实验拆开，以后都得按这点算力安排了。",
        ].join("\n\n"),
      },
      [`random-13-report-${serial}`]: {
        title: "举报挖矿",
        description: [
          "你把异常进程和显卡报错一并上报，查出有人长期占着显卡挖矿，故障卡随后送去检修。",
          "举报的事很快传开。你回工位拿水杯，旁边聊这件事的人停了话头；你接完水坐下，打开还没看完的日志。",
          ...(reportSocialNarrative ? [reportSocialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-13-reinstall-${serial}`]: {
        title: "自己重装",
        description: reinstallSuccess
          ? [
              "你关机重新插拔显卡，重装驱动和 CUDA。核对完版本，测试程序终于认出了所有显卡。",
              "熬到深夜，实验总算启动。你在组群里发了句“可以用了”，收好东西，才想起回宿舍还得爬楼。",
            ].join("\n\n")
          : [
              "重装后显卡仍在掉线，公共环境又多了版本冲突。同门发来报错，你只能先回一句“我再看看”。",
              "折腾半天，日志反而更长了。接下来那轮实验得先补环境、查依赖，能正式跑数据的时间没剩多少。",
              ...(reinstallSocialNarrative ? [reinstallSocialNarrative] : []),
            ].join("\n\n"),
      },
      [`random-13-taobao-${serial}`]: {
        title: taobaoSuccess ? "淘宝维修" : "淘宝翻车",
        description: taobaoSuccess
          ? [
              "你在机房门口接到淘宝约的工程师。对方逐项检查，重新插好显卡，处理了供电故障。",
              "机器当天恢复。测试跑过一轮，你付清维修费，还了机房钥匙；总算不用反复刷新远程连接了。",
            ].join("\n\n")
          : [
              "报价便宜，来人却只会反复拆装试错。折腾几天没找准故障，聊天框里倒先发来了追加费用。",
              "你争了半天，还是多付了钱，只好请组里重新安排检修。回到工位，远程连接依旧报错，维修聊天还挂在旁边。",
            ].join("\n\n"),
      },
    },
  });
}

