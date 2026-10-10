import { createAdvancedConferenceActivityOptions } from "./v2-conference-activity-advanced-options";
import { createBaseConferenceActivityOptions } from "./v2-conference-activity-base-options";
import type { ConferenceActivityBuildState, ConferenceActivityContext, ConferenceActivityOptionDefinition } from "./v2-conference-activity-shared";
import { pickDistinctRandomOptions } from "./v2-conference-activity-shared";

export function getConferenceActivityOptions(
  context: ConferenceActivityContext,
  state: ConferenceActivityBuildState,
  rolls: readonly number[],
): ConferenceActivityOptionDefinition[] {
  let attributeIndex = 12;
  let personIndex = 8;
  return [
    ...createBaseConferenceActivityOptions(context, state, () => rolls[attributeIndex++] ?? 0.5),
    ...(context.grade === "C" ? [] : createAdvancedConferenceActivityOptions(state, () => rolls[personIndex++] ?? 0.5, context)),
  ];
}

export function selectConferenceActivityOptions(
  context: ConferenceActivityContext,
  state: ConferenceActivityBuildState,
  getRoll: () => number = Math.random,
): ConferenceActivityOptionDefinition[] {
  const rolls = Array.from({ length: 32 }, () => getRoll());
  const options = getConferenceActivityOptions(context, state, rolls);
  let menuIndex = 0;
  return pickDistinctRandomOptions(options, context.grade === "C" ? 3 : context.grade === "B" ? 4 : 5,
    () => rolls[menuIndex++] ?? 0.5);
}
