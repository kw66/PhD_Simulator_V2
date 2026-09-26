import {
  applyTierResist,
  formatTierResistedOutcome,
} from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { activateRemoteInternship, hasOngoingInternship } from "./v2-internship-system";
import { createThreeStageRandomEvent, drawInclusiveInt, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorTalkRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isHighResearch = state.player.research >= 6;
  const isHighFavor = state.player.favor >= 6;
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
          ? `讨论打开了思路｜下次想 idea +${ideaBonus}。`
          : `汇报准备不足｜${formatTierResistedOutcome("导师好感", -1, reportFavorResult)}`,
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
          ? `导师耐心指点｜${formatTierResistedOutcome("科研", 1, askResearchResult)}`
          : `导师让你先整理问题｜${formatTierResistedOutcome("导师好感", -1, askFavorResult)}`,
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
          : isHighFavor
          ? "导师同意远程实习｜下三个月 SAN -3、金币 +1、实验金币 -1、实验 +4。"
          : `导师暂未同意实习｜${formatTierResistedOutcome("导师好感", -1, internFavorResult)}`,
        effects: isHighFavor || internshipUnavailable
          ? {}
          : internFavorChange < 0 ? { favor: internFavorChange } : {},
      },
    ],
  };

  const stagedEvent = createThreeStageRandomEvent(event, {
    introDescription: [
      "导师在在读学生群里发了通知，让大家这几天分别找他聊聊，提前准备好 PPT。群里很快安静下来，你盯着那条消息，把最近几个月的记录重新翻了一遍。",
      "轮到你之前，办公室门口已经坐着几位同学。你又点开 PPT，越看越觉得那张结果图解释得不够清楚，连昨晚练熟的开场白也忘了半句。听见导师叫你的名字，你赶紧抱起电脑站起来。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      isHighResearch
        ? "你把 PPT 投到屏幕上，从研究问题讲到做过的尝试。翻到关键结果，实验设置和依据都能一一对上。导师没有打断，只在图旁画了条线，问起你还没来得及展开的那个假设。"
        : "你把 PPT 投到屏幕上，从研究问题讲到做过的尝试。翻到关键结果，几处设置却只记着“先试试看”，对照也没补齐。导师的笔停在那一页，抬头等你解释，你又往前翻了两张。",
      isHighFavor
        ? "这段时间常来讨论，导师记得你上次卡住的地方，顺手拿起白板笔。你想起最近看的招聘要求，许多岗位都希望有实习经历；手头正好有份三个月的远程机会，不用离开实验室。时间表藏在最后一页，导师问起后面的安排，你的手停在翻页键上。"
        : "你们平时很少单独聊，导师还在核对你的课题和进度，问手头的事何时做完。你想起最近看的招聘要求，许多岗位都希望有实习经历；手头正好有份三个月的远程机会，不用离开实验室。时间表藏在最后一页，看着他尚未放下的笔，你迟迟没翻过去。",
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
        title: isHighFavor && !internshipUnavailable ? "安排实习" : "谈话结束",
        description: internshipUnavailable
          ? "导师看了眼你已经排好的实习日程，提醒你先把手头这份做完。你收起新的介绍，在笔记上补好下次实验的日期，没有再给自己添一份安排。"
          : isHighFavor
          ? [
              "导师把你的时间表看了一遍，问清每周要交付什么，终于点了点头：“可以，下个月开始，先做三个月。人还在实验室，组会和实验节点别耽误。”你松了口气，把几处撞车的日期当面改好。",
              "回到工位，你给公司回了确认邮件，又把下一轮实验排进日历。想到以后面试时终于能讲一段亲手做过的项目，你有些期待；看着两边挤在一起的待办，又默默关掉了今晚想看的剧。",
            ].join("\n\n")
          : [
              "“老师，我想做一段远程实习……”导师没有接着问公司，而是让你先说说手头的安排。你准备好的实习介绍只好先停在第一页。",
              "“先把这边的事安排好吧。”导师没有同意，谈话又回到课题上。你合上介绍页面，笔记里那行“实习”暂时没了下文。",
            ].join("\n\n"),
      },
    },
  });
  const internshipResult = stagedEvent.choices[0]?.effects.enqueueEvents?.[0]?.choices
    .find((choice) => choice.id === `random-5-intern-${serial}`)?.effects.enqueueEvents?.at(-1);
  if (isHighFavor && !internshipUnavailable && internshipResult?.choices[0]) {
    internshipResult.choices[0].effects.internshipStateUpdates = activateRemoteInternship(state.totalMonths);
  }
  return stagedEvent;
}

