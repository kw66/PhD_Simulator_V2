import { describe, expect, it } from "vitest";

import {
  attachPaperPublication,
  createGrantedPublishedPaper,
} from "../src/core/v2-publication-rules";
import { createDraftPaper } from "../src/core/v2-paper-rules";

describe("v2 publication rules", () => {
  it("attaches publication metrics when a paper gets published", () => {
    const published = attachPaperPublication(
      { ...createDraftPaper(1, 0), status: "published", target: "C", submittedIdea: 4, submittedExperiment: 4, submittedWriting: 4 },
      2,
    );

    expect(published.publication).toEqual({
      citations: 0,
      effectiveScore: 12,
      citationDebuffMultiplier: 2,
      promotionMultiplier: 1,
    });
  });

  it("creates granted published papers without consuming active slots", () => {
    const granted = createGrantedPublishedPaper(8, 0, { target: "C", acceptedScore: 15 });

    expect(granted.id).toBe("granted-paper-8-1");
    expect(granted.title).toBe("赠送论文 1");
    expect(granted.status).toBe("published");
    expect(granted.target).toBe("C");
    expect((granted.idea + granted.experiment + granted.writing)).toBe(15);
    expect(granted.publication?.effectiveScore).toBe(15);
    expect(granted.publication?.citationDebuffMultiplier).toBe(1);
    expect(granted.publication?.promotionMultiplier).toBe(1);
  });

  it("preserves a zero citation multiplier", () => {
    const paper = createGrantedPublishedPaper(1, 0, {
      target: "C",
      acceptedScore: 3,
      citationDebuffMultiplier: 0,
    });

    expect(paper.publication?.citationDebuffMultiplier).toBe(0);
  });

});
