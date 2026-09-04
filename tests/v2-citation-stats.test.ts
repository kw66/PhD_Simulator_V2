import { describe, expect, it } from "vitest";

import { calculateHIndex, getCitationStats } from "../src/core/v2-citation-stats";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";

function publishedPaper(index: number, citations: number) {
  const paper = createGrantedPublishedPaper(1, index, {
    target: "C",
    acceptedScore: 10,
  });
  return {
    ...paper,
    publication: paper.publication ? { ...paper.publication, citations } : null,
  };
}

describe("v2 citation stats", () => {
  it("calculates h-index and i10-index from all published papers", () => {
    expect(calculateHIndex([12, 5, 3, 1])).toBe(3);

    const stats = getCitationStats(
      [publishedPaper(0, 12), publishedPaper(1, 5), publishedPaper(2, 3), publishedPaper(3, 1)],
      21,
      { 2023: 7, 2024: 8, 2025: 6 },
      2025,
    );

    expect(stats).toMatchObject({ totalCitations: 21, hIndex: 3, i10Index: 1, startYear: 2023 });
  });

  it("assigns citations missing from the yearly ledger to the current calendar year", () => {
    const stats = getCitationStats([], 10, { 2023: 2, 2024: 4 }, 2025);

    expect(stats.annualCitations).toEqual([
      { year: 2023, citations: 2 },
      { year: 2024, citations: 4 },
      { year: 2025, citations: 4 },
    ]);
  });
});
