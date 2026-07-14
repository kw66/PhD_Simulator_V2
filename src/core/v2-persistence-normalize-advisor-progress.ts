import { clampAdvisorResearchResource, createAdvisorProgressState } from "./v2-advisor-progress";
import type { GameState } from "./v2-types";
import {
  getLegacyRelationshipOfType,
  getLegacyRelationshipStats,
  hasLegacyRelationshipProgress,
  isObject,
  looksLikeBasePlaceholder,
} from "./v2-persistence-normalize-relationship-legacy";

export function normalizeAdvisorProgressState(value: Record<string, unknown>): GameState["advisorProgressState"] {
  const baseState = createAdvisorProgressState();
  const legacyAdvisor = getLegacyRelationshipOfType(value, "advisor");
  const legacyAdvisorStats = getLegacyRelationshipStats(legacyAdvisor);

  const legacyState: GameState["advisorProgressState"] = {
    researchResource: clampAdvisorResearchResource(
      typeof legacyAdvisor?.researchResource === "number" ? legacyAdvisor.researchResource : baseState.researchResource,
    ),
    affinity:
      typeof legacyAdvisor?.affinity === "number"
        ? Math.max(0, Math.min(20, Math.floor(legacyAdvisor.affinity)))
        : baseState.affinity,
    taskProgress:
      typeof legacyAdvisor?.taskProgress === "number"
        ? Math.max(0, Math.floor(legacyAdvisor.taskProgress))
        : baseState.taskProgress,
    taskMax:
      typeof legacyAdvisor?.taskMax === "number"
        ? Math.max(0, Math.floor(legacyAdvisor.taskMax))
        : baseState.taskMax,
    taskMultiplier:
      typeof legacyAdvisor?.taskMultiplier === "number"
        ? Math.max(0, Math.floor(legacyAdvisor.taskMultiplier))
        : baseState.taskMultiplier,
    relationProgress:
      typeof legacyAdvisor?.relationProgress === "number"
        ? Math.max(0, Math.floor(legacyAdvisor.relationProgress))
        : baseState.relationProgress,
    relationMax:
      typeof legacyAdvisor?.relationMax === "number"
        ? Math.max(0, Math.floor(legacyAdvisor.relationMax))
        : baseState.relationMax,
    canInteract: legacyAdvisor?.canInteract === true,
    taskUsedThisMonth: legacyAdvisor?.taskUsedThisMonth === true,
    completedProjectCount:
      typeof legacyAdvisor?.advisorTasksCompleted === "number"
        ? Math.max(0, Math.floor(legacyAdvisor.advisorTasksCompleted))
        : legacyAdvisorStats && typeof legacyAdvisorStats.completedCount === "number"
          ? Math.max(0, Math.floor(legacyAdvisorStats.completedCount))
          : baseState.completedProjectCount,
    interactCount:
      legacyAdvisorStats && typeof legacyAdvisorStats.interactCount === "number"
        ? Math.max(0, Math.floor(legacyAdvisorStats.interactCount))
        : baseState.interactCount,
  };

  if (!isObject(value.advisorProgressState)) {
    return legacyState;
  }

  const normalizedState: GameState["advisorProgressState"] = {
    researchResource: clampAdvisorResearchResource(
      typeof value.advisorProgressState.researchResource === "number"
        ? value.advisorProgressState.researchResource
        : legacyState.researchResource,
    ),
    affinity:
      typeof value.advisorProgressState.affinity === "number"
        ? Math.max(0, Math.min(20, Math.floor(value.advisorProgressState.affinity)))
        : legacyState.affinity,
    taskProgress:
      typeof value.advisorProgressState.taskProgress === "number"
        ? Math.max(0, Math.floor(value.advisorProgressState.taskProgress))
        : legacyState.taskProgress,
    taskMax:
      typeof value.advisorProgressState.taskMax === "number"
        ? Math.max(0, Math.floor(value.advisorProgressState.taskMax))
        : legacyState.taskMax,
    taskMultiplier:
      typeof value.advisorProgressState.taskMultiplier === "number"
        ? Math.max(0, Math.floor(value.advisorProgressState.taskMultiplier))
        : legacyState.taskMultiplier,
    relationProgress:
      typeof value.advisorProgressState.relationProgress === "number"
        ? Math.max(0, Math.floor(value.advisorProgressState.relationProgress))
        : legacyState.relationProgress,
    relationMax:
      typeof value.advisorProgressState.relationMax === "number"
        ? Math.max(0, Math.floor(value.advisorProgressState.relationMax))
        : legacyState.relationMax,
    canInteract:
      typeof value.advisorProgressState.canInteract === "boolean"
        ? value.advisorProgressState.canInteract
        : legacyState.canInteract,
    taskUsedThisMonth:
      typeof value.advisorProgressState.taskUsedThisMonth === "boolean"
        ? value.advisorProgressState.taskUsedThisMonth
        : legacyState.taskUsedThisMonth,
    completedProjectCount:
      typeof value.advisorProgressState.completedProjectCount === "number"
        ? Math.max(0, Math.floor(value.advisorProgressState.completedProjectCount))
        : legacyState.completedProjectCount,
    interactCount:
      typeof value.advisorProgressState.interactCount === "number"
        ? Math.max(0, Math.floor(value.advisorProgressState.interactCount))
        : legacyState.interactCount,
  };

  const hasLegacyData = hasLegacyRelationshipProgress(legacyState, baseState, legacyAdvisor !== null);
  return hasLegacyData && looksLikeBasePlaceholder(normalizedState, baseState) ? legacyState : normalizedState;
}
