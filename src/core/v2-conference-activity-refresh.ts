import { getConferenceActivityOptions } from "./v2-conference-activity-options";
import type { ConferenceActivityPreview } from "./v2-conference-activity-shared";
import { getRoleDefinition } from "./v2-progression";
import { createConferenceActivityDecisionEvent, createConferenceActivityEvent, createConferenceActivityResult } from "./v2-conference-activity-events";
import type { GameState, PendingEvent } from "./v2-types";

export function refreshConferenceActivityEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  const preview: ConferenceActivityPreview | undefined = event.conferenceActivityPreview;
  if (!preview) return event;
  const current = { ...state, research: state.player.research, social: state.player.social,
    playerGender: getRoleDefinition(state.selectedRoleId).gender };
  let rollIndex = 0;
  const getRoll = () => preview.rolls[rollIndex++] ?? 0.5;
  let fresh: PendingEvent;
  if (event.stage === "act1") {
    fresh = createConferenceActivityEvent(preview.context, current, [preview.attendanceSummary], getRoll, preview);
  } else if (event.stage === "act2") {
    fresh = createConferenceActivityDecisionEvent(preview.context, current, preview.attendanceSummary, getRoll, preview);
  } else if (event.stage === "result" && preview.selectedOptionId) {
    const encounter = current.conferenceEncounterState;
    const mentor = preview.selectedOptionId === "big-bull-coop" ? preview.contacts?.bigBull : undefined;
    const scholars = { ...encounter.scholars };
    const selectedType = (preview.rolls[8] ?? 0.5) < 0.5 ? "beautiful" : "smart";
    let contactReplaced = Boolean(mentor && encounter.bigBull && mentor.id !== encounter.bigBull.id);
    for (const type of preview.selectedOptionId === "opposite-scholar" ? [selectedType] as const : []) {
      const contact = preview.contacts?.scholars?.[type];
      if (contact && scholars[type] && contact.id !== scholars[type].id) contactReplaced = true;
      if (contact && !scholars[type]) scholars[type] = contact;
    }
    const options = getConferenceActivityOptions(preview.context, { ...current, conferenceEncounterState: {
      ...encounter,
      bigBull: encounter.bigBull ?? mentor,
      scholars,
    } }, preview.rolls);
    const selected = contactReplaced ? undefined : options.find((option) => option.id === preview.selectedOptionId);
    fresh = selected ? createConferenceActivityResult(preview.context, selected, preview.attendanceSummary, preview) : {
      ...event,
      description: "你的近况已经发生变化，原先的活动安排不再适合。翻开议程，你决定重新选一项参加。",
      completionLog: undefined,
      choices: [{
        id: "change-activity",
        label: "重新选择",
        outcome: "返回会场活动选择。",
        effects: { enqueueEvents: [createConferenceActivityDecisionEvent(preview.context, current, preview.attendanceSummary, getRoll, preview)] },
      }],
    };
  } else return event;
  return {
    ...event,
    title: fresh.title,
    description: fresh.description,
    completionLog: fresh.completionLog,
    choices: fresh.choices,
    conferenceActivityPreview: fresh.conferenceActivityPreview,
    deferredStatePatch: undefined,
  };
}
