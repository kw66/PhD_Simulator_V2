import { createLoverProgressState } from "./v2-lover-progression";
import type { GameState } from "./v2-types";
import {
  getLegacyRelationshipOfType,
  getLegacyRelationshipStats,
  hasLegacyRelationshipProgress,
  isObject,
  looksLikeBasePlaceholder,
} from "./v2-persistence-normalize-relationship-legacy";

export function normalizeLoverProgressState(value: Record<string, unknown>): GameState["loverProgressState"] {
  const baseState = createLoverProgressState();
  const legacyLover = getLegacyRelationshipOfType(value, "lover");
  const legacyLoverStats = getLegacyRelationshipStats(legacyLover);

  const legacyState: GameState["loverProgressState"] = {
    active: legacyLover !== null,
    research:
      typeof legacyLover?.research === "number"
        ? Math.max(0, Math.floor(legacyLover.research))
        : baseState.research,
    intimacy:
      typeof legacyLover?.intimacy === "number"
        ? Math.max(0, Math.floor(legacyLover.intimacy))
        : baseState.intimacy,
    taskProgress:
      typeof legacyLover?.taskProgress === "number"
        ? Math.max(0, Math.floor(legacyLover.taskProgress))
        : baseState.taskProgress,
    taskMax:
      typeof legacyLover?.taskMax === "number"
        ? Math.max(0, Math.floor(legacyLover.taskMax))
        : baseState.taskMax,
    relationProgress:
      typeof legacyLover?.relationProgress === "number"
        ? Math.max(0, Math.floor(legacyLover.relationProgress))
        : baseState.relationProgress,
    relationMax:
      typeof legacyLover?.relationMax === "number"
        ? Math.max(0, Math.floor(legacyLover.relationMax))
        : baseState.relationMax,
    canInteract: legacyLover?.canInteract === true,
    taskUsedThisMonth: legacyLover?.taskUsedThisMonth === true,
    completedTaskCount:
      typeof legacyLover?.loverTasksCompleted === "number"
        ? Math.max(0, Math.floor(legacyLover.loverTasksCompleted))
        : legacyLoverStats && typeof legacyLoverStats.completedCount === "number"
          ? Math.max(0, Math.floor(legacyLoverStats.completedCount))
          : baseState.completedTaskCount,
    interactCount:
      legacyLoverStats && typeof legacyLoverStats.interactCount === "number"
        ? Math.max(0, Math.floor(legacyLoverStats.interactCount))
        : baseState.interactCount,
  };

  if (!isObject(value.loverProgressState)) {
    return legacyState;
  }

  const normalizedState: GameState["loverProgressState"] = {
    active:
      typeof value.loverProgressState.active === "boolean"
        ? value.loverProgressState.active
        : legacyState.active,
    research:
      typeof value.loverProgressState.research === "number"
        ? Math.max(0, Math.floor(value.loverProgressState.research))
        : legacyState.research,
    intimacy:
      typeof value.loverProgressState.intimacy === "number"
        ? Math.max(0, Math.floor(value.loverProgressState.intimacy))
        : legacyState.intimacy,
    taskProgress:
      typeof value.loverProgressState.taskProgress === "number"
        ? Math.max(0, Math.floor(value.loverProgressState.taskProgress))
        : legacyState.taskProgress,
    taskMax:
      typeof value.loverProgressState.taskMax === "number"
        ? Math.max(0, Math.floor(value.loverProgressState.taskMax))
        : legacyState.taskMax,
    relationProgress:
      typeof value.loverProgressState.relationProgress === "number"
        ? Math.max(0, Math.floor(value.loverProgressState.relationProgress))
        : legacyState.relationProgress,
    relationMax:
      typeof value.loverProgressState.relationMax === "number"
        ? Math.max(0, Math.floor(value.loverProgressState.relationMax))
        : legacyState.relationMax,
    canInteract:
      typeof value.loverProgressState.canInteract === "boolean"
        ? value.loverProgressState.canInteract
        : legacyState.canInteract,
    taskUsedThisMonth:
      typeof value.loverProgressState.taskUsedThisMonth === "boolean"
        ? value.loverProgressState.taskUsedThisMonth
        : legacyState.taskUsedThisMonth,
    completedTaskCount:
      typeof value.loverProgressState.completedTaskCount === "number"
        ? Math.max(0, Math.floor(value.loverProgressState.completedTaskCount))
        : legacyState.completedTaskCount,
    interactCount:
      typeof value.loverProgressState.interactCount === "number"
        ? Math.max(0, Math.floor(value.loverProgressState.interactCount))
        : legacyState.interactCount,
  };

  const hasLegacyData = hasLegacyRelationshipProgress(legacyState, baseState, legacyLover !== null);
  return hasLegacyData && looksLikeBasePlaceholder(normalizedState, baseState) ? legacyState : normalizedState;
}
