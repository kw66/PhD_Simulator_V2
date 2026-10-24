import { describe, expect, it } from "vitest";
import { compactRelationshipActivity, summarizeRelationshipActivity } from "../src/app/v2-relationship-activity";

describe("r50 peer assistance card summaries", () => {
  it("keeps the helper and recipient visible despite a long paper title", () => {
    const helping="审稿中，协作进度 +0，订阅豆包 Seed 1（免费），帮助陈同学完善《Graph Neural Networks for Relational Reasoning》：idea +6";
    const receiving="协作进度 +0，林同学帮助完善《Graph Neural Networks for Relational Reasoning》：idea +6，纵向进度 +0";
    expect(summarizeRelationshipActivity(compactRelationshipActivity(helping))).toContain("助陈同学·idea+6");
    expect(summarizeRelationshipActivity(compactRelationshipActivity(receiving))).toContain("获林同学帮助·idea+6");
    expect(helping).toContain("Graph Neural Networks");
  });

  it("compacts polishing separately from the full activity details", () => {
    expect(compactRelationshipActivity("帮助陈同学打磨《Long title》：idea +2、实验 +2"))
      .toEqual(["助陈同学·idea+2、实验+2"]);
    expect(compactRelationshipActivity("林同学帮助打磨《Long title》：idea +2、实验 +2"))
      .toEqual(["获林同学帮助·idea+2、实验+2"]);
  });

  it("preserves existing project, cooperation and normal paper summaries", () => {
    expect(compactRelationshipActivity("论文idea +3，横向进度 +5（项目完成），协作进度 +2"))
      .toEqual(["idea+3","横向+5（结项）","协作+2"]);
  });
});

