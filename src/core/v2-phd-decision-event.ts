import { ADVISOR_REQUIREMENTS, ADVISOR_SALARY } from "./v2-content";
import { attachFixedTreePreview } from "./v2-fixed-event-preview";
import { createThreeStageEvent, type RandomEventResultCopy } from "./v2-random-events-core-shared";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

function normalizeDecisionYear(year: number): 2 | 3 {
  return year >= 3 ? 3 : 2;
}

function describePublishedPapers(state: GameState): string {
  const paperCount = new Set([...state.papers, ...state.externalPublications]
    .filter((paper) => paper.status === "published" && !paper.nonFirstAuthor && !paper.leadAuthorId
      && (paper.target || paper.journalTarget || paper.publication?.journalTarget))
    .map((paper) => paper.id)).size;
  return `已发表一作${paperCount}篇，科研分${state.totalResearchScore}。`;
}

export function createPhdDecisionEvent(state: GameState, requestedYear = state.year): PendingEvent {
  const decisionYear = normalizeDecisionYear(requestedYear);
  const requiredScore = decisionYear === 2
    ? ADVISOR_REQUIREMENTS.phdYear2
    : ADVISOR_REQUIREMENTS.phdYear3;
  const currentScore = state.totalResearchScore;
  const canTransfer = state.degree === "master" && currentScore >= requiredScore;
  const continueLabel = "继续硕士";
  const choices: EventChoice[] = [];
  const results: Record<string, RandomEventResultCopy> = {};

  choices.push({
    id: "continue-master",
    label: continueLabel,
    outcome: decisionYear === 2
      ? "本年不转博，明年仍可重新考虑。"
      : "放弃本轮转博，继续准备硕士毕业。",
    effects: {},
  });
  results["continue-master"] = {
    title: "转博结果",
    description: decisionYear === 2
      ? "你跟老师说，今年先不申请，想趁还有时间了解一下外面的工作。导师点点头，提醒你留意实习和秋招，也别落下手头的论文。\n\n明年还有一次机会。回到工位，你打开了收藏很久的招聘页面。岗位要求里又多了几个没接触过的AI工具，你找出旧简历，先改起了项目经历。"
      : "你跟老师说，这次不再申请转博，先准备硕士毕业。老师把申请材料收到一边，问了问你找工作的打算，又提醒你把毕业论文收好尾。\n\n回到工位，你把毕业材料和招聘信息分别打开。能否按期毕业，还要看6月结束时的成果。外面的机会未必比去年多，你也没突然有了把握，只是不想再为了推迟找工作而多读几年。",
  };

  if (canTransfer) {
    choices.push({
      id: "transfer-phd",
      label: "申请转博",
      outcome: `条件：科研分 ${currentScore} ≥ ${requiredScore}｜结果：毕业要求 ${ADVISOR_REQUIREMENTS.masterGrad}→${ADVISOR_REQUIREMENTS.phdGrad}分｜工资 ${ADVISOR_SALARY.master}→${ADVISOR_SALARY.phd}金｜每月SAN -1`,
      effects: {
        transferToPhd: true,
        addBuffs: [{
          id: "phd-pressure",
          name: "读博压力",
          source: "转博",
          timing: "permanent",
          remainingMonths: null,
          monthlyStats: { san: -1 },
          description: "博士阶段的长期压力使每月 SAN -1",
        }],
      },
    });
    results["transfer-phd"] = {
      title: "转博结果",
      description: "学院确认了你的转博资格，毕业时间按入学第六年6月安排。翻到新的毕业要求，手里的成果忽然显得不够了。导师说下个月起工资按博士标准提高，经费充裕时劳务费也多些。\n\n家里回了句“那就安心读吧”。你把求职群设成免打扰，刚松口气，再看培养安排，又多了一股无形的压力：往后每个月，都得惦记更难的课题。\n\n你确实还有想做的研究，也承认自己想晚些面对找工作。等再走进招聘会，AI会把岗位改成什么样，谁也说不准。",
      buttonLabel: "开始博士阶段",
    };
  } else if (state.degree === "master") {
    choices.push({
      id: "transfer-phd",
      label: "申请转博",
      outcome: `条件：科研分 ${currentScore} < ${requiredScore}｜结果：转博失败，继续硕士。`,
      effects: {},
    });
    results["transfer-phd"] = {
      title: "转博失败",
      description: decisionYear === 2
        ? "导师核对了你的成果，这次还没达到转博要求，申请材料只能先收回来。你原本想着，若能留下，至少可以晚些面对找工作的事，现在还定不下来。\n\n明年还有一次机会。回到工位，你重新打开没做完的论文，也问同门要了一份实习信息。下一年是继续申请还是出去工作，你想多了解一点再决定。"
        : "导师核对了你的成果，这次仍未达到转博要求。最后一次申请机会过去了，你把材料收好，坐了一会儿才起身。原本想靠继续读书缓一缓的求职压力，又回到了眼前。\n\n接下来转回硕士毕业准备。能否按期毕业，还要看6月结束时的成果。你翻出之前收藏的岗位，有些已经停止招聘，又去问同门有没有新的消息。",
    };
  }

  const event: PendingEvent = {
    id: `phd-decision-y${decisionYear}-m${state.month}-t${state.totalMonths}`,
    title: "转博抉择",
    description: "",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "phd-decision",
    stage: "act1",
    choices,
  };

  const applicationSummary = `🧠 ${describePublishedPapers(state)}今年转博需要达到 ${requiredScore} 分，${canTransfer ? "你已经过线" : "你的成果还不够"}。${decisionYear === 2 ? "今年不转，明年还有一次机会。" : "这是硕士阶段最后一次转博机会。"}`;
  const decisionDescription = [
    "💼 同门投出去的简历迟迟没有回应，饭桌上总在感叹大环境不好。博士师兄也叹气：“别觉得多一张文凭就稳了。”读博有补助，可几年以后能去哪，他也没底。",
    "🤖 AI发展得太快，有些岗位以后可能不再招人。前阵子还在讨论的研究问题，新模型已经能解决；熬夜读过的论文，再翻出来，竟有种正在变成厕纸的感觉。",
    "💭 你还有想做的研究，也想借读博晚些面对找工作。多几年能不能跟上变化，还是课题先失去意义？通知就在眼前，你迟迟没有回复。",
  ].join("\n\n");

  return attachFixedTreePreview(createThreeStageEvent(event, {
    introDescription: (decisionYear === 2
      ? "硕士第二年5月，学院发来了转博申请通知。导师叫你去办公室，听完近期的课题进展，又问起你有没有继续读博的打算。\n\n你出门前还在整理这周的结果，没想到话题转到了毕业以后。老师把申请通知推过来，让你先看看，再认真考虑。"
      : "硕士第三年5月，毕业答辩和离校安排陆续发到了群里。学院也发来了这一轮转博通知，这是你硕士阶段最后一次申请机会。\n\n导师约你确认去向。你带着成果记录和毕业材料来到办公室，老师问起前些日子聊过的打算：这次还想不想继续留下做研究？") + `\n\n${applicationSummary}`,
    decisionTitle: "转博选择",
    decisionDescription,
    results,
  }), { kind: "phd-decision", year: decisionYear, month: state.month, totalMonths: state.totalMonths, rolls: [] });
}
