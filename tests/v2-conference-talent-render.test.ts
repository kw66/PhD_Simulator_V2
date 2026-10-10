import { describe, expect, it } from "vitest";
import { renderPlayScreen, renderRelationTalentCard } from "../src/app/v2-render-play";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { activateInternship, activateRemoteInternship, createInternshipState } from "../src/core/v2-internship-system";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { GameState, Paper } from "../src/core/v2-types";

function metricValues(html: string): Record<string, string> {
  return Object.fromEntries([...html.matchAll(/<div class="talent-item-metric[^"]*">\s*<span[^>]*>(.*?)<\/span>\s*<strong>(.*?)<\/strong>/gsu)]
    .map((match) => [match[1], match[2]]));
}

function enterpriseCard(state: GameState): string {
  return renderRelationTalentCard(state, "internship", { internshipPage: 1 });
}

function publishedPaper(index: number, nonFirstAuthor = false): Paper {
  return { ...createDraftPaper(1, index), status: "published", target: "A", nonFirstAuthor };
}

function jointCard(state: GameState): string {
  const html = renderPlayScreen({ ...state, totalMonths: Math.max(1, state.totalMonths), month: 1 }, { activePlayTab: "talent", activeTalentTab: "relation" });
  return html.match(/<article\b[^>]*data-talent-item-id="joint-training"[\s\S]*?<\/article>/u)?.[0] ?? "";
}

describe("conference talent cards", () => {
  it("shows ranges without inventing an internship contract", () => {
    const state = createStartedGameState("normal");
    const card = enterpriseCard(state);
    expect(card).toContain("邀约后确定公司与岗位");
    expect(metricValues(card)).toEqual({
      预计月薪: "0～2金", "每月 SAN": "-4～6", 持续时间: "6个月",
      实验加分: "+4～6", 实验倍率: "×1.25", 实验费用: "-2",
    });
    expect(card).not.toContain("data-rel-tooltip");
  });

  it("renders actual offer effects, dynamic first-author income and remaining months", () => {
    const state = createStartedGameState("normal");
    state.internshipState = {
      ...activateInternship({ id: "offer-test", company: "公司<&>", position: "视觉研究实习生", baseMonthlyIncome: 0, monthlySanCost: 6, experimentBonus: 4 }),
      remainingMonths: 2,
    };
    state.papers = [publishedPaper(1), publishedPaper(2, true), { ...publishedPaper(3), status: "draft" }];
    state.externalPublications = [publishedPaper(4)];
    const before = structuredClone(state);
    const card = enterpriseCard(state);
    expect(card).toContain("公司&lt;&amp;&gt;");
    expect(card).toContain("视觉研究实习生");
    expect(metricValues(card)).toEqual({
      每月工资: "2金", "每月 SAN": "-6", 剩余时间: "2个月",
      实验加分: "+4", 实验倍率: "×1.25", 实验费用: "-2",
    });
    expect(state).toEqual(before);
    state.externalPublications.push(...Array.from({ length: 8 }, (_, index) => publishedPaper(index + 5)));
    expect(metricValues(enterpriseCard(state)).每月工资).toBe("6金");
  });

  it("preserves a zero salary and does not present a prior offer as active", () => {
    const state = createStartedGameState("normal");
    const offer = { id: "zero", company: "零基础岗位公司", position: "实习生", baseMonthlyIncome: 0, monthlySanCost: 4, experimentBonus: 6 };
    state.internshipState = activateInternship(offer);
    expect(metricValues(enterpriseCard(state)).每月工资).toBe("0金");
    state.internshipState = createInternshipState();
    state.conferenceCareerState.lastInternshipOffer = offer;
    const card = enterpriseCard(state);
    expect(card).toContain("最近邀约 · 实习生");
    expect(card).toContain("未激活");
    expect(metricValues(card).预计月薪).toBe("0～2金");
  });

  it("keeps remote pending and active rewards separate from enterprise effects", () => {
    const state = createStartedGameState("normal");
    state.internshipState = activateRemoteInternship(state.totalMonths);
    const pending = renderRelationTalentCard(state, "internship");
    expect(pending).toContain("下月开始");
    expect(metricValues(pending)).toEqual({
      每月工资: "1金", "每月 SAN": "-2", 剩余时间: "3个月",
      实验加分: "+4", 实验倍率: "×1", 实验费用: "-1",
    });
    state.totalMonths += 1;
    expect(renderRelationTalentCard(state, "internship")).toContain("已激活");
    expect(metricValues(enterpriseCard(state)).实验加分).toBe("+4～6");
    expect(enterpriseCard(state)).toContain("未激活");
  });

  it.each([[0, "+0～2"], [199, "+0～2"], [200, "+1～3"], [1000, "+5～6"], [1200, "+6"]])(
    "previews joint-training ranges at %i citations", (citations, expectedCap) => {
      const state = createStartedGameState("normal");
      state.totalCitations = citations as number;
      expect(metricValues(jointCard(state))).toEqual({ "想 idea": "+4～6", 写论文: "+4～6", 预计上限: expectedCap });
    },
  );

  it("shows the saved joint-training reward without recalculating it from citations or total cap", () => {
    const state = createStartedGameState("normal");
    state.conferenceEncounterState.bigBullCooperation = true;
    state.conferenceEncounterState.jointTrainingReward = { mentorId: "mentor-test", mentorName: "林<老师>", ideaBonus: 6, writingBonus: 6, capBonus: 3 };
    state.totalCitations = 9000;
    state.researchCapacityState.jointTrainingCitationCapBonus = 6;
    const before = structuredClone(state);
    const card = jointCard(state);
    expect(card).toContain("林&lt;老师&gt;");
    expect(card).toContain("已激活");
    expect(metricValues(card)).toEqual({ "想 idea": "+6", 写论文: "+6", 科研上限: "+3" });
    expect(state).toEqual(before);
  });

  it("preserves both inheritance pages and their compact two-line descriptions", () => {
    const state = createStartedGameState("normal");
    const research = renderRelationTalentCard(state, "lab-mutual-growth", { labInheritancePage: 0 });
    const social = renderRelationTalentCard(state, "lab-mutual-growth", { labInheritancePage: 1 });
    expect(research).toContain("你的当前奖励");
    expect(social).toContain("同学默契原始");
    for (const card of [research, social]) {
      expect(card).toContain('aria-label="查看实验室传承"');
      expect(card.match(/<p class="talent-item-desc">([^<]*)<\/p>/u)?.[1].split("\n")).toHaveLength(2);
    }
  });
});
