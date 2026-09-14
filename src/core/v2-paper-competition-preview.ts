import { previewPaperCompetitionResolution } from "./v2-paper-competition";
import type { GameState, PendingEvent } from "./v2-types";

export function refreshPaperCompetitionEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  if (!event.paperCompetitionTargetId) return event;
  let description = event.description;
  let completionLog = event.completionLog;
  const choices = event.choices.map((choice) => {
    let outcome = choice.outcome;
    const resolution = choice.effects.paperCompetitionResolution;
    if (resolution) {
      const preview = previewPaperCompetitionResolution(state, resolution);
      outcome = preview.resolvedOutcome;
      const story = event.paperCompetitionResult?.description ?? event.description.split("\n\n机制结算\n")[0];
      const paperTitle = preview.paper?.title ?? event.paperCompetitionResult?.paperTitle;
      const paperLine = paperTitle ? `\n\n涉及论文：**《${paperTitle}》**` : "";
      const reviewNote = preview.applicable && preview.paper?.status === "reviewing"
        ? "\n\n小提示：本轮审稿仍按投稿分数；若被拒稿，将保留本次调整，再叠加审稿反馈。"
        : "";
      description = `${preview.applicable ? story : "你重新核对了目标稿件。它已不再受这次竞争影响，可以继续原来的安排。"}${paperLine}${reviewNote}\n\n机制结算\n${outcome}`;
      const label = event.paperCompetitionResult?.choiceLabel;
      completionLog = `${label ? `${label}：` : ""}${paperTitle ? `《${paperTitle}》｜` : ""}${outcome}`;
    }
    const followUps = choice.effects.enqueueEvents;
    const updatedFollowUps = followUps?.map((followUp) => refreshPaperCompetitionEvent(state, followUp));
    if (event.stage === "act2") {
      const result = updatedFollowUps?.find((followUp) => followUp.stage === "result" && followUp.paperCompetitionTargetId === event.paperCompetitionTargetId);
      outcome = result?.choices[0]?.outcome ?? outcome;
    }
    const changedFollowUps = updatedFollowUps?.some((followUp, index) => followUp !== followUps?.[index]);
    return outcome === choice.outcome && !changedFollowUps ? choice : {
      ...choice,
      outcome,
      effects: changedFollowUps ? { ...choice.effects, enqueueEvents: updatedFollowUps } : choice.effects,
    };
  });
  return description === event.description && completionLog === event.completionLog
    && choices.every((choice, index) => choice === event.choices[index]) ? event : {
      ...event,
      description,
      completionLog,
      choices,
    };
}

export function refreshPaperCompetitionEvents(state: GameState): GameState {
  const eventQueue = state.eventQueue.map((event) => refreshPaperCompetitionEvent(state, event));
  return eventQueue.every((event, index) => event === state.eventQueue[index]) ? state : { ...state, eventQueue };
}
