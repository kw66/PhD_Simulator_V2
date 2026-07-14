import { describe, expect, it } from "vitest";

import {
  createDraftPaper,
  getUnlockedPaperSlotCount,
  getPaperEffortTotal,
  getReviewMonths,
  getSubmitReadyThreshold,
  markPaperReviewing,
  resolvePaperReview,
  shouldMarkSlotPublishedA,
} from "../src/core/v2-paper-rules";

describe("v2 paper rules", () => {
  it("创建草稿论文时生成稳定初始结构", () => {
    expect(createDraftPaper(7, 1)).toEqual({
      id: "paper-7-2",
      title: "论文 2",
      idea: 0,
      experiment: 0,
      writing: 0,
      status: "draft",
      target: null,
      reviewMonthsLeft: 0,
      submittedIdea: null,
      submittedExperiment: null,
      submittedWriting: null,
      submittedMonth: null,
      submittedYear: null,
      conferenceHandled: false,
      publication: null,
    });
  });

  it("投稿前准备线与审稿月数来自统一规则源", () => {
    expect(getSubmitReadyThreshold("C")).toBe(6);
    expect(getSubmitReadyThreshold("A")).toBe(18);
    expect(getReviewMonths("B")).toBe(4);
  });

  it("投稿时会冻结快照，并按快照进行审稿结算", () => {
    const reviewingPaper = markPaperReviewing(
      {
        id: "p1",
        title: "论文 1",
        idea: 4,
        experiment: 4,
        writing: 4,
        status: "draft",
        target: null,
        reviewMonthsLeft: 0,
        submittedIdea: null,
        submittedExperiment: null,
        submittedWriting: null,
        submittedMonth: null,
        submittedYear: null,
        conferenceHandled: false,
      },
      "C",
      7,
      1,
    );

    expect(reviewingPaper.status).toBe("reviewing");
    expect(reviewingPaper.reviewMonthsLeft).toBe(4);
    expect(reviewingPaper.submittedIdea).toBe(4);
    expect(reviewingPaper.submittedExperiment).toBe(4);
    expect(reviewingPaper.submittedWriting).toBe(4);
    expect(reviewingPaper.submittedMonth).toBe(7);
    expect(reviewingPaper.submittedYear).toBe(1);
    expect(reviewingPaper.conferenceHandled).toBe(false);
    expect(getPaperEffortTotal(reviewingPaper)).toBe(12);

    const accepted = resolvePaperReview({ ...reviewingPaper, idea: 0, experiment: 0, writing: 0 }, 1, "level5");
    expect(accepted.nextPaper.status).toBe("published");
    expect(accepted.scoreGain).toBe(1);

    const rejected = resolvePaperReview(
      markPaperReviewing({ ...reviewingPaper, idea: 1, experiment: 1, writing: 1 }, "A", 8, 1),
      0,
      "level5",
    );
    expect(rejected.nextPaper.status).toBe("draft");
    expect(rejected.nextPaper.target).toBeNull();
    expect(rejected.nextPaper.writing).toBe(0);
    expect(rejected.nextPaper.submittedIdea).toBeNull();
    expect(rejected.nextPaper.submittedExperiment).toBeNull();
    expect(rejected.nextPaper.submittedWriting).toBeNull();
    expect(rejected.nextPaper.submittedMonth).toBeNull();
    expect(rejected.nextPaper.submittedYear).toBeNull();
    expect(rejected.nextPaper.conferenceHandled).toBe(false);
  });

  it("基础论文槽位按科研值门槛解锁，A 类只负责槽位标记", () => {
    expect(getUnlockedPaperSlotCount(0)).toBe(1);
    expect(getUnlockedPaperSlotCount(6)).toBe(2);
    expect(getUnlockedPaperSlotCount(12)).toBe(3);
    expect(getUnlockedPaperSlotCount(18)).toBe(4);

    expect(shouldMarkSlotPublishedA({ id: "p1", title: "论文 1", idea: 0, experiment: 0, writing: 0, status: "published", target: "A", reviewMonthsLeft: 0, submittedIdea: 10, submittedExperiment: 10, submittedWriting: 10, submittedMonth: 1, submittedYear: 1, conferenceHandled: false })).toBe(true);
    expect(shouldMarkSlotPublishedA({ id: "p1", title: "论文 1", idea: 0, experiment: 0, writing: 0, status: "published", target: "B", reviewMonthsLeft: 0, submittedIdea: 10, submittedExperiment: 10, submittedWriting: 10, submittedMonth: 1, submittedYear: 1, conferenceHandled: false })).toBe(false);
  });
});