import type { PendingEvent } from "./v2-types";

export function appendFixedEventHint(
  chainId: string | undefined,
  stage: PendingEvent["stage"],
  description: string,
): string {
  if (stage !== "act1" || !chainId || /(?:备注|小提示)：出现条件：/u.test(description)) return description;
  const conditions: Record<string, string> = {
    "teachers-day": "每年9月",
    scholarship: "第2学年起，每年10月",
    "mentor-assign": "转博后的首个9月",
    "winter-vacation": "每年1月",
    "summer-vacation": "每年7月",
    "year-summary": "每年7月",
    "phd-decision": "硕士第2、3年5月",
  };
  const condition = conditions[chainId]
    ?? (/^ccig-y\d+-m\d+-activity$/u.test(chainId) ? "每年5月，确认参加领域年会后" : undefined)
    ?? (/^ccig-y\d+-m\d+$/u.test(chainId) ? "每年5月" : undefined)
    ?? (chainId.startsWith("advisor-grant-") ? "每年8月，导师有待公布结果的申请" : undefined);
  if (!condition) return description;
  const hint = `小提示：出现条件：${condition}`;
  return description.includes("机制结算")
    ? description.replace("机制结算", `${hint}\n\n机制结算`)
    : `${description}\n\n${hint}`;
}
