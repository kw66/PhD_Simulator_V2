import { describe, expect, it } from "vitest";
import {
  buildAdvisorTaskRewardEvent,
  buildFellowTaskRewardEvent,
  buildLoverTaskRewardEvent,
} from "../src/core/v2-relationship-task-events";
import type { Paper } from "../src/core/v2-types";

function createPaper(overrides: Partial<Paper> & Pick<Paper, "id" | "title" | "status">): Paper {
  return {
    id: overrides.id,
    title: overrides.title,
    idea: overrides.idea ?? 0,
    experiment: overrides.experiment ?? 0,
    writing: overrides.writing ?? 0,
    status: overrides.status,
    target: overrides.target ?? null,
    reviewMonthsLeft: overrides.reviewMonthsLeft ?? 0,
    submittedIdea: overrides.submittedIdea ?? null,
    submittedExperiment: overrides.submittedExperiment ?? null,
    submittedWriting: overrides.submittedWriting ?? null,
    submittedMonth: overrides.submittedMonth ?? null,
    submittedYear: overrides.submittedYear ?? null,
    conferenceHandled: overrides.conferenceHandled,
    publication: overrides.publication,
    receivedRelationshipBonus: overrides.receivedRelationshipBonus,
  };
}

describe("v2 relationship task events", () => {
  it("allows advisor rewards on every non-reviewing paper like old code", () => {
    const event = buildAdvisorTaskRewardEvent({
      totalMonths: 12,
      completedProjectCount: 1,
      paperBonus: 4,
      papers: [
        createPaper({ id: "draft-paper", title: "Draft", status: "draft" }),
        createPaper({ id: "reviewing-paper", title: "Reviewing", status: "reviewing", reviewMonthsLeft: 2 }),
        createPaper({ id: "published-paper", title: "Published", status: "published", target: "A" }),
      ],
    });

    expect(event?.choices.map((choice) => choice.id)).toEqual(["paper-draft-paper", "paper-published-paper", "skip"]);
  });

  it("filters fellow reward targets by the audited task gates", () => {
    const experimentEvent = buildFellowTaskRewardEvent({
      totalMonths: 8,
      profile: {
        id: "peer-1",
        type: "peer",
        research: 4,
        affinity: 3,
        taskType: "experiment",
        taskProgress: 0,
        taskMax: 60,
        relationProgress: 0,
        relationMax: 40,
        canInteract: false,
        taskUsedThisMonth: false,
        completedTaskCount: 1,
        interactCount: 0,
        startTotalMonths: 1,
      },
      papers: [
        createPaper({ id: "no-idea", title: "No Idea", status: "draft", idea: 0, experiment: 2 }),
        createPaper({ id: "has-idea", title: "Has Idea", status: "draft", idea: 1, experiment: 2 }),
        createPaper({ id: "reviewing", title: "Reviewing", status: "reviewing", idea: 5, experiment: 2 }),
      ],
    });

    expect(experimentEvent?.choices.map((choice) => choice.id)).toEqual(["paper-has-idea", "skip"]);
    expect(experimentEvent?.choices[0]?.effects.paperUpdates?.[0]).toMatchObject({
      id: "has-idea",
      experiment: 6,
      receivedRelationshipBonus: true,
    });

    const writingEvent = buildFellowTaskRewardEvent({
      totalMonths: 8,
      profile: {
        id: "senior-1",
        type: "senior",
        research: 5,
        affinity: 2,
        taskType: "writing",
        taskProgress: 0,
        taskMax: 60,
        relationProgress: 0,
        relationMax: 40,
        canInteract: false,
        taskUsedThisMonth: false,
        completedTaskCount: 1,
        interactCount: 0,
        startTotalMonths: 1,
      },
      papers: [
        createPaper({ id: "no-exp", title: "No Exp", status: "draft", experiment: 0, writing: 1 }),
        createPaper({ id: "has-exp", title: "Has Exp", status: "draft", experiment: 3, writing: 1 }),
      ],
    });

    expect(writingEvent?.choices.map((choice) => choice.id)).toEqual(["paper-has-exp", "skip"]);
    expect(writingEvent?.choices[0]?.effects.paperUpdates?.[0]).toMatchObject({
      id: "has-exp",
      writing: 6,
      receivedRelationshipBonus: true,
    });
  });

  it("returns null when lover reward has no non-reviewing target", () => {
    const event = buildLoverTaskRewardEvent({
      totalMonths: 8,
      completedTaskCount: 1,
      paperBonusTotal: 6,
      papers: [createPaper({ id: "reviewing-paper", title: "Reviewing", status: "reviewing", reviewMonthsLeft: 3 })],
    });

    expect(event).toBeNull();
  });

  it("precomputes lover paper updates using lowest-stat distribution", () => {
    const event = buildLoverTaskRewardEvent({
      totalMonths: 8,
      completedTaskCount: 1,
      paperBonusTotal: 4,
      papers: [createPaper({ id: "draft-paper", title: "Draft", status: "draft", idea: 1, experiment: 5, writing: 9 })],
    });

    const choice = event?.choices.find((item) => item.id === "paper-draft-paper");
    expect(choice?.effects.paperUpdates?.[0]).toMatchObject({
      id: "draft-paper",
      idea: 5,
      experiment: 5,
      writing: 9,
      receivedRelationshipBonus: true,
    });
  });
});
