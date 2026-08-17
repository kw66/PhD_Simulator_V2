import { getActualSanChange } from "./v2-sanity-rules";
import { createThreeStageRandomEvent } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";
import type { RandomRollProvider } from "./v2-random-events-campus-shared";

export function createOpsCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const reinstallSanChange = getActualSanChange(-3, state.month, state.eventSupport);
  const taobaoFailureSanChange = getActualSanChange(-2, state.month, state.eventSupport);
  const reinstallSuccess = getRoll() < 0.5;
  const taobaoSuccess = getRoll() < 0.5;

  const event: PendingEvent = {
    id: `random-13-y${state.year}-m${state.month}-n${serial}`,
    title: "服务器宕机",
    description: "实验跑到一半，服务器突然失联，排队的任务全停在原地。群里没人能说清原因，这次得由你来处理。",
    preview: "服务器又出问题了",
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
        outcome: "社交 -2。",
        effects: {
          social: -2,
        },
      },
      {
        id: `random-13-reinstall-${serial}`,
        label: "自己重装",
        outcome: reinstallSuccess
          ? `SAN ${reinstallSanChange}。`
          : `SAN ${reinstallSanChange}，社交 -1，下次实验 x0.5。`,
        effects: reinstallSuccess
          ? { san: reinstallSanChange }
          : {
            san: reinstallSanChange,
            social: -1,
            temporaryActionEffectUpdates: {
              experiment: { multiplier: 0.5 },
            },
          },
      },
      {
        id: `random-13-taobao-${serial}`,
        label: "淘宝找人",
        outcome: taobaoSuccess
          ? "金钱 -2。"
          : `金钱 -4，SAN ${taobaoFailureSanChange}。`,
        effects: taobaoSuccess
          ? { money: -2 }
          : { money: -4, san: taobaoFailureSanChange },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "凌晨跑到一半的实验突然中断，终端只剩一行刺眼的报错。",
      "这台服务器已经不是第一次出问题，组里每个人都被它坑过。",
      "你翻了眼最近备份记录，发现真正可回滚的版本并不理想。",
      "你现在要决定：先把本轮任务救回来，还是趁机把隐患处理掉。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“找导师：响应快，但大概率只是临时重启。”",
      "“举报挖矿：可能治本，但会触发人际后坐力。”",
      "“自己重装：一把梭哈，成功和翻车大概五五开。”",
      "“淘宝找人：花钱换时间，质量同样看运气。”你要选的是“短期止血”还是“长期稳定”，以及你愿意承担的失败成本。",
    ].join("\n\n"),
    results: {
      [`random-13-advisor-${serial}`]: {
        title: "找导师",
        description: [
          "你把故障日志发给导师，导师安排同门远程重启了机器。",
          "服务器很快恢复，但你看得出来这只是“把今天撑过去”。",
          "底层问题没解决，后面每次开新实验都得留一手应急方案。",
        ].join("\n\n"),
      },
      [`random-13-report-${serial}`]: {
        title: "举报挖矿",
        description: [
          "你把后台异常和日志证据整理后直接上报，导师当场排查。",
          "问题源头被揪出来，服务器状态确实稳定了下来。",
          "但“是谁先捅出来的”也很快传开，你在人际面上背了成本。",
        ].join("\n\n"),
      },
      [`random-13-reinstall-${serial}`]: {
        title: "自己重装",
        description: reinstallSuccess
          ? [
              "你决定自己扛下重装：备份、装系统、补驱动、恢复环境，一路排雷到深夜。",
              "最终系统干净重启，性能甚至比之前更顺。",
              "这次是高压下的硬胜利，但体力和精神都被榨得很干。",
            ].join("\n\n")
          : [
              "你选择自己重装，但中途才发现关键目录备份不完整。",
              "不仅你自己的进度受损，同门也被波及，现场气氛瞬间降到冰点。",
              "你意识到“自己上”并不总是勇敢，有时只是高风险赌局。",
            ].join("\n\n"),
      },
      [`random-13-taobao-${serial}`]: {
        title: taobaoSuccess ? "淘宝维修" : "淘宝翻车",
        description: taobaoSuccess
          ? [
              "你在淘宝筛到一个口碑不错的工程师，远程接入后很快定位故障。",
              "对方把环境清理、权限和服务重启一口气做完，机器恢复正常。",
              "这次你花钱买到了真正的“省时省心”。",
            ].join("\n\n")
          : [
              "你找的远程维修看着便宜，实际全程低效反复试错。",
              "拖了几天才勉强恢复，还被追加了额外费用。",
              "你省下的预算没省下风险，反而把焦虑拉满了。",
            ].join("\n\n"),
      },
    },
  });
}
