import { getJournalDefinition } from "./v2-journal-system";
import { JOURNAL_PUBLICATION_FEES } from "./v2-publication-fees";
import type { GameState, JournalTarget, Paper, PendingEvent } from "./v2-types";

type PaymentMode = "self" | "advisor";
type FeeStage = "act1" | "act2" | "act3";

function getJournalTarget(paper: Paper): JournalTarget | null {
  return paper.journalTarget ?? paper.publication?.journalTarget ?? null;
}

function isEligiblePaper(paper: Paper): boolean {
  return paper.status === "published" && getJournalTarget(paper) !== null
    && paper.nonFirstAuthor !== true && (!paper.leadAuthorId || paper.leadAuthorId === "player");
}

function hasPaid(state: GameState, paperId: string): boolean {
  return state.advisorProgressState.paidJournalPaperIds?.includes(paperId) ?? false;
}

function getPaymentDisabledReason(state: GameState, mode: PaymentMode, fee: number): string | undefined {
  if (mode === "advisor" && !state.selectedAdvisorName) return "尚未选择导师";
  return (mode === "self" ? state.player.money : state.advisorProgressState.funding) < fee
    ? `${mode === "self" ? "金币" : "科研经费"}不足，需要 ${fee}` : undefined;
}

function createFeeStage(paper: Paper, stage: FeeStage, title: string, description: string): PendingEvent {
  const chainId = `journal-fee-${paper.id}`;
  return {
    id: `${chainId}-${stage}`, chainId, stage, title, description,
    source: "fixed", blocking: true, deadlineMonths: 0,
    journalFeePreview: { paperId: paper.id, stage },
    choices: [],
  };
}

function createPaymentConfirmation(state: GameState, paper: Paper, mode: PaymentMode, allowReturn: boolean): PendingEvent {
  const fee = JOURNAL_PUBLICATION_FEES[getJournalTarget(paper)!];
  const result = `${mode === "self" ? "金币" : "科研经费"} -${fee}`;
  const event = createFeeStage(paper, "act3", "期刊中稿 ➜ 缴费方式 ➜ 缴费确认", [
    mode === "self"
      ? `你决定自己支付《${paper.title}》的版面费。重新打开编辑部的邮件，附件里除了缴费单，还有排版和校样的说明；明明已经中稿，待办列表却还没有清空。`
      : `你把《${paper.title}》的录用通知和缴费单整理好，准备使用导师的科研经费支付。填表时又翻出投稿邮件，论文题目、作者信息和收款单位都得一项项对上。`,
    mode === "self"
      ? "你对着账户余额犹豫了片刻，又把金额和论文信息核对一遍。缴费页面还停在确认按钮前，桌边那份改过许多遍的稿子终于可以先合上，等校样来了再打开。"
      : "你把表格检查完，顺手给录用邮件加上星标。这篇稿子占了很久的工位和心思，眼下终于走到出版手续；确认支付后，便能把缴费凭据和定稿一起归档。",
    `机制结算\n结果：${result}`,
  ].join("\n\n"));
  return {
    ...event, id: `${event.id}-${mode}`, completionLog: result,
    journalFeePreview: { paperId: paper.id, stage: "act3", paymentMode: mode },
    choices: [
      {
        id: "confirm", label: "确认缴费", outcome: result,
        disabledReason: getPaymentDisabledReason(state, mode, fee),
        effects: {
          ...(mode === "self" ? { money: -fee } : { advisorProgressStateDeltas: { funding: -fee } }),
          recordJournalFeePayment: paper.id,
        },
      },
      ...(allowReturn ? [{
        id: "change-payment-method", label: "重新选择缴费方式", outcome: "重新选择缴费方式。",
        effects: { enqueueEvents: [createPaymentDecision(state, paper, false)] },
      }] : []),
    ],
  };
}

function createPaymentDecision(state: GameState, paper: Paper, allowReturn = true): PendingEvent {
  const fee = JOURNAL_PUBLICATION_FEES[getJournalTarget(paper)!];
  return {
    ...createFeeStage(paper, "act2", "期刊中稿 ➜ 缴费方式", [
      `《${paper.title}》的版面费为 ${fee} 金币。你翻开缴费单，想了想这笔钱从哪里出。`,
      "可以自己支付，也可以使用导师的科研经费。",
    ].join("\n\n")),
    choices: (["self", "advisor"] as const).map((mode) => ({
      id: mode, label: mode === "self" ? "自费" : "导师经费",
      outcome: `${mode === "self" ? "金币" : "科研经费"} -${fee}`,
      disabledReason: getPaymentDisabledReason(state, mode, fee),
      effects: { enqueueEvents: [createPaymentConfirmation(state, paper, mode, allowReturn)] },
    })),
  };
}

function getRevisionSummary(paper: Paper): string {
  const submitted = [paper.submittedIdea, paper.submittedExperiment, paper.submittedWriting];
  const hasSnapshot = submitted.every((score) => typeof score === "number" && Number.isFinite(score));
  const revised = hasSnapshot && (paper.idea > paper.submittedIdea!
    || paper.experiment > paper.submittedExperiment! || paper.writing > paper.submittedWriting!);
  if (revised) {
    return paper.experiment > paper.submittedExperiment!
      ? "你翻回投稿后的修改记录，补做的实验、重新整理的图表和回复审稿意见的文档还放在一起。那些逐条核对、改完又检查的日子总算有了回音；收好定稿，你接着点开编辑部发来的版面费通知。"
      : "你翻回投稿后的修改记录，重新梳理的论证、改过的段落和回复审稿意见的文档还放在一起。逐条修改时总觉得还有细节没交代清楚，如今终于能把定稿收好，接着处理编辑部发来的版面费通知。";
  }
  return "你想起投稿前整理实验记录、核对图表和反复打磨文字的那些晚上，提交前连图注和参考文献都重新检查了一遍。如今录用通知真的到了，你把稿件和邮件收进同一个文件夹，接着点开编辑部发来的版面费通知。";
}

export function createJournalFeeEvent(state: GameState, paper: Paper): PendingEvent | null {
  if (state.phase !== "playing" || !isEligiblePaper(paper) || hasPaid(state, paper.id)) return null;
  const journal = getJournalDefinition(getJournalTarget(paper)!);
  return {
    ...createFeeStage(paper, "act1", "期刊中稿", [
      `${journal.name}的录用通知到了：《${paper.title}》正式中稿。你盯着邮件里的录用字样看了两遍，又往下翻，确认没有漏掉什么附加要求。直到把消息发出去，才发现自己终于松开了一直握着的鼠标。`,
      getRevisionSummary(paper),
    ].join("\n\n")),
    choices: [{ id: "continue", label: "继续", outcome: "选择缴费方式。",
      effects: { enqueueEvents: [createPaymentDecision(state, paper)] } }],
  };
}

export function refreshJournalFeeEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  const preview = event.journalFeePreview;
  if (!preview) return event;
  const paper = [...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])]
    .find((candidate) => candidate.id === preview.paperId && isEligiblePaper(candidate));
  if (!paper || hasPaid(state, preview.paperId) || state.phase !== "playing") {
    const outcome = hasPaid(state, preview.paperId) ? "版面费已缴清。" : "本次无需缴费。";
    return { ...event, description: outcome, completionLog: outcome, deferredStatePatch: undefined,
      choices: [{ id: "close", label: "确定", outcome, effects: {} }] };
  }
  const refreshed = preview.stage === "act1" ? createJournalFeeEvent(state, paper)!
    : preview.stage === "act2" ? createPaymentDecision(state, paper)
      : createPaymentConfirmation(state, paper, preview.paymentMode ?? "self", true);
  return { ...event, title: refreshed.title, description: refreshed.description,
    completionLog: refreshed.completionLog, choices: refreshed.choices };
}
