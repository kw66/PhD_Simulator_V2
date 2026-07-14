import { createAdvancedConferenceActivityOptions } from "./v2-conference-activity-advanced-options";
import { createBaseConferenceActivityOptions } from "./v2-conference-activity-base-options";
import type {
  ConferenceActivityBuildState,
  ConferenceActivityContext,
  ConferenceActivityOptionDefinition,
} from "./v2-conference-activity-shared";
import { pickDistinctRandomOptions } from "./v2-conference-activity-shared";

export function selectConferenceActivityOptions(
  context: ConferenceActivityContext,
  state: ConferenceActivityBuildState,
  getRoll: () => number = Math.random,
): ConferenceActivityOptionDefinition[] {
  const baseOptions = createBaseConferenceActivityOptions(context, state);
  const advancedOptions = createAdvancedConferenceActivityOptions(state);
  const followUpOptions: ConferenceActivityOptionDefinition[] = [];
  const allOptions = [...baseOptions, ...advancedOptions, ...followUpOptions];

  if (context.grade === "C") {
    return pickDistinctRandomOptions(baseOptions, 3, getRoll);
  }

  if (context.grade === "B") {
    return pickDistinctRandomOptions(allOptions, 4, getRoll);
  }

  const highPriorityOptions = [...advancedOptions, ...followUpOptions];
  const selected = pickDistinctRandomOptions(highPriorityOptions, 2, getRoll);
  if (selected.length === 0) {
    return pickDistinctRandomOptions(baseOptions, 4, getRoll);
  }

  const usedIds = new Set(selected.map((option) => option.id));
  while (selected.length < Math.min(4, allOptions.length)) {
    const remaining = allOptions.filter((option) => !usedIds.has(option.id));
    if (remaining.length === 0) {
      break;
    }

    const [picked] = pickDistinctRandomOptions(remaining, 1, getRoll);
    if (!picked) {
      break;
    }

    selected.push(picked);
    usedIds.add(picked.id);
  }

  return selected;
}
