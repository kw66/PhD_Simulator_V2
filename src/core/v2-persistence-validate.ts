import type { PendingDecision, PendingEvent } from "./v2-types";

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isValidPendingEvent(value: unknown): value is PendingEvent {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.preview === "string" &&
    typeof value.source === "string" &&
    typeof value.blocking === "boolean" &&
    typeof value.deadlineMonths === "number" &&
    typeof value.chainId === "string" &&
    typeof value.stage === "string" &&
    Array.isArray(value.choices)
  );
}

export function isValidPendingDecision(value: unknown): value is PendingDecision {
  return (
    isObject(value) &&
    value.kind === "phd-transfer" &&
    typeof value.requiredScore === "number" &&
    typeof value.year === "number"
  );
}

export function hasGameStateBaseShape(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  return (
    typeof value.phase === "string" &&
    typeof value.selectedRoleId === "string" &&
    (typeof value.selectedAdvisorId === "string" || value.selectedAdvisorId === null) &&
    typeof value.degree === "string" &&
    typeof value.year === "number" &&
    typeof value.month === "number" &&
    typeof value.totalMonths === "number" &&
    typeof value.maxMonths === "number" &&
    typeof value.actionsRemaining === "number" &&
    typeof value.maxActionsPerMonth === "number" &&
    typeof value.paperSlotsUnlocked === "number" &&
    (typeof value.graduationScoreTarget === "number" || value.graduationScoreTarget === null) &&
    typeof value.totalResearchScore === "number" &&
    Array.isArray(value.papers) &&
    Array.isArray(value.log) &&
    isObject(value.player)
  );
}
