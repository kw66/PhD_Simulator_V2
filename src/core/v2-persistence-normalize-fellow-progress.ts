import type { GameState } from "./v2-types";
import {
  isObject,
  normalizeLegacyFellowProfileValue,
} from "./v2-persistence-normalize-relationship-legacy";

export function normalizeFellowProgressState(value: Record<string, unknown>): GameState["fellowProgressState"] {
  const legacyProfiles = Array.isArray(value.relationships)
    ? value.relationships
      .filter((item): item is Record<string, unknown> => isObject(item) && (item.type === "senior" || item.type === "peer" || item.type === "junior"))
      .map((item) => normalizeLegacyFellowProfileValue(item))
      .filter((item): item is GameState["fellowProgressState"][number] => item !== null)
    : [];

  if (!Array.isArray(value.fellowProgressState)) {
    return legacyProfiles;
  }

  const normalizedProfiles = value.fellowProgressState
    .filter((item): item is Record<string, unknown> => isObject(item))
    .map((item) => normalizeLegacyFellowProfileValue(item))
    .filter((item): item is GameState["fellowProgressState"][number] => item !== null);

  return normalizedProfiles.length === 0 && legacyProfiles.length > 0 ? legacyProfiles : normalizedProfiles;
}
