import {
  applyTierResist,
  formatTierResistedOutcome,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { activateRemoteInternship, hasOngoingInternship, hasRemoteInternshipScore } from "./v2-internship-system";
import { createThreeStageEvent, drawInclusiveInt, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorTalkRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isHighResearch = state.player.research >= 6;
  const isHighFavor = state.player.favor >= 6;
  const hasInternshipScore = hasRemoteInternshipScore(state);
  const internshipUnavailable = hasOngoingInternship(state);
  const ideaBonus = drawInclusiveInt(4, 6, getRoll);
  const reportFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const reportFavorChange = reportFavorResult.effectiveChange;
  const askFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const askFavorChange = askFavorResult.effectiveChange;
  const askResearchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const askResearchChange = askResearchResult.effectiveChange;
  const internFavorResult = applyTierResist(-1, state.player.favor, getRoll);
  const internFavorChange = internFavorResult.effectiveChange;

  const event: PendingEvent = {
    id: `random-5-y${state.year}-m${state.month}-n${serial}`,
    title: "导师约谈",
    description: "导师在学生群里通知大家准备 PPT，分别到办公室聊聊。你翻开最近的记录，越临近约定的时间，越担心那几页结果讲不清楚。",
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
        ...(internshipUnavailable ? { disabledReason: "已有实习安排，请先完成当前实习。" } : {}),
        outcome: internshipUnavailable
          ? "已有实习安排，本次不重复申请。"
          : hasInternshipScore
          ? "科研分 ≥ 2｜下三个月 SAN -2、金币 +1、实验金币 -1、实验 +4。"
          : `科研分 < 2｜${formatTierResistedOutcome("导师好感", -1, internFavorResult)}`,
        effects: hasInternshipScore || internshipUnavailable
          ? {}
          : internFavorChange < 0 ? { favor: internFavorChange } : {},
      },
    ],
  };

  const stagedEvent = createThreeStageEvent(event, {
    introDescription: [
      "导师在在读学生群里通知大家准备好 PPT，这几天逐个找他聊聊。群里很快安静下来，你盯着消息，重新翻起最近几个月的记录。",
      "办公室门口已经坐着几位同学。你又点开 PPT，总觉得那张结果图没讲清楚，连昨晚练熟的开场白也忘了半句。听见导师叫你，你赶紧抱起电脑。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      isHighResearch
        ? "你打开 PPT，讲起研究进展。关键结果的设置和依据都能对上，导师没有打断，只在图旁画了条线，问起那个还没展开的假设。"
        : "你打开 PPT，讲起研究进展。几处设置却只记着“先试试看”，对照也没补齐。导师的笔停在那一页，等你解释，你又往前翻了两张。",
      [
        isHighFavor
          ? "常来讨论，导师记得你上次卡住的地方，拿起了白板笔。"
          : "你们很少单独聊，导师还在问课题何时做完。",
        "招聘岗位很看重实习，你正好有份三个月的远程机会，还能留在实验室。",
        hasInternshipScore
          ? "手上已经有些论文成果，时间表也排开了冲突，你觉得可以提一提。"
          : "只是能拿出来的论文成果还不多，最后一页的实习安排，你翻过去前又犹豫了一下。",
      ].join(""),
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
            ].join("\n\n"),
      },
      [`random-5-ask-${serial}`]: {
        title: "当面请教",
        description: isHighFavor
          ? [
              "你在白板上画出拿不准的地方，导师顺着问了几句，停在一个你一直默认成立的假设上。",
              "你们擦掉半块白板，重新推了一遍。临走前，你拍下剩下的板书，回工位又对着照片看了一次，终于知道先前是哪一步绕远了。",
            ].join("\n\n")
          : [
              "你刚说想请教下一步怎么推进，导师就问：“相关论文看了哪些？已经试过什么？”你临时翻起电脑，越急越找不到要用的那页。",
              "导师让你先把问题整理清楚再来。回到工位，你新建了一份提纲，第一行写“到底卡在哪里”，盯着它想了一会儿才继续往下打。",
            ].join("\n\n"),
      },
      [`random-5-intern-${serial}`]: {
        title: hasInternshipScore && !internshipUnavailable ? "确认远程实习" : "谈话结束",
        description: internshipUnavailable
          ? "导师看了眼你已经排好的实习日程，提醒你先把手头这份做完。你收起新的介绍，在笔记上补好下次实验的日期，没有再给自己添一份安排。"
          : hasInternshipScore
          ? [
              "导师翻了翻你已经发表的论文，再看完时间表，点了点头：“可以，下个月开始，先做三个月。人还在实验室，组会和实验节点别耽误。”你松了口气，改好几处撞车的日期。",
              "你回信确认，把实习和实验一起排进日历。面试终于能讲一段亲手做过的项目了；可看着挤在一起的待办，你又默默关掉了今晚想看的剧。",
            ].join("\n\n")
          : [
              "“老师，我想做一段远程实习……”导师没有接着问公司，而是翻回了你的论文进展。你准备好的实习介绍只好先停在第一页。",
              "“先把论文成果做出来，再谈实习吧。”导师没有同意，谈话又回到课题上。你合上介绍页面，笔记里那行“实习”暂时没了下文。",
            ].join("\n\n"),
      },
    },
  });
  const internshipResult = stagedEvent.choices[0]?.effects.enqueueEvents?.[0]?.choices
    .find((choice) => choice.id === `random-5-intern-${serial}`)?.effects.enqueueEvents?.at(-1);
  if (hasInternshipScore && !internshipUnavailable && internshipResult?.choices[0]) {
    internshipResult.choices[0].effects.internshipStateUpdates = activateRemoteInternship(state.totalMonths);
  }
  return stagedEvent;
}

