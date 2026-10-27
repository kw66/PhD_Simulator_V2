import { describe, expect, it, vi } from "vitest";
import { renderGraduationCards, renderThesisReviewReports } from "../src/app/v2-render-graduation";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCareerRecruitmentEvent } from "../src/core/v2-monthly-career-events";
import { getCareerAbility } from "../src/core/v2-career-rules";
import { formatMoney } from "../src/core/v2-money";
import { prepareThesisBlindReview, syncThesisState, THESIS_REVIEW_THRESHOLDS } from "../src/core/v2-thesis-rules";
import type { Degree, GameState, PendingEvent } from "../src/core/v2-types";

function graduationState(degree: Degree = "master", month = 1): GameState {
  const year = degree === "master" ? 3 : 6;
  const base = createInitialState();
  return syncThesisState({ ...base, phase: "playing", degree, year, month,
    totalMonths: (year - 1) * 12 + month, graduationScoreTarget: 1, totalResearchScore: 1,
    player: { ...base.player, research: 12.9 },
  }, () => 0.5);
}

function buttons(html: string, action: string): string[] {
  return html.match(new RegExp(`<button\\b[^>]*data-action="${action}"[^>]*>[\\s\\S]*?<\\/button>`, "g")) ?? [];
}

function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
}

function reviewPresentation(degree: Degree): NonNullable<PendingEvent["thesisReviewPresentation"]> {
  let state = graduationState(degree, 8);
  state.thesis.researchPoints = state.thesis.researchPoints.map((point) => ({ ...point, score: 200.005 }));
  state = prepareThesisBlindReview(state, () => 0.5);
  return { stage: "reports", degree, title: state.thesis.title, pointScores: state.thesis.researchPoints.map((point) => point.score),
    scoreHistory: state.thesis.scoreHistory, review: state.thesis.review! };
}

describe("graduation workstation cards", () => {
  it.each(["master", "phd"] as const)("renders compact %s points with two-tone bars and inline A/B header references", (degree) => {
    const state = graduationState(degree);
    state.thesis.researchPoints[0] = { ...state.thesis.researchPoints[0]!, initialScore: 60, score: 84 };
    const html = renderGraduationCards(state);
    expect(html).not.toContain("thesis-forecast");
    expect(html).toContain('data-thesis-initial-score="60"');
    expect(html.match(/data-graduation-point="\d+"/g)).toHaveLength(3);
    const points = html.match(/<div class="graduation-point"[\s\S]*?<\/button>\s*<\/div>/g) ?? [];
    expect(points).toHaveLength(degree === "master" ? 2 : 3);
    points.forEach((point, index) => {
      expect(point.match(/class="rel-detail-label"/g)).toHaveLength(1);
      expect(point).toContain(`>研究点${index + 1}</span>`);
      expect(point.match(/class="rel-progress-bar graduation-point-bar"/g)).toHaveLength(1);
      expect(point.match(/class="rel-progress-val"/g)).toHaveLength(1);
      expect(buttons(point, "advance-thesis-point")).toHaveLength(1);
      expect(point).toMatch(/rel-detail-label[\s\S]*graduation-point-bar[\s\S]*rel-progress-val[\s\S]*<button/);
      expect(point).toContain('class="rel-progress-fill research graduation-original"');
      expect(point).toContain('class="rel-progress-fill cooperation graduation-improved"');
      expect(point).not.toContain("data-thesis-grade");
    });
    const scale = Math.ceil(THESIS_REVIEW_THRESHOLDS[degree].A / 3 * 2);
    expect(points[0]).toContain(`aria-valuemax="${scale}"`);
    expect(points[0]).toMatch(new RegExp(`graduation-original"[^>]*style="width:${formatMoney(60 / scale * 100)}%"`));
    expect(points[0]).toMatch(new RegExp(`graduation-improved"[^>]*style="width:${formatMoney(24 / scale * 100)}%"`));
    expect(html).not.toContain("graduation-baselines");
    expect(html.match(/class="graduation-reference"/g)).toHaveLength(1);
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)![0];
    expect(header).toContain(`id="graduation-thesis-title"><span class="rel-inline-icon" aria-hidden="true">📘</span>${degree === "master" ? "硕士" : "博士"}毕业论文</strong>`);
    expect(header).toMatch(/<strong\b[^>]*>[\s\S]*?<\/strong><span class="graduation-reference"[\s\S]*<span class="graduation-status">/);
    expect(header).not.toContain("is-countdown");
    expect(visibleText(header)).toContain("7月后盲审");
    expect([...header.matchAll(/data-thesis-grade="([ABC])"/g)].map((match) => match[1])).toEqual(["A", "B"]);
    for (const grade of ["A", "B"] as const) {
      expect(html.match(new RegExp(`data-thesis-grade="${grade}"`, "g"))).toHaveLength(1);
      expect(header).toContain(`data-thesis-grade="${grade}" data-thesis-threshold="${formatMoney(THESIS_REVIEW_THRESHOLDS[degree][grade] / 3)}"`);
    }
    const heading = html.match(/<div class="graduation-thesis-heading">[\s\S]*?<\/div>/)![0];
    expect(visibleText(heading)).toContain(state.thesis.title);
    expect(heading).toContain(`class="paper-topic-tag">${state.thesis.topicLabel}</span>`);
    expect(heading).not.toContain("graduation-color-key");
    expect(heading).not.toMatch(/<svg\b|<i\b|data-lucide/);
    expect(header).not.toContain("graduation-color-key");
    expect(html).toMatch(/<\/header>\s*<div class="graduation-thesis-heading">/);
    expect(html).toContain("各研究点同分时的参考线");
  });
  it.each(["master", "phd"] as const)("locks both cards until %s graduation September", (degree) => {
    const state = graduationState(degree);
    const previousAugust = { ...state, year: state.year - 1, month: 12, totalMonths: state.totalMonths - 1 };
    const html = renderGraduationCards(previousAugust);
    expect(html.match(/class="graduation-card is-locked /g)).toHaveLength(2);
    const headers = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/g)!;
    expect(visibleText(headers[0]!)).toContain("1月后开放");
    expect(visibleText(headers[1]!)).toBe("💼找工作1月后开放");
    expect(html.match(/data-graduation-point="\d+"/g)).toHaveLength(3);
    expect(buttons(html, "advance-thesis-point")).toHaveLength(degree === "master" ? 2 : 3);
    expect(buttons(html, "prepare-career")).toHaveLength(4);
    for (const action of ["advance-thesis-point", "prepare-career"]) {
      expect(buttons(html, action).every((button) => button.includes(' disabled aria-disabled="true"'))).toBe(true);
    }
    expect(renderGraduationCards({ ...state, month: 0 })).toContain("graduation-card is-locked");
    expect(buttons(renderGraduationCards(state), "advance-thesis-point")).toHaveLength(degree === "master" ? 2 : 3);
  });

  it.each([true, false])("keeps the master's third point as a zero-valued placeholder, locked=%s", (locked) => {
    const state = graduationState();
    if (locked) {
      state.year -= 1;
      state.month = 12;
      state.totalMonths -= 1;
    }
    const html = renderGraduationCards(state);
    expect(html.match(/data-graduation-point="\d+"/g)).toHaveLength(3);
    expect(html.match(/class="graduation-point is-unused"/g)).toHaveLength(1);
    const placeholder = html.match(/<div class="graduation-point is-unused"[\s\S]*?<\/span><\/div>/)![0];
    expect(placeholder).toContain('data-graduation-point="2"');
    expect(placeholder).toContain('class="rel-detail-label"><span class="rel-inline-icon" aria-hidden="true">🔬</span>研究点3</span>');
    expect(placeholder).toMatch(/class="rel-progress-bar graduation-point-bar"[^>]*aria-valuenow="0"><\/div>/);
    expect(placeholder).toContain('class="rel-progress-val">0</strong>');
    expect(placeholder).toContain('<span class="graduation-unused-action">硕士不需要</span>');
    expect(placeholder).not.toContain("<button");
    expect(placeholder).not.toContain("data-action");
    expect(buttons(html, "advance-thesis-point")).toHaveLength(2);
  });

  it.each(["master", "phd"] as const)("renders locked %s previews deterministically without global RNG or mutation", (degree) => {
    const base = createInitialState();
    const state: GameState = { ...base, phase: "playing", degree, year: 1, month: 1, totalMonths: 1 };
    const before = structuredClone(state);
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Locked rendering must not consume global RNG");
    });
    try {
      const html = renderGraduationCards(state);
      expect(renderGraduationCards(state)).toBe(html);
      expect(html.match(/data-graduation-point="\d+"/g)).toHaveLength(3);
      const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)![0];
      expect(visibleText(header)).toContain(`${degree === "master" ? 24 : 60}月后开放`);
      expect(random).not.toHaveBeenCalled();
      expect(state).toEqual(before);
    } finally {
      random.mockRestore();
    }
  });

  it("relocks on transfer and hides the old thesis and preparation values", () => {
    const state = graduationState();
    state.thesis.title = "旧硕士论文";
    state.careerProgress.internet = 987;
    const html = renderGraduationCards({ ...state, degree: "phd" });
    expect(html.match(/class="graduation-card is-locked /g)).toHaveLength(2);
    expect(html).not.toContain("旧硕士论文");
    expect(visibleText(html)).not.toContain("987");
    expect(buttons(html, "advance-thesis-point")).toHaveLength(3);
    expect(buttons(html, "advance-thesis-point").every((button) => button.includes(" disabled"))).toBe(true);
  });

  it("keeps scores above 100, escapes full support titles, and never mutates the state", () => {
    const state = graduationState("phd");
    state.thesis.title = '论文 <script> & "标题"';
    state.thesis.researchPoints[0] = { ...state.thesis.researchPoints[0]!, initialScore: 0, score: 250.123456,
      supportPaperTitle: '完整支撑论文 <img src=x onerror="alert(1)"> & title', supportPaperId: "support" };
    const before = structuredClone(state);
    const html = renderGraduationCards(state);
    expect(visibleText(html)).toContain("250.12");
    expect(html).toContain(`data-thesis-grade="A" data-thesis-threshold="${formatMoney(THESIS_REVIEW_THRESHOLDS.phd.A / 3)}"`);
    expect(html).toContain('aria-valuemax="334"');
    expect(html).toContain(`style="width:${formatMoney(250.123456 / 334 * 100)}%"`);
    expect(html).toContain('data-animate-number="250.123456"');
    const supportBar = html.match(/<div class="rel-progress-bar graduation-point-bar"[^>]*>/)![0];
    expect(supportBar).toContain('data-tooltip="完整支撑论文 &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; title\n原始分 0 · 改进分 250.12"');
    expect(html.match(/<[^>]*data-tooltip="完整支撑论文[^>]*>/g)).toHaveLength(2);
    expect(html).toMatch(/class="rel-detail-label"[^>]*data-tooltip="完整支撑论文/);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(state).toEqual(before);
  });

  it("locks each used point independently and keeps low-SAN actions enabled with standard risk markup", () => {
    const state = graduationState();
    state.player.san = 1;
    state.actionState.used = state.actionState.limit;
    state.thesis.researchPoints[0]!.lastAdvancedTotalMonths = state.totalMonths;
    const actions = buttons(renderGraduationCards(state), "advance-thesis-point");
    expect(actions[0]).toContain(" disabled");
    expect(actions[0]).not.toContain("event-choice-risk");
    expect(actions[1]).not.toContain(" disabled");
    expect(actions[1]).toContain("data-event-risk-tooltip");
    expect(actions[1]).toContain("event-choice-risk is-certain");
    expect(actions[1]).toContain("推进+17.9 · SAN-3");
  });

  it("uses the existing risk evaluator's emergency-chair protection", () => {
    const state = graduationState();
    state.player.san = 1;
    state.shopState.chairUpgrade = "spike";
    const html = renderGraduationCards(state);
    expect(html).not.toContain("event-choice-risk");
    expect(buttons(html, "advance-thesis-point").every((button) => !button.includes(" disabled"))).toBe(true);
    expect(buttons(html, "prepare-career")).toHaveLength(4);
    expect(buttons(html, "prepare-career").filter((button) => button.includes(" disabled"))).toHaveLength(1);
  });

  it.each([[1, 7], [7, 1]] as const)("shows the April countdown in month %s", (month, remaining) => {
    const html = renderGraduationCards(graduationState("master", month));
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)![0];
    expect(visibleText(header)).toContain(`${remaining}月后盲审`);
  });

  it.each([8, 9, 10])("freezes thesis advancement but keeps career preparation open in month %s", (month) => {
    const state = graduationState("master", month);
    const html = renderGraduationCards(state);
    expect(buttons(html, "advance-thesis-point").every((button) => button.includes(" disabled"))).toBe(true);
    expect(buttons(html, "prepare-career")).toHaveLength(4);
    expect(buttons(html, "prepare-career").filter((button) => button.includes(" disabled"))).toHaveLength(1);
    expect(visibleText(html)).not.toMatch(/\d+月后盲审/);
  });

  it.each(["master", "phd"] as const)("shows the reviewed %s outcome without an excellent badge", (degree) => {
    const state = graduationState(degree, 8);
    state.thesis.review = reviewPresentation(degree).review;
    state.thesis.reviewResolved = true;
    const html = renderGraduationCards(state);
    expect(html).toContain("盲审通过");
    expect(html).not.toContain(`优秀${degree === "master" ? "硕士" : "博士"}论文`);
    expect(html).not.toContain("<table");
    expect(buttons(html, "prepare-career").filter((button) => button.includes(" disabled"))).toHaveLength(degree === "master" ? 1 : 0);
  });

  it("shows unsuccessful and unsubmitted outcomes without an excellent badge", () => {
    let state = graduationState("master", 8);
    state = prepareThesisBlindReview(state, () => 0.5);
    state.thesis.reviewResolved = true;
    expect(renderGraduationCards(state)).toContain("盲审未通过");
    state.thesis.review = { ...state.thesis.review!, submitted: false, reason: "科研分不足", reports: [] };
    const html = renderGraduationCards(state);
    expect(html).toContain("未送审");
    expect(html).toContain("科研分不足");
    expect(html).not.toContain("graduation-excellent");
  });

  it.each([true, false])("hides sampled review outcomes until confirmation, submitted=%s", (submitted) => {
    const state = graduationState("master", 8);
    state.thesis.review = { ...reviewPresentation("master").review, submitted, reason: "尚不可透露的送审原因" };
    state.eventQueue = [createEventQueueItem({ id: 'thesis-notice-"test"', chainId: "thesis-review", source: "thesis",
      title: "盲审通知", description: "", stage: "act1", blocking: true, deadlineMonths: 0, choices: [] }, 0)];
    const html = renderGraduationCards(state);
    expect(html).toContain(submitted ? "已送审 · 等待结果" : "等待盲审通知");
    expect(html).not.toMatch(/盲审通过|盲审未通过|优秀硕士论文|尚不可透露的送审原因/);
    expect(html).not.toContain('data-ui-open-event-id=');
    expect(html).not.toContain("查看通知");
    expect(html).not.toContain("<table");
  });

  it("renders live career ability, SAN costs, and retained offers", () => {
    const state = graduationState("phd");
    state.careerProgress = { internet: 500.123456, stateOwned: 300, civilService: 200, academic: 150 };
    state.careerOffers.internet = { type: "internet", jobId: "old", name: "旧 offer", threshold: 45, score: 60 };
    const html = renderGraduationCards(state);
    const headers = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/g)!;
    expect(visibleText(headers[1]!)).toContain("已获1份 offer");
    expect(headers[1]).not.toContain("招聘");
    const rows = html.match(/<div class="graduation-career-row">[\s\S]*?<\/button>\s*<\/div>/g) ?? [];
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain('class="graduation-offer-marker"');
    rows.forEach((row, index) => {
      expect(row.match(/class="rel-detail-label"/g)).toHaveLength(1);
      expect(row.match(/class="rel-progress-bar graduation-career-bar"/g)).toHaveLength(1);
      expect(row.match(/class="rel-progress-val"/g)).toHaveLength(1);
      expect(row).toMatch(/rel-detail-label[\s\S]*graduation-career-bar[\s\S]*rel-progress-val[\s\S]*<button/);
      const actions = buttons(row, "prepare-career");
      expect(actions).toHaveLength(1);
      expect(visibleText(actions[0]!)).toBe(`📈推进SAN-${[4, 2, 3, 2][index]}`);
      expect(actions[0]).toContain(`主动推进：${["+6", "+3～8", "+10～15", "+3"][index]}分`);
      const type = (["internet", "stateOwned", "civilService", "academic"] as const)[index]!;
      expect(row).toContain(`aria-valuenow="${formatMoney(getCareerAbility(state, type))}"`);
      expect(row).toContain(`aria-valuemax="${[1000, 550, 400, 1100][index]}"`);
      expect(row).toContain("履历");
      expect(row).toContain("推进");
      expect(row).toContain("面试");
      expect(row).toMatch(/graduation-career-resume[^>]*style="width:[^%]+%"/);
      expect(row).toMatch(/graduation-career-practice[^>]*style="width:[^%]+%"/);
      expect(row).toContain("graduation-career-interview");
    });
    expect(visibleText(rows[0]!)).toContain("554.12");
    expect(buttons(html, "prepare-career").map((button) => button.match(/data-career-type="([^"]+)"/)![1]))
      .toEqual(["internet", "stateOwned", "civilService", "academic"]);
  });

  it("separates resume, preparation and interview experience in the career bar", () => {
    const state = graduationState("phd");
    state.careerProgress.internet = 30;
    state.careerInterviewExperience.internet = 10;
    const row = renderGraduationCards(state).match(/<div class="graduation-career-row">[\s\S]*?<\/button>\s*<\/div>/)![0];
    expect(row).toContain("履历 54 分 · 推进 20 分 · 面试 10 分");
    expect(row).toMatch(/graduation-career-resume[^>]*style="width:[1-9]/);
    expect(row).toMatch(/graduation-career-practice[^>]*style="width:[1-9]/);
    expect(row).toMatch(/graduation-career-interview[^>]*style="width:[1-9]/);
    expect(row).toContain('aria-valuenow="84"');
    expect(row).toContain('aria-valuemax="1000"');
    expect(row).toContain('style="width:5.4%"');
  });

  it.each(["monthly", "pending", "finished"] as const)("blocks all career directions for %s", (reason) => {
    const state = graduationState("phd");
    if (reason === "monthly") state.careerPreparedMonths = {
      internet: state.totalMonths, stateOwned: state.totalMonths,
      civilService: state.totalMonths, academic: state.totalMonths,
    };
    if (reason === "pending") state.eventQueue = [createEventQueueItem(createCareerRecruitmentEvent(state, () => 0), 0)];
    if (reason === "finished") state.phase = "finished";
    const actions = buttons(renderGraduationCards(state), "prepare-career");
    expect(actions).toHaveLength(4);
    expect(actions.every((button) => button.includes(' disabled aria-disabled="true"'))).toBe(true);
  });

  it.each(["internet", "stateOwned", "civilService", "academic"] as const)("disables only the %s direction already advanced this month", (type) => {
    const state = graduationState("phd");
    state.player.san = 1;
    state.actionState.used = state.actionState.limit;
    state.careerPreparedMonths = { [type]: state.totalMonths };
    const before = structuredClone(state);
    const actions = buttons(renderGraduationCards(state), "prepare-career");
    expect(actions).toHaveLength(4);
    for (const action of actions) {
      if (action.includes(`data-career-type="${type}"`)) {
        expect(action).toContain(' disabled aria-disabled="true"');
        expect(action).not.toContain("event-choice-risk");
        expect(action).not.toContain("data-event-risk-tooltip");
      } else {
        expect(action).not.toContain(" disabled");
        expect(action).toContain("data-event-risk-tooltip");
        expect(action).toContain("event-choice-risk is-certain");
      }
    }
    expect(state).toEqual(before);
    const nextMonth = { ...state, month: state.month + 1, totalMonths: state.totalMonths + 1 };
    const nextActions = buttons(renderGraduationCards(nextMonth), "prepare-career");
    expect(nextActions).toHaveLength(4);
    expect(nextActions.every((action) => !action.includes(" disabled"))).toBe(true);
  });

  it.each([1, 2, 3, 4])("uses each direction's exact SAN cost for risk markup at SAN %s", (san) => {
    const state = graduationState("phd");
    state.player.san = san;
    const before = structuredClone(state);
    const actions = buttons(renderGraduationCards(state), "prepare-career");
    expect(actions).toHaveLength(4);
    actions.forEach((action, index) => {
      const cost = [4, 2, 3, 2][index]!;
      expect(action).not.toContain(" disabled");
      expect(action).toContain(`class="rel-action-cost">SAN-${cost}</small>`);
      expect(action).toContain(`主动推进：${["+6", "+3～8", `+${Math.floor(san / 2)}～${Math.floor(san / 2) + 5}`, "+3"][index]}分 · SAN-${cost}`);
      expect(action).toContain("本方向每月一次，不占行动点");
      if (san < cost) {
        expect(action).toContain("data-event-risk-tooltip");
        expect(action).toContain("event-choice-risk is-certain");
        expect(action).toContain(`SAN不足，结算后为${san - cost}`);
        expect(visibleText(action)).toBe(`📈推进！SAN-${cost}`);
      } else {
        expect(action).not.toContain("data-event-risk-tooltip");
        expect(action).not.toContain("event-choice-risk");
        expect(visibleText(action)).toBe(`📈推进SAN-${cost}`);
      }
    });
    expect(state).toEqual(before);
  });
});

describe("thesis expert review reports", () => {
  it.each(["master", "phd"] as const)("renders %s experts with original points and frozen raw scores", (degree) => {
    const presentation = reviewPresentation(degree);
    const before = structuredClone(presentation);
    const html = renderThesisReviewReports(presentation);
    expect(html.match(/class="graduation-reviewer-card is-a"/g)).toHaveLength(degree === "master" ? 3 : 5);
    expect(visibleText(html)).toContain(formatMoney(presentation.review.reports[0]!.effectiveScore));
    expect(html).toContain("加权分");
    expect(html).toContain("研究内容扎实，各研究点形成了清晰的论证，达到优秀标准。");
    expect(html).not.toContain("盲审通过");
    expect(presentation).toEqual(before);
  });

  it("keeps displayed weights summing to three without recalculating the raw effective score", () => {
    const presentation = reviewPresentation("phd");
    presentation.review.reports[0] = { ...presentation.review.reports[0]!, weights: [0.994, 0.994, 1.012], effectiveScore: 601.23789 };
    const html = renderThesisReviewReports(presentation);
    expect(html).toContain("0.99 / 0.99 / 1.02");
    expect(visibleText(html)).toContain("601.24");
    expect(html).toContain("加权分 <b>601.24</b>");
  });

  it("marks A/B and C/D individually and safely escapes reviewer comments", () => {
    const presentation = reviewPresentation("phd");
    presentation.review.reports = (["A", "B", "C", "D"] as const).map((grade) => ({
      weights: [1, 1, 1], effectiveScore: 300, grade, score: 80, comment: '<script>"bad"</script>',
    }));
    const html = renderThesisReviewReports(presentation);
    for (const grade of ["a", "b", "c", "d"]) expect(html).toContain(`graduation-reviewer-card is-${grade}`);
    expect(html).toContain("&lt;script&gt;&quot;bad&quot;&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders no table or duplicate judgment when a thesis was not submitted", () => {
    const presentation = reviewPresentation("master");
    presentation.review.submitted = false;
    expect(renderThesisReviewReports(presentation)).toContain("未能送审");
    expect(renderThesisReviewReports(presentation)).not.toContain("graduation-reviewer-card");
  });
});
