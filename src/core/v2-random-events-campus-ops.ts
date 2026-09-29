import { applyTierResist, formatTierResistedOutcome, formatActualSanChange, getActualSanChange } from "./v2-sanity-rules";
import { createLabGpuFailureBuff } from "./v2-lab-compute";
import {
  createThreeStageRandomEvent,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createOpsCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const reinstallSanChange = getActualSanChange(-3, state.month, state.eventSupport, state.buffs);
  const reinstallSuccess = getRoll() < 0.5;
  const taobaoSuccess = getRoll() < 0.5;
  const reportSocialResult = applyTierResist(-2, state.player.social, getRoll);
  const reportSocialChange = reportSocialResult.effectiveChange;
  const reinstallSocialResult = applyTierResist(-1, state.player.social, getRoll);
  const reinstallSocialChange = reinstallSocialResult.effectiveChange;
  const rentalOutcome = "持续6个月，实验金币 +1";
  const introDescription = [
    "昨晚排上的实验，到早上才挪了一点进度，日志里还冒出几串看不懂的报错。你对 Linux 也不太懂，盯着终端看了半天，分不清是驱动、环境，还是又碰上了什么奇怪的 bug。",
    "实验室的显卡本来就不多，不够用时只能租卡，做实验的金币就是这么花出去的。现在仅剩的几张卡也接连出了故障，大家只好租更多的卡顶着。你刷新了一下进度，感觉连报错都比实验跑得快。",
  ].join("\n\n");

  const event: PendingEvent = {
    id: `random-13-y${state.year}-m${state.month}-n${serial}`,
    title: "显卡故障",
    description: introDescription,
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-13",
    stage: "act1",
    choices: [
      {
        id: `random-13-advisor-${serial}`,
        label: "催导师修",
        outcome: `${rentalOutcome}。`,
        effects: {
          addBuffs: [createLabGpuFailureBuff()],
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
          ? `条件：重装成功（50%）｜结果：${formatActualSanChange(-3, state.month, state.eventSupport, state.buffs)}。`
          : `条件：重装失败（50%）｜结果：${formatActualSanChange(-3, state.month, state.eventSupport, state.buffs)}｜${formatTierResistedOutcome("社交", -1, reinstallSocialResult)}｜${rentalOutcome}。`,
        effects: reinstallSuccess
          ? { san: reinstallSanChange }
          : {
            san: reinstallSanChange,
            ...(reinstallSocialChange < 0 ? { social: reinstallSocialChange } : {}),
            addBuffs: [createLabGpuFailureBuff()],
          },
      },
      {
        id: `random-13-taobao-${serial}`,
        label: "淘宝找人",
        outcome: taobaoSuccess
          ? "条件：维修成功（50%）｜结果：金币 -2。"
          : `条件：维修翻车（50%）｜结果：${rentalOutcome}。`,
        effects: taobaoSuccess
          ? { money: -2 }
          : { addBuffs: [createLabGpuFailureBuff()] },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription,
    decisionTitle: "你的选择",
    decisionDescription: [
      "你截好报错，想起导师上次说的“我找人看看”，到现在还没下文。另一张截图上，没人在跑实验，显卡却一直满载，组里又传起了有人挖矿的说法。上报能请管理员查清楚，只是查到熟人头上，往后难免尴尬。",
      "你又打开重装教程和淘宝维修页。自己动手省钱，可服务器的盘里还放着大家的资料，看错一步就麻烦了。客服说可以远程修，修好收 2 金币，语气比你看得懂的教程还简短。",
    ].join("\n\n"),
    results: {
      [`random-13-advisor-${serial}`]: {
        title: "找导师",
        description: [
          "你把截图发给导师，收到一句“我联系一下”。隔几天再问，变成了“还在走流程”；再过一阵，老师开始问你论文跑得怎么样了。",
          "卡没修好，实验可不能跟着等。组里只好把更多任务搬到租来的机器上，这半年的租卡账单又厚了一点。你也学会了：老师说的“一下”，和程序里的时间单位不太一样。",
        ].join("\n\n"),
      },
      [`random-13-report-${serial}`]: {
        title: "举报挖矿",
        description: [
          "你把截图交给管理员，检查后果然揪出了一位拿公用显卡挖矿的同门。清掉挖矿进程、修复驱动后，实验终于恢复正常，风扇也不再像随时准备起飞。",
          "被收回账号的同门找来，问你怎么不先私下说一声。你看着自己停了几天的任务，一时也不知道怎么接。后来再找他问脚本，消息就没以前回得快了。",
        ].join("\n\n"),
      },
      [`random-13-reinstall-${serial}`]: {
        title: "自己重装",
        description: reinstallSuccess
          ? [
              "你照着教程一点点核对驱动和 CUDA 版本，遇到看不懂的命令就先查清楚再敲。折腾到深夜，测试程序终于认出了显卡，速度也恢复了。",
              "你在群里发了句“可以跑了”，同学们纷纷把任务重新排上队。你保存好这次的步骤，合上电脑才发现，脖子比服务器还需要检修。",
            ].join("\n\n")
          : [
              "你跟着教程重装，选盘时没看仔细，把同学存资料的硬盘也格式化了。系统倒是干净了，显卡却仍在报错，群里已经有人问自己的实验记录怎么没了。",
              "你挨个解释、道歉，越说声音越小。这下谁也不敢再让你试，机器只能等人来修。接下来半年，大家多租卡跑实验，租金涨了，你在群里说话也没那么有底气了。",
            ].join("\n\n"),
      },
      [`random-13-taobao-${serial}`]: {
        title: taobaoSuccess ? "淘宝维修" : "淘宝翻车",
        description: taobaoSuccess
          ? [
              "你给淘宝客服开好远程连接，看着对方在终端里检查驱动、重装依赖。那些你盯了半天的报错，被几行命令逐个处理掉了。",
              "测试速度恢复正常，你付了 2 金币维修费，顺手保存下处理步骤。原来服务器不一定需要换卡，有时只是需要一个比你更懂 Linux 的人。",
            ].join("\n\n")
          : [
              "远程连上后，客服来回换了几个驱动版本，报错从这一串变成了另一串。最后对方说情况太复杂，这单修不了，结束了远程连接。",
              "维修窗口关了，故障还在。你把任务迁到租来的机器上，组里其他人也陆续跟上。接下来半年只能多租卡顶着，原本想省下一点折腾，最后还是多了一笔租金。",
            ].join("\n\n"),
      },
    },
  });
}

