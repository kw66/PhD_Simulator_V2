import { STUDY_FATIGUE_RESEARCH_COSTS } from "../core/v2-study-fatigue";
import { formatMoney } from "../core/v2-money";

/** Enrich saved result copy without rewriting history or changing replay digests. */
export function formatEventResultResistance(description: string, choiceId?: string): string {
  const option = choiceId?.match(/^random-19-(travel|sport|friends|money)-/u)?.[1] as keyof typeof STUDY_FATIGUE_RESEARCH_COSTS | undefined;
  if (!option) return description;
  const marker = description.indexOf("机制结算");
  if (marker < 0) return description;
  const result = description.slice(marker).replace(/科研\s+(-\d+(?:\.\d+)?)(?![\d.])/u, (text, change: string, offset: number, source: string) => {
    if (/^[（(]/u.test(source.slice(offset + text.length))) return text;
    const resisted = Number((STUDY_FATIGUE_RESEARCH_COSTS[option] + Number(change)).toFixed(10));
    return resisted > 0 ? `${text}（抵抗${formatMoney(resisted)}）` : text;
  });
  return description.slice(0, marker) + result;
}
