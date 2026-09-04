import {
  applyTierResist,
  formatResearchMiscSanChange,
  formatTierResistedOutcome,
  getActualResearchMiscSanChange,
  getResearchMiscSanNarrative,
  getTierResistedNarrative,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { createThreeStageRandomEvent, drawInclusiveInt, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorTalkRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isHighResearch = state.player.research >= 6;
  const isHighFavor = state.player.favor >= 6;
  const internshipSanChange = getActualResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport);
  const internshipSanSummary = formatResearchMiscSanChange(-5, state.player.research, state.month, state.eventSupport);
  const internshipSanNarrative = getResearchMiscSanNarrative(-5, state.player.research);
  const ideaBonus = drawInclusiveInt(4, 6, getRoll);
  const experimentBonus = drawInclusiveInt(4, 6, getRoll);
  const reportFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const reportFavorChange = reportFavorResult.effectiveChange;
  const reportFavorNarrative = getTierResistedNarrative("导师好感", -1, reportFavorResult);
  const askFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const askFavorChange = askFavorResult.effectiveChange;
  const askFavorNarrative = getTierResistedNarrative("导师好感", -1, askFavorResult);
  const askResearchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const askResearchChange = askResearchResult.effectiveChange;
  const askResearchNarrative = getTierResistedNarrative("科研", 1, askResearchResult);
  const internFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const internFavorChange = internFavorResult.effectiveChange;
  const internFavorNarrative = getTierResistedNarrative("导师好感", -1, internFavorResult);

  const event: PendingEvent = {
    id: `random-5-y${state.year}-m${state.month}-n${serial}`,
    title: "导师约谈",
    description: "导师突然发来一句“来我办公室一趟”，没说是什么事。一路上，你把最近的进度和失误都想了一遍。",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-5",
    stage: "act1",
    choices: [
      {
        id: `random-5-report-${serial}`,
        label: "认真汇报",
        outcome: isHighResearch
          ? `科研 ≥ 6｜下次想 idea +${ideaBonus}。`
          : `科研 < 6｜${formatTierResistedOutcome("导师好感", -1, reportFavorResult)}`,
        effects: isHighResearch
          ? {
            temporaryActionEffectUpdates: {
              idea: { bonus: ideaBonus },
            },
          }
          : reportFavorChange < 0 ? { favor: reportFavorChange } : {},
      },
      {
        id: `random-5-ask-${serial}`,
        label: "请教推进方法",
        outcome: isHighFavor
          ? `导师好感 ≥ 6｜${formatTierResistedOutcome("科研", 1, askResearchResult)}`
          : `导师好感 < 6｜${formatTierResistedOutcome("导师好感", -1, askFavorResult)}`,
        effects: isHighFavor
          ? askResearchChange > 0 ? { research: askResearchChange } : {}
          : askFavorChange < 0 ? { favor: askFavorChange } : {},
      },
      {
        id: `random-5-intern-${serial}`,
        label: "提出远程实习",
        outcome: isHighFavor
          ? `导师好感 ≥ 6｜${internshipSanSummary}｜金币 +3｜下次实验 +${experimentBonus}。`
          : `导师好感 < 6｜${formatTierResistedOutcome("导师好感", -1, internFavorResult)}`,
        effects: isHighFavor
          ? {
            san: internshipSanChange,
            money: 3,
            temporaryActionEffectUpdates: {
              experiment: { bonus: experimentBonus },
            },
          }
          : internFavorChange < 0 ? { favor: internFavorChange } : {},
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师发来一句“来办公室聊聊”，没有多说什么。",
      "你把最近的实验结果、没解决的问题和下周计划整理到同一页 PPT 上。",
      "走到门口时，你又看了一遍这页内容，免得谈到一半才想起漏了什么。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "如实汇报最稳，不过没做完的部分也藏不住。",
      "卡住的问题拖了几周，你也想听听导师的意见。",
      "至于远程实习，现在提出来可能正好，也可能让谈话突然变得严肃。",
    ].join("\n\n"),
    results: {
      [`random-5-report-${serial}`]: {
        title: "汇报进展",
        description: isHighResearch
          ? [
              "你打开 PPT，把已经完成的实验、失败的尝试和下一步计划依次讲清楚。",
              "导师在其中一页停下来，帮你排除了两个不必再做的对照，又圈出一条值得继续验证的路线。",
              "离开办公室前，你把接下来的实验顺序重新记了一遍。这次谈话至少让下一步清楚了。",
            ].join("\n\n")
          : [
              "你把最近的结果投到屏幕上，能讲清楚的只有两组还没跑完的实验。",
              "导师追问了几次变量设置，你翻了半天记录也没找到完整答案。",
              "谈话结束前，导师让你先把实验记录补齐，下次再带着可复现的结果来汇报。",
              ...(reportFavorNarrative ? [reportFavorNarrative] : []),
            ].join("\n\n"),
      },
      [`random-5-ask-${serial}`]: {
        title: "当面请教",
        description: isHighFavor
          ? [
              "你把卡住的问题画在白板上，也列出已经试过的几种方法。",
              "导师顺着你的推导问了几个问题，很快指出其中一个假设并不成立。",
              "你们把方案改到能继续验证的程度。回到工位后，你马上补上了新的实验清单。",
              ...(askResearchNarrative ? [askResearchNarrative] : []),
            ].join("\n\n")
          : [
              "你刚说自己不知道下一步该怎么做，导师先问：“相关论文看了哪些？已经试过什么？”",
              "你一时答不上来。导师让你先把问题和已有尝试整理具体，再约时间讨论。",
              "回到工位后，你重新翻开文献和实验记录，先把缺的准备补上。",
              ...(askFavorNarrative ? [askFavorNarrative] : []),
            ].join("\n\n"),
      },
      [`random-5-intern-${serial}`]: {
        title: isHighFavor ? "安排实习" : "谈话结束",
        description: isHighFavor
          ? [
              "“导师，我想接一段远程实习，时间尽量安排在课题之外。”",
              "导师想了想：“可以，但组里的实验节点不能耽误。”",
              "你和公司确认了远程安排，白天处理实习任务，空档继续跑实验。",
              "两边来回切换有些累，不过收入和工程经验都实实在在。",
              ...(internshipSanNarrative ? [internshipSanNarrative] : []),
            ].join("\n\n")
          : [
              "“导师，我想接一段远程实习……”",
              "导师先问了论文和实验的进度。你报出的几个节点都还没有收尾。",
              "“先把手头这些做完吧。”导师没有同意，谈话也很快回到当前课题。",
              "你只好暂时放下实习计划，回去继续赶实验。",
              ...(internFavorNarrative ? [internFavorNarrative] : []),
            ].join("\n\n"),
      },
    },
  });
}

