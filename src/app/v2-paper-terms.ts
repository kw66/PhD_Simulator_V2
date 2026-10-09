import type { PaperAcceptType, PaperReviewDecision } from "../core/v2-types";

export const PAPER_TERM_TRANSLATIONS: Record<PaperAcceptType | PaperReviewDecision | "PC Meta Review", string> = {
  Accept: "接收",
  Borderline: "边缘，尚未明确接收或拒稿",
  Reject: "拒稿",
  Poster: "海报展示",
  Spotlight: "亮点报告",
  Oral: "口头报告",
  "Best Paper Candidate": "最佳论文候选",
  "Best Paper": "最佳论文",
  "PC Meta Review": "程序委员会综合评审意见",
};

export function renderPaperTerm(term: keyof typeof PAPER_TERM_TRANSLATIONS): string {
  return `<span class="play-tooltip paper-term" tabindex="0" data-tooltip="${PAPER_TERM_TRANSLATIONS[term]}">${term}</span>`;
}
