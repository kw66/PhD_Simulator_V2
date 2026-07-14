import type { GameState } from "./v2-types";

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getLegacyRelationshipOfType(
  value: Record<string, unknown>,
  type: "advisor" | "lover",
): Record<string, unknown> | null {
  if (!Array.isArray(value.relationships)) {
    return null;
  }

  const relationship = value.relationships.find((item) => isObject(item) && item.type === type);
  return relationship && isObject(relationship) ? relationship : null;
}

export function getLegacyRelationshipStats(relationship: Record<string, unknown> | null): Record<string, unknown> | null {
  return relationship && isObject(relationship.stats) ? relationship.stats : null;
}

export function getLegacyRelationshipCount(
  value: Record<string, unknown>,
  type: "advisor" | "senior" | "junior" | "peer" | "lover",
): number {
  if (!Array.isArray(value.relationships)) {
    return 0;
  }
  return value.relationships.filter((item) => isObject(item) && item.type === type).length;
}

export function getLegacyFellowTaskType(type: "senior" | "peer" | "junior"): "writing" | "experiment" | "idea" {
  if (type === "senior") return "writing";
  if (type === "peer") return "experiment";
  return "idea";
}

export function hasLegacyRelationshipProgress<T>(legacyState: T, baseState: T, legacyRelationshipExists: boolean): boolean {
  return legacyRelationshipExists && JSON.stringify(legacyState) !== JSON.stringify(baseState);
}

export function looksLikeBasePlaceholder<T>(normalizedState: T, baseState: T): boolean {
  return JSON.stringify(normalizedState) === JSON.stringify(baseState);
}

export function normalizeLegacyFellowProfileValue(
  value: Record<string, unknown>,
): GameState["fellowProgressState"][number] | null {
  if (!(value.type === "senior" || value.type === "peer" || value.type === "junior")) {
    return null;
  }

  const taskType = value.taskType === "writing" || value.taskType === "experiment" || value.taskType === "idea"
    ? value.taskType
    : getLegacyFellowTaskType(value.type);
  const stats = getLegacyRelationshipStats(value);
  return {
    id: typeof value.id === "string" ? value.id : `${value.type}-legacy`,
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    type: value.type,
    research: typeof value.research === "number" ? Math.max(0, Math.floor(value.research)) : 0,
    affinity: typeof value.affinity === "number" ? Math.max(0, Math.min(20, Math.floor(value.affinity))) : 0,
    taskType,
    taskProgress: typeof value.taskProgress === "number" ? Math.max(0, Math.floor(value.taskProgress)) : 0,
    taskMax: typeof value.taskMax === "number" ? Math.max(0, Math.floor(value.taskMax)) : 60,
    relationProgress: typeof value.relationProgress === "number" ? Math.max(0, Math.floor(value.relationProgress)) : 0,
    relationMax: typeof value.relationMax === "number" ? Math.max(0, Math.floor(value.relationMax)) : 40,
    canInteract: value.canInteract === true,
    taskUsedThisMonth: value.taskUsedThisMonth === true,
    completedTaskCount:
      typeof value.completedTaskCount === "number"
        ? Math.max(0, Math.floor(value.completedTaskCount))
        : stats && typeof stats.completedCount === "number"
          ? Math.max(0, Math.floor(stats.completedCount))
          : 0,
    interactCount:
      typeof value.interactCount === "number"
        ? Math.max(0, Math.floor(value.interactCount))
        : stats && typeof stats.interactCount === "number"
          ? Math.max(0, Math.floor(stats.interactCount))
          : 0,
    startTotalMonths:
      typeof value.startTotalMonths === "number"
        ? Math.max(0, Math.floor(value.startTotalMonths))
        : typeof value.addedAt === "number"
          ? Math.max(0, Math.floor(value.addedAt))
          : 0,
  };
}
