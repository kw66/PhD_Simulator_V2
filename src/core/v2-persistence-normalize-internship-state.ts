import { createInternshipState } from "./v2-internship-system";
import {
  getLegacyInternshipExperimentMultiplier,
  isObject,
} from "./v2-persistence-normalize-life-shared";
import type { GameState } from "./v2-types";

export function normalizeInternshipState(value: Record<string, unknown>): GameState["internshipState"] {
  const baseState = createInternshipState();
  const currentInternship = isObject(value.currentInternship) ? value.currentInternship : null;
  const legacyRemainingMonths = currentInternship && typeof currentInternship.remainingMonths === "number"
    ? Math.max(0, Math.floor(currentInternship.remainingMonths))
    : 0;
  const hasLegacyActiveInternship = value.ailabInternship === true && currentInternship && legacyRemainingMonths > 0;

  if (isObject(value.internshipState) && !hasLegacyActiveInternship) {
    const active = value.internshipState.active === true;
    return {
      active,
      remainingMonths: typeof value.internshipState.remainingMonths === "number"
        ? Math.max(0, Math.floor(value.internshipState.remainingMonths))
        : baseState.remainingMonths,
      startTotalMonths: typeof value.internshipState.startTotalMonths === "number"
        ? value.internshipState.startTotalMonths
        : null,
      experimentMultiplier:
        typeof value.internshipState.experimentMultiplier === "number"
          && Number.isFinite(value.internshipState.experimentMultiplier)
          && value.internshipState.experimentMultiplier > 0
          ? value.internshipState.experimentMultiplier
          : active
            ? 1.25
            : baseState.experimentMultiplier,
    };
  }

  if (!hasLegacyActiveInternship || !currentInternship) {
    return baseState;
  }

  return {
    active: true,
    remainingMonths: legacyRemainingMonths,
    startTotalMonths: typeof currentInternship.startMonth === "number" ? currentInternship.startMonth : null,
    experimentMultiplier: getLegacyInternshipExperimentMultiplier(value),
  };
}
