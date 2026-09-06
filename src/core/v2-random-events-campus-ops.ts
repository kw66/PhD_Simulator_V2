import { applyTierResist, formatTierResistedOutcome, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import {
  createThreeStageRandomEvent,
  formatProbabilityCondition,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createOpsCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const reinstallSanChange = getActualSanChange(-3, state.month, state.eventSupport);
  const taobaoFailureSanChange = getActualSanChange(-2, state.month, state.eventSupport);
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
    description: "实验室服务器突然离线，几张显卡接连报错，排队的任务全停在原地。机器暂时用不了，这次得由你来处理。",
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
      "凌晨跑到一半的实验突然中断。你查了服务器日志，显卡反复报错，组里排队的任务全被卡住了。",
      "是驱动出了问题，还是硬件故障？后台还有几项说不清来路的占用。大家都等着恢复实验，这次得有人出面处理。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "找导师最稳，但坏掉的显卡未必能马上换新。",
      "上报异常占用可以查清有没有人在挖矿，但也可能得罪同门。",
      "自己重装要花精力，淘宝找人则要花钱。两种办法都可能没修好，反而添了新的麻烦。",
    ].join("\n\n"),
    results: {
      [`random-13-advisor-${serial}`]: {
        title: "找导师",
        description: [
          "你把显卡报错发给导师，导师安排同门到机房逐张排查。",
          "坏卡被停用后，服务器总算重新上线，但可用算力少了一截。",
          "以后跑实验只能排更久的队。",
        ].join("\n\n"),
      },
      [`random-13-report-${serial}`]: {
        title: "举报挖矿",
        description: [
          "你把后台的异常占用和显卡报错整理后直接上报，导师当即安排人排查。",
          "有人长期占着显卡挖矿的事情被查了出来，故障显卡也被送去检修。",
          "但很快有人知道是你举报的，实验室里的气氛有些尴尬。",
          ...(reportSocialNarrative ? [reportSocialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-13-reinstall-${serial}`]: {
        title: "自己重装",
        description: reinstallSuccess
          ? [
              "你关掉服务器，重新插拔显卡，又把驱动和 CUDA 环境从头装了一遍。",
              "折腾到深夜后，系统终于重新识别出所有显卡，实验也能正常启动了。",
              "服务器修好了，你也累得只想回去睡觉。",
            ].join("\n\n")
          : [
              "你重装了驱动和 CUDA 环境，显卡却依然反复掉线。",
              "公共环境还被你改乱了，同门的任务一时也跑不起来，现场气氛瞬间降到冰点。",
              "早知道会这样，你宁愿一开始就找专业人员来修。",
              ...(reinstallSocialNarrative ? [reinstallSocialNarrative] : []),
            ].join("\n\n"),
      },
      [`random-13-taobao-${serial}`]: {
        title: taobaoSuccess ? "淘宝维修" : "淘宝翻车",
        description: taobaoSuccess
          ? [
              "你在淘宝找到一名口碑不错的维修工程师，对方到机房逐项检查。",
              "重新插拔显卡并处理供电故障后，服务器终于恢复正常。",
              "钱花得不冤，机器当天就重新上线了。",
            ].join("\n\n")
          : [
              "你找来的维修报价很低，实际却只是反复拆装、试错。折腾几天仍没找准故障，对方还追加了费用。",
              "最后只好请组里重新安排检修。你为这次失败的维修花了冤枉钱，也没少操心。",
            ].join("\n\n"),
      },
    },
  });
}

