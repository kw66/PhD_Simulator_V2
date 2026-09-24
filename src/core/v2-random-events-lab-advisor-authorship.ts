import { applyTierResist, formatTierResistedOutcome, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import { createThreeStageRandomEvent, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorAuthorshipRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const lowFavor = state.player.favor < 6;
  const argueSanChange = getActualSanChange(-2, state.month, state.eventSupport, state.buffs);
  const transferSocialResult = applyTierResist(-1, state.player.social, getRoll);
  const transferSocialChange = transferSocialResult.effectiveChange;
  const transferSocialNarrative = getTierResistedNarrative("社交", -1, transferSocialResult);
  const pressureFavorResult = applyTierResist(-2, state.player.favor, getRoll);
  const pressureFavorChange = pressureFavorResult.effectiveChange;
  const pressureFavorNarrative = getTierResistedNarrative("导师好感", -2, pressureFavorResult);

  const event: PendingEvent = {
    id: `random-12-y${state.year}-m${state.month}-n${serial}`,
    title: "署名风波",
    description: "导师发来一版署名安排，你的名字往后挪了一位。你翻出先前确认的分工，一作那一栏写的还是你。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-12",
    stage: "act1",
    choices: [
      {
        id: `random-12-complain-${serial}`,
        label: "向导师诉苦",
        outcome: lowFavor ? "导师好感 < 6｜下次想 idea -5。" : "导师好感 ≥ 6｜无变化。",
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
        outcome: formatTierResistedOutcome("社交", -1, transferSocialResult),
        effects: transferSocialChange < 0 ? { social: transferSocialChange } : {},
      },
      {
        id: `random-12-argue-${serial}`,
        label: "据理力争",
        outcome: lowFavor ? `导师好感 < 6｜SAN ${argueSanChange}。` : "导师好感 ≥ 6｜无变化。",
        effects: lowFavor ? { san: argueSanChange } : {},
      },
      {
        id: `random-12-pressure-${serial}`,
        label: "极端施压",
        outcome: `金币 +2，${formatTierResistedOutcome("导师好感", -2, pressureFavorResult)}`,
        effects: {
          money: 2,
          ...(pressureFavorChange < 0 ? { favor: pressureFavorChange } : {}),
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师发来一版署名安排。你把名单从头读了一遍，又读了一遍，自己的名字确实往后挪了一位。",
      "你往上翻聊天记录，找到当时确认的分工：一作原本说好给你。两份安排并排开在屏幕上，连课题名称都没变。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "聊天框里打了半句，又被你删掉。名字只往后挪了一行，前面那些熬夜补实验的晚上却一下涌了上来。你把分工记录截好图，心里堵着一句：说好的事，怎么就改了？",
      "名单上的几个人每天都在实验室碰面，导师那边还有后续工作等着你接着做。你不想把话说僵，可照着新名单继续干，又实在咽不下这口气。输入框空了半天，你还在斟酌第一句怎么说。",
    ].join("\n\n"),
    results: {
      [`random-12-complain-${serial}`]: {
        title: "向导师诉苦",
        description: !lowFavor
          ? [
              "你把先前的分工记录递过去，说到最后，还是没忍住补了一句：“这篇我真的想守住一作。”",
              "导师往上翻了翻聊天记录：“一作按原来的安排，我挂通讯。”你原本还准备了一大段话，这下都省了。",
              "收到改好的名单后，你又核对了一遍。这次总算不用盯着那一行字发愣了。",
            ].join("\n\n")
          : [
              "你把原先的约定找出来，尽量平静地讲自己的难处。讲到一半，才发现同一句话已经解释了两遍。",
              "导师同意把一作改回来，又提醒你以后早点确认署名。你点点头，把改好的名单存了下来。",
              "回到工位想新方案，脑子里却还在重播刚才的对话。光标闪了半天，你只删掉了一个句号。",
            ].join("\n\n"),
      },
      [`random-12-transfer-${serial}`]: {
        title: "转移目标",
        description: [
          "你绕开了自己的名字，提议把另一位同门往后排。导师照着改了名单，你的一作位置保住了。",
          "名单发回群里，那位同门问了一句是谁提的调整。你看着输入框，一时不知道该从哪句解释起。",
          ...(transferSocialNarrative ? [transferSocialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-12-argue-${serial}`]: {
        title: "据理力争",
        description: !lowFavor
          ? [
              "你打开分工记录，把已经做的事和后续由谁负责逐项对齐。准备这份说明，比你预计的还要仔细。",
              "导师听完点了头：“可以，一作按规范给你。”名单当面改了回来，你低头收电脑，才发现水杯一直没顾上碰。",
            ].join("\n\n")
          : [
              "你把分工记录和署名规范放在一起，对方问到哪一项，你就翻到哪一项。那几页材料来回切换了好几轮。",
              "导师终于同意恢复原来的安排。你收起电脑走到门外，才发现手心全是汗，刚才拧开的水杯也忘了拿。",
            ].join("\n\n"),
      },
      [`random-12-pressure-${serial}`]: {
        title: "极端施压",
        description: [
          "你把话说得很直：署名不按约定调整，后面的工作就没法继续承担。办公室安静下来，只剩电脑风扇的声音。",
          "僵持了一会儿，导师同意保留你的一作，并支付这项工作的 2 金币劳务费。你把两件事都确认了一遍。",
          pressureFavorChange < 0
            ? "名单和劳务费都有了着落，告别时却只剩一句干巴巴的“老师再见”。你轻轻带上门，在走廊站了一会儿。"
            : "收到确认后，你收起材料，说了声“老师，那我先回去了”。这回没有再绕回刚才的争执。",
          ...(pressureFavorNarrative ? [pressureFavorNarrative] : []),
        ].join("\n\n"),
      },
    },
  });
}

