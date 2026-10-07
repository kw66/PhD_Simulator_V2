import { getJournalDefinition } from "./v2-journal-system";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export const JOURNAL_PUBLICATION_FEES = { pami: 5, nmi: 10, nature: 20 } as const;
type JournalFeePayment = NonNullable<EventChoice["effects"]["journalFeePayment"]>;
const EVENT_PREFIX = "journal-fee:";

function getUnpaidPlayerJournal(state: GameState, paperId: string) {
  if (state.advisorProgressState.paidJournalPaperIds?.includes(paperId)) return null;
  const paper = state.externalPublications.find((entry) => entry.id === paperId)
    ?? state.papers.find((entry) => entry.id === paperId);
  if (!paper || paper.status !== "published" || paper.nonFirstAuthor
    || (paper.leadAuthorId && paper.leadAuthorId !== "player")) return null;
  const journal = paper.journalTarget ?? paper.publication?.journalTarget;
  if (!journal || !Object.hasOwn(JOURNAL_PUBLICATION_FEES, journal)) return null;
  return { paper, journal, fee: JOURNAL_PUBLICATION_FEES[journal] };
}

export function createJournalFeeEvent(state: GameState, paperId: string): PendingEvent | null {
  const publication = getUnpaidPlayerJournal(state, paperId);
  if (state.phase !== "playing" || !publication) return null;
  const { paper, journal, fee } = publication;
  const labWarning = state.advisorProgressState.funding <= fee
    ? "选择实验室支付会使经费归零，触发实验室破产；自费不扣实验室经费。" : "";
  return {
    id: `${EVENT_PREFIX}${paperId}`, chainId: `${EVENT_PREFIX}${paperId}`,
    journalFeePaperId: paperId,
    title: "期刊版面费", source: "fixed", stage: "act2", blocking: true, deadlineMonths: 0,
    description: `《${paper.title}》已发表${getJournalDefinition(journal).name}，需支付版面费 ${fee} 金币。请选择自费或实验室经费支付，无导师好感消耗。${labWarning ? `\n\n${labWarning}` : ""}`,
    choices: [{
      id: "self", label: "自费支付", outcome: `《${paper.title}》${getJournalDefinition(journal).name}版面费：自费，金币 -${fee}。`,
      disabledReason: state.player.money >= fee ? undefined : `金币不足，需要 ${fee} 金币，当前 ${state.player.money} 金币。`,
      effects: { journalFeePayment: { paperId, payer: "self" } },
    }, {
      id: "lab", label: "实验室经费支付", outcome: `《${paper.title}》${getJournalDefinition(journal).name}版面费：实验室经费 -${fee}。${labWarning}`,
      disabledReason: !state.selectedAdvisorName ? "尚未确定导师，无法使用实验室经费。" : undefined,
      effects: { journalFeePayment: { paperId, payer: "lab" } },
    }],
  };
}

export function refreshJournalFeeEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  if (!event.journalFeePaperId) return event;
  const paperId = event.journalFeePaperId;
  const fresh = createJournalFeeEvent(state, paperId);
  if (fresh) return { ...event, ...fresh };
  const message = state.advisorProgressState.paidJournalPaperIds?.includes(paperId)
    ? "该论文版面费已支付，无需重复支付。" : "该论文当前无需支付版面费。";
  return { ...event, title: "期刊版面费", description: message,
    choices: [{ id: "close", label: "关闭", outcome: message, effects: {} }] };
}

export function settleJournalFeePayment(state: GameState, payment: JournalFeePayment): GameState {
  if (state.phase !== "playing" || !payment || (payment.payer !== "self" && payment.payer !== "lab")) return state;
  const publication = getUnpaidPlayerJournal(state, payment.paperId);
  if (!publication) return state;
  const { paper, fee } = publication;
  if (payment.payer === "self" ? !(state.player.money >= fee)
    : !state.selectedAdvisorName) return state;
  return { ...state,
    player: payment.payer === "self" ? { ...state.player, money: state.player.money - fee } : state.player,
    advisorProgressState: { ...state.advisorProgressState,
      funding: payment.payer === "lab" ? Math.max(0, state.advisorProgressState.funding - fee) : state.advisorProgressState.funding,
      paidJournalPaperIds: [...(state.advisorProgressState.paidJournalPaperIds ?? []), paper.id],
    },
  };
}
