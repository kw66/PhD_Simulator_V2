import {
  applyTierResist,
  formatTierResistedOutcome,
  getActualSanChange,
  getTierResistedNarrative,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { createThreeStageRandomEvent, drawInclusiveInt, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorTalkRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isHighResearch = state.player.research >= 6;
  const isHighFavor = state.player.favor >= 6;
  const internshipSanChange = getActualSanChange(-5, state.month, state.eventSupport, state.buffs);
  const internshipSanSummary = `SAN ${internshipSanChange > 0 ? "+" : ""}${internshipSanChange}`;
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
    description: "导师发来一句“来办公室聊聊”，后面没有别的消息👀。你把聊天框盯了一会儿，抱起电脑走向办公室。",
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
      "导师发来一句“来办公室聊聊”，后面没有别的消息。你等了一会儿，确认没有下一句，才抱起电脑出门。",
      "办公室的门虚掩着。导师把手边的材料往旁边挪了挪，示意你坐。你拉开椅子，把电脑放在刚腾出来的空位上。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "电脑亮起来，你找到最近的记录。做完的几项已经打了勾，卡住的地方还留着问号。刚才在路上想好的开场白，坐到导师对面又忘了半句，你清了清嗓子，想先把话理顺。",
      "文件夹里还放着那份远程实习介绍，时间安排是你昨晚改好的。机会挺让人心动，可课题还压在手上；你看了看介绍，又看了看实验记录，两件事都想讲清楚。",
    ].join("\n\n"),
    results: {
      [`random-5-report-${serial}`]: {
        title: "汇报进展",
        description: isHighResearch
          ? [
              "你打开记录，从最近试过什么讲到下一步打算。导师在一处停下来，问你为什么非要沿着原来的假设走。",
              "你们在纸上画了几条线，又划掉两条。回工位时，你还拿着那张纸，生怕一合上电脑，又忘了刚才是怎么想通的。",
            ].join("\n\n")
          : [
              "你打开记录汇报，刚讲了几句，导师就问起其中一个设置的依据。你往前翻了好几页，才发现自己只记了“先这样试试”。",
              "导师让你把依据和步骤补齐，下次带着完整记录来。回到工位，你先给那行字画了个圈——写的时候省下的几秒，刚才全还回去了。",
              ...(reportFavorNarrative ? [reportFavorNarrative] : []),
            ].join("\n\n"),
      },
      [`random-5-ask-${serial}`]: {
        title: "当面请教",
        description: isHighFavor
          ? [
              "你在白板上画出拿不准的地方，导师顺着问了几句，停在一个你一直默认成立的假设上。",
              "你们擦掉半块白板，重新推了一遍。临走前，你拍下剩下的板书，回工位又对着照片看了一次，终于知道先前是哪一步绕远了。",
              ...(askResearchNarrative ? [askResearchNarrative] : []),
            ].join("\n\n")
          : [
              "你刚说想请教下一步怎么推进，导师就问：“相关论文看了哪些？已经试过什么？”你临时翻起电脑，越急越找不到要用的那页。",
              "导师让你先把问题整理清楚再来。回到工位，你新建了一份提纲，第一行写“到底卡在哪里”，盯着它想了一会儿才继续往下打。",
              ...(askFavorNarrative ? [askFavorNarrative] : []),
            ].join("\n\n"),
      },
      [`random-5-intern-${serial}`]: {
        title: isHighFavor ? "安排实习" : "谈话结束",
        description: isHighFavor
          ? [
              "你把远程实习的想法和时间安排说完，导师想了想：“可以，但组里的实验节点不能耽误。”你赶紧把那几个日期记下来。",
              "实习安排确认后，电脑里多了一套工作群和待办。刚回完这边的消息，那边又亮起来，有时连午饭都得等一句“我马上看”。",
              "报酬到账时，你松了口气。来回切换确实累，但实习里学到的几种工程做法，正好能拿去试一试下一轮实验。",
            ].join("\n\n")
          : [
              "“老师，我想做一段远程实习……”导师没有接着问公司，而是让你先说说手头的安排。你准备好的实习介绍只好先停在第一页。",
              "“先把这边的事安排好吧。”导师没有同意，谈话又回到课题上。你合上介绍页面，笔记里那行“实习”暂时没了下文。",
              ...(internFavorNarrative ? [internFavorNarrative] : []),
            ].join("\n\n"),
      },
    },
  });
}

