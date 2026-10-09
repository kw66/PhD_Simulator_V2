import { applyTierResist, formatTierResistedOutcome, formatActualSanChange, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import { createThreeStageEvent, type RandomRollProvider } from "./v2-random-events-core-shared";
import { getFellowName } from "./v2-fellow-progression";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorAuthorshipRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const lowFavor = state.player.favor < 6;
  const argueSanChange = getActualSanChange(-3, state.month, state.eventSupport, state.buffs);
  const familiarJunior = state.fellowProgressState.find((profile) => profile.type === "junior");
  const hasJunior = familiarJunior !== undefined;
  const transferSocialRaw = hasJunior ? -1 : -2;
  const transferSocialResult = applyTierResist(transferSocialRaw, state.player.social, getRoll);
  const transferSocialChange = transferSocialResult.effectiveChange;
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
        label: "转移到师弟师妹",
        outcome: `条件：${hasJunior ? "师弟师妹人数 > 0" : "师弟师妹人数 = 0"}｜结果：${formatTierResistedOutcome("社交", transferSocialRaw, transferSocialResult)}`,
        effects: transferSocialChange < 0 ? { social: transferSocialChange } : {},
      },
      {
        id: `random-12-argue-${serial}`,
        label: "据理力争",
        outcome: lowFavor ? `导师好感 < 6｜${formatActualSanChange(-3, state.month, state.eventSupport, state.buffs)}。` : "导师好感 ≥ 6｜无事发生。",
        effects: lowFavor ? { san: argueSanChange } : {},
      },
      {
        id: `random-12-pressure-${serial}`,
        label: "极端反抗",
        outcome: `金币 +2，${formatTierResistedOutcome("导师好感", -2, pressureFavorResult)}`,
        effects: {
          money: 2,
          ...(pressureFavorChange < 0 ? { favor: pressureFavorChange } : {}),
        },
      },
    ],
  };

  return createThreeStageEvent(event, {
    introDescription: [
      "导师发来一版署名安排。你把名单从头读了一遍，又读了一遍，自己的名字确实往后挪了一位。",
      "你往上翻聊天记录，找到当时确认的分工：一作原本说好给你。两份安排并排开在屏幕上，连课题名称都没变。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      [
        "你删掉聊天框里的半句话，截好分工记录：说好的事，怎么就改了？",
        lowFavor
          ? "平时和导师说不上几句，这回得从头解释。是先讲自己的难处，还是摊开记录据理力争？你在措辞上犹豫起来。"
          : "你和导师平时沟通顺畅，也谈过分工。说清难处或摊开记录，至少能让这次改动有据可查。",
      ].join(""),
      `这篇论文要用来毕业、找工作。你想把让出一作的要求转到师弟师妹的另一篇论文上，毕竟对方离毕业还久。${hasJunior ? "有熟悉的后辈能当面解释，可这话仍不好开口。" : "没有熟悉的后辈，贸然提起，更像把麻烦往外推。"}`,
      "若干脆把不满全说出来，办公室里恐怕就没那么好收场了。",
    ].join("\n\n"),
    results: {
      [`random-12-complain-${serial}`]: {
        title: "向导师诉苦",
        description: !lowFavor
          ? [
              "你递过分工记录，还是没忍住补了一句：“这篇我真的想守住一作。”",
              "导师翻了翻记录，说会按原来的分工重新核对。你把待确认的名单收好，原本准备的一大段话只说了一半。",
            ].join("\n\n")
          : [
              "你找出原先的约定，尽量平静地讲难处，同一句话却解释了两遍。导师让你先回去等核对结果，也提醒你以后尽早把分工留成文字。",
              "你存好名单，回工位想新方案，脑子里却还在重播刚才的对话。光标闪了半天，你只删掉了一个句号。",
            ].join("\n\n"),
      },
      [`random-12-transfer-${serial}`]: {
        title: "转移到师弟师妹",
        description: [
          "你说自己要靠这篇论文毕业、找工作，希望保留一作：“师弟师妹离毕业还久，后面还有机会。”",
          `你提议把让出一作的要求转到${familiarJunior ? `${getFellowName(familiarJunior)}的另一篇论文` : "一位不太熟的师弟师妹的另一篇论文"}上。导师说会找对方谈谈。`,
          transferSocialChange < 0
            ? hasJunior
              ? "对方来问你为什么替自己作主。你解释了半天自己的难处，才发现每句话都在说自己有多着急。原本能随口聊的实验进展，这回谁也没再提。"
              : "消息传过去，对方托人问你：“离毕业远，就该我让吗？”你们本来就没说过几句话，这下还没熟起来，先有了芥蒂。"
            : "对方听完并没有答应让出一作，只让你别替自己作主。你认真道了歉，答应接下来当面把各自的安排说清楚，谈话总算没有变成争吵。",
        ].join("\n\n"),
      },
      [`random-12-argue-${serial}`]: {
        title: "据理力争",
        description: !lowFavor
          ? [
              "你打开分工记录，把已经做的事和后续由谁负责逐项对齐。准备这份说明，比你预计的还要仔细。",
              "导师听完点了头，说会按规范重新核对署名。你低头收电脑，才发现水杯一直没顾上碰。",
            ].join("\n\n")
          : [
              "你把分工记录和署名规范放在一起，对方问到哪一项，你就翻到哪一项。那几页材料来回切换了好几轮。",
              "导师让你把分工记录留在案头，之后按实际贡献确认。你收起电脑走到门外，才发现手心全是汗，刚才拧开的水杯也忘了拿。",
            ].join("\n\n"),
      },
      [`random-12-pressure-${serial}`]: {
        title: "极端反抗",
        description: [
          "你把话说得很直：署名不按约定调整，后面的工作就没法继续承担。办公室安静下来，只剩电脑风扇的声音。",
          "僵持了一会儿，导师放缓语气，说整理实验材料辛苦了，给你发 2 金币劳务费。你听得出是在安抚，署名却还没说定。",
          [pressureFavorChange < 0 ? "钱到账了，刚才说重的话却收不回来。告别时，只剩一句干巴巴的“老师再见”。" : "你收起手机，没再争吵，双方约好之后再谈。", pressureFavorNarrative].filter(Boolean).join(""),
        ].join("\n\n"),
      },
    },
  });
}

