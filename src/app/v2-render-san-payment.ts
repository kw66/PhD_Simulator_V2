import { formatSanPayment, type SanPaymentQuote } from "../core/v2-role-talent-costs";
import { renderAnimatedNumber } from "./v2-render-animation";

export function renderSanPayment(quote: SanPaymentQuote, alphaCapCost = 0, identity?: string, spaced = false): string {
  const amount = (key: string, value: number): string => identity ? renderAnimatedNumber(`${identity}:${key}`, value) : String(value);
  const gap = spaced ? " " : "";
  const capCost = quote.sanCapCost + alphaCapCost;
  const text = [quote.sanCost > 0 ? `SAN${gap}-${amount("san-cost", quote.sanCost)}` : "",
    quote.moneyCost > 0 ? `金币${gap}-${amount("money-cost", quote.moneyCost)}` : "",
    capCost > 0 ? `SAN上限${gap}-${amount("san-cap-cost", capCost)}` : ""].filter(Boolean).join(" · ") || `SAN${gap}-${amount("san-cost", 0)}`;
  if (!quote.usesBeta && quote.moneyCost === 0 && alphaCapCost === 0) return text;
  const detail = [formatSanPayment(quote), alphaCapCost > 0 ? `SAN上限 -${alphaCapCost}（燃烧生命α）` : ""].filter(Boolean).join("，");
  return `<span title="${detail}">${text}</span>`;
}
