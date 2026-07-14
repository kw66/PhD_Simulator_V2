import { describe, expect, it } from "vitest";

import {
  advancePublishedPaperCitations,
  attachPaperPublication,
  applyPublicationPenaltyMultiplier,
  consumeNextPublicationCitationMultiplier,
  createGrantedPublishedPaper,
  createPublicationEffectsState,
  queueNextPublicationCitationMultiplier,
} from "../src/core/v2-publication-rules";
import { createDraftPaper } from "../src/core/v2-paper-rules";

describe("v2 publication rules", () => {
  it("queues and consumes next publication citation multipliers one by one", () => {
    const queued = queueNextPublicationCitationMultiplier(createPublicationEffectsState(), 2);
    const stacked = queueNextPublicationCitationMultiplier(queued, 3);
    const firstConsumed = consumeNextPublicationCitationMultiplier(stacked);
    const secondConsumed = consumeNextPublicationCitationMultiplier(firstConsumed.nextState);

    expect(firstConsumed.multiplier).toBe(2);
    expect(firstConsumed.nextState.nextCitationMultipliers).toEqual([3]);
    expect(firstConsumed.nextState.citationPenaltyMultiplier).toBe(1);
    expect(secondConsumed.multiplier).toBe(3);
    expect(secondConsumed.nextState.nextCitationMultipliers).toEqual([]);
  });

  it("attaches publication metrics when a paper gets published", () => {
    const published = attachPaperPublication(
      { ...createDraftPaper(1, 0), status: "published", target: "C", submittedIdea: 4, submittedExperiment: 4, submittedWriting: 4 },
      2,
    );

    expect(published.publication).toEqual({
      citations: 0,
      monthsSincePublication: 0,
      pendingCitationFraction: 0,
      effectiveScore: 12,
      citationMultiplier: 2,
    });
  });

  it("advances published paper citations with decay and fractional carry", () => {
    const published = attachPaperPublication(
      { ...createDraftPaper(1, 0), status: "published", target: "C", submittedIdea: 8, submittedExperiment: 6, submittedWriting: 6 },
      2,
    );

    const firstMonth = advancePublishedPaperCitations(published);
    const secondMonth = advancePublishedPaperCitations(firstMonth.nextPaper);

    expect(firstMonth.citationGain).toBe(3);
    expect(firstMonth.nextPaper.publication?.pendingCitationFraction).toBeCloseTo(0.8);
    expect(secondMonth.citationGain).toBe(4);
    expect(secondMonth.nextPaper.publication?.citations).toBe(7);
  });
  it("applies permanent global citation penalties", () => {
    const penalized = applyPublicationPenaltyMultiplier(createPublicationEffectsState(), 0.5);
    const published = attachPaperPublication(
      { ...createDraftPaper(1, 0), status: "published", target: "C", submittedIdea: 8, submittedExperiment: 6, submittedWriting: 6 },
      2,
    );

    const firstMonth = advancePublishedPaperCitations(published, penalized.citationPenaltyMultiplier);
    expect(firstMonth.citationGain).toBe(1);
    expect(firstMonth.nextPaper.publication?.pendingCitationFraction).toBeCloseTo(0.9);
  });

  it("creates granted published papers without consuming active slots", () => {
    const granted = createGrantedPublishedPaper(8, 0, { target: "C", acceptedScore: 15 });

    expect(granted.id).toBe("granted-paper-8-1");
    expect(granted.title).toBe("赠送论文 1");
    expect(granted.status).toBe("published");
    expect(granted.target).toBe("C");
    expect((granted.idea + granted.experiment + granted.writing)).toBe(15);
    expect(granted.publication?.effectiveScore).toBe(15);
    expect(granted.publication?.citationMultiplier).toBe(1);
  });

});
