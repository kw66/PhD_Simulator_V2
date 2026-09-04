import { applyTierResist, formatTierResistedOutcome, getActualSanChange, getTierResistedNarrative } from "./v2-sanity-rules";
import { createThreeStageRandomEvent, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorAuthorshipRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const lowFavor = state.player.favor < 6;
  const argueSanChange = getActualSanChange(-2, state.month, state.eventSupport);
  const transferSocialResult = applyTierResist(-1, state.player.social, getRoll);
  const transferSocialChange = transferSocialResult.effectiveChange;
  const transferSocialNarrative = getTierResistedNarrative("社交", -1, transferSocialResult);
  const pressureFavorResult = applyTierResist(-2, state.player.favor, getRoll);
  const pressureFavorChange = pressureFavorResult.effectiveChange;
  const pressureFavorNarrative = getTierResistedNarrative("导师好感", -2, pressureFavorResult);

  const event: PendingEvent = {
    id: `random-12-y${state.year}-m${state.month}-n${serial}`,
    title: "署名风波",
    description: "论文还在组内修改，署名顺序却和原先说好的不一样。核心实验、写作和返修大多是你完成的，这件事必须在投稿前谈清楚。",
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
      "论文还在组内修改，离正式投稿还有一段时间，导师先把署名方案拿出来讨论。",
      "你发现原先说好的一作安排变了，核心实验、写作和返修明明大多是你完成的。",
      "现在就把话挑明，可能影响后续合作；先缓一缓，也许能等到更合适的时机。",
      "一作对你很重要，你得想好这次该怎么处理。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "先和导师把贡献和署名规则谈清楚，留出商量余地。",
      "把一作转给别的同门，自己先避开冲突，但也会欠下一份人情。",
      "拿贡献清单和署名规范据理力争，态度最明确，场面也最难收。",
    ].join("\n\n"),
    results: {
      [`random-12-complain-${serial}`]: {
        title: "向导师诉苦",
        description: !lowFavor
          ? [
              "你把过程和贡献讲得很克制，只在最后补了一句：“这篇我真的想守住一作。”",
              "导师重新看了一遍贡献清单，最后说：“一作按原来的安排，我挂通讯。”",
              "稿件里的署名顺序改了回来，这场谈话也没有继续僵下去。",
            ].join("\n\n")
          : [
              "你尽量压住情绪，把自己完成的工作和原先约定逐项说了一遍。",
              "导师同意把一作改回来，只提醒你以后更早确认署名。",
              "稿件里的顺序恢复了，之后几次讨论里，导师的回复也比以前简短。",
            ].join("\n\n"),
      },
      [`random-12-transfer-${serial}`]: {
        title: "转移目标",
        description: [
          "你没有直接争自己的位置，而是建议把另一位同门调到后面。",
          "导师接受了这个方案，你的一作顺序暂时保住了。",
          "署名表传回组里后，大家很快知道这个调整是谁提出的。",
          ...(transferSocialNarrative ? [transferSocialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-12-argue-${serial}`]: {
        title: "据理力争",
        description: !lowFavor
          ? [
              "你把贡献清单一条条摆出来，语气平稳但立场非常明确。",
              "导师听完后点头：“可以，一作按规范给你。”",
              "导师按原来的署名方案改回了稿件。",
            ].join("\n\n")
          : [
              "你把核心贡献、修改记录和署名规范都摆到桌上，逐项说明自己为什么应当是一作。",
              "谈话来回了几轮，导师最后同意按贡献恢复原来的顺序。",
              "离开办公室时，你才发现手心一直在出汗。好在投稿前把这件事说清楚了。",
            ].join("\n\n"),
      },
      [`random-12-pressure-${serial}`]: {
        title: "极端施压",
        description: [
          "你明确表示，如果署名不按贡献调整，自己将不再继续承担后续返修。",
          "谈话僵了很久，导师最后同意保留你的一作，也把之前没结算的 2 金币劳务费一并补发。",
          "稿件改回来了，但这次把话说得太重，之后的沟通不会像以前那么轻松。",
          ...(pressureFavorNarrative ? [pressureFavorNarrative] : []),
        ].join("\n\n"),
      },
    },
  });
}

