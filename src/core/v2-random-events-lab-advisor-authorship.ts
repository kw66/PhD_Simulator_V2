import { applyTierResist, formatTierResistedOutcome, formatActualSanChange, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
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
        outcome: lowFavor ? "导师好感 < 6｜下次想 idea -5。" : "导师好感 ≥ 6｜无事发生。",
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
        outcome: lowFavor ? `导师好感 < 6｜${formatActualSanChange(-2, state.month, state.eventSupport, state.buffs)}。` : "导师好感 ≥ 6｜无事发生。",
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
      [
        "你删掉聊天框里的半句话，截好分工记录：说好的事，怎么就改了？",
        lowFavor
          ? "平时和导师说不上几句，这回免不了解释。只诉苦，委屈怕会搅乱研究思绪；逐项讲道理能守住署名，却也得耗一番心力。"
          : "你和导师平时沟通顺畅，也谈过分工。说清难处或摊开记录，都有希望平和地把署名改回来。",
      ].join(""),
      "把别人的名字往后挪能解眼前的难，可每天在实验室碰面，难免尴尬。拿后续工作施压，连劳务费一起谈清也行，只是话说重了，和导师就难再像从前那样自在。",
    ].join("\n\n"),
    results: {
      [`random-12-complain-${serial}`]: {
        title: "向导师诉苦",
        description: !lowFavor
          ? [
              "你递过分工记录，还是没忍住补了一句：“这篇我真的想守住一作。”",
              "导师翻了翻记录：“一作按原来的安排，我挂通讯。”你准备的一大段话都省了，收到名单又核对了一遍，总算不用盯着那行字发愣。",
            ].join("\n\n")
          : [
              "你找出原先的约定，尽量平静地讲难处，同一句话却解释了两遍。导师同意改回一作，提醒你以后早点确认。",
              "你存好名单，回工位想新方案，脑子里却还在重播刚才的对话。光标闪了半天，你只删掉了一个句号。",
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

