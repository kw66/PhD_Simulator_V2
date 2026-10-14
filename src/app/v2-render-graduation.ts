import { renderSanPayment } from "./v2-render-san-payment";
import { getEffectiveResearch } from "../core/v2-effective-attributes";
import { CAREER_DEFINITIONS, CAREER_JOBS, calculateMonthlyCareerProgress, getCareerAbility, getCareerBaseScore, type CareerType } from "../core/v2-career-rules";
import { getEventChoiceRiskDetails } from "../core/v2-event-choice-risk";
import { getCareerPreparationSanCost, getCareerPreparationFailure } from "../core/v2-graduation-career";
import { formatMoney, roundMoney } from "../core/v2-money";
import { getAcademicCalendarMonth, getAcademicCalendarYear } from "../core/v2-calendar";
import {
  getGraduationPreparationYear,
  createInitialThesisState,
  getThesisAdvanceFailure,
  getThesisAdvanceSanCost,
  isGraduationPreparationUnlocked,
  syncThesisState,
  THESIS_REVIEW_THRESHOLDS,
} from "../core/v2-thesis-rules";
import type { GameState, PendingEvent } from "../core/v2-types";
import { animationBarAttribute, renderAnimatedNumber } from "./v2-render-animation";
import { getThesisGlobalStats } from "./v2-thesis-stats";
import { formatCompactSanPayment, quoteSanPayment } from "../core/v2-role-talent-costs";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}

function tooltip(text: string): string {
  return `data-card-tooltip data-tooltip="${escapeHtml(text)}" aria-description="${escapeHtml(text)}"`;
}

function monthsUntilOpening(state: GameState): number {
  return Math.max(0, (getGraduationPreparationYear(state.degree) - state.year) * 12 + 1 - state.month);
}

function renderGraduationCountdown(months: number, milestone: "开放" | "盲审", identity?: string): string {
  return `<span class="graduation-countdown"><strong>${identity ? renderAnimatedNumber(identity, months) : months}</strong>月后${milestone}</span>`;
}

function renderThesisCard(state: GameState): string {
  const unlocked = isGraduationPreparationUnlocked(state);
  const thesis = unlocked && state.thesis.degree === state.degree ? state.thesis
    : syncThesisState({ ...state, phase: "playing", year: getGraduationPreparationYear(state.degree), month: 1,
      thesis: createInitialThesisState(),
    }, () => 0.5).thesis;
  const reviewed = thesis.reviewResolved || thesis.review !== null;
  const frozen = unlocked && (reviewed || state.month >= 8);
  const thresholds = THESIS_REVIEW_THRESHOLDS[state.degree];
  const reference = thresholds.A / 3;
  const baseScale = Math.ceil(reference * 2);
  const identity = `graduation:${state.degree}:thesis`;
  const sanCost = getThesisAdvanceSanCost(state);
  const paymentText = formatCompactSanPayment(quoteSanPayment(state, sanCost, { allowOverdraw: true }));
  const preview: PendingEvent = {
    id: "thesis-advance-preview", chainId: "thesis-advance-preview", title: "推进毕业论文", description: "",
    source: "thesis", blocking: false, deadlineMonths: 0, stage: "act2",
    choices: [{ id: "advance", label: "推进", outcome: "", effects: { san: -sanCost } }],
  };
  const risk = unlocked && !frozen ? getEventChoiceRiskDetails(state, preview, preview.choices[0]!) : null;
  const review = thesis.review;
  const status = !unlocked ? renderGraduationCountdown(monthsUntilOpening(state), "开放") : review && thesis.reviewResolved
    ? review.submitted ? review.passed ? "盲审通过" : "盲审未通过" : "未送审"
    : review ? review.submitted ? "已送审 · 等待结果" : "等待盲审通知"
      : frozen ? "已封存 · 等待盲审" : renderGraduationCountdown(8 - state.month, "盲审", `${identity}:months`);
  return `<section class="graduation-card${unlocked ? "" : " is-locked"} rel-card filled rel-card-compact" data-graduation-card="thesis" aria-labelledby="graduation-thesis-title">
    <header class="rel-card-header paper-card-header graduation-thesis-header"><strong class="rel-name" id="graduation-thesis-title"><span class="rel-inline-icon" aria-hidden="true">📘</span>${state.degree === "master" ? "硕士" : "博士"}毕业论文</strong><span class="graduation-reference" ${tooltip("A／B为各研究点同分时的参考线，实际按专家权重评分；任一专家评为B以下将延毕")}>参考分 ${(["A", "B"] as const).map((grade) => `<span data-thesis-grade="${grade}" data-thesis-threshold="${formatMoney(thresholds[grade] / 3)}">${grade}：${formatMoney(thresholds[grade] / 3)}</span>`).join(" ")}</span><span class="graduation-status">${status}</span></header>
    <div class="graduation-thesis-heading"><strong class="graduation-ellipsis" tabindex="0" ${tooltip(unlocked ? thesis.title : "开放时根据届时成果确定题目和方向")}>${unlocked ? escapeHtml(thesis.title) : "毕业论文题目待定"}</strong><span class="paper-topic-tag">${unlocked || thesis.researchPoints.some((point) => point.supportPaperId) ? escapeHtml(thesis.topicLabel) : "方向待定"}</span></div>
    <div class="graduation-points">${thesis.researchPoints.map((point, index) => {
      const failure = getThesisAdvanceFailure(state, index);
      const disabledReason = !unlocked ? `${monthsUntilOpening(state)}月后开放` : state.phase !== "playing" ? "本局已结束" : frozen ? "盲审已封存" : failure;
      const pointIdentity = `${identity}:point:${index}`;
      const pointScale = Math.max(baseScale, Math.ceil(point.score * 1.2));
      const label = `研究点${formatMoney(index + 1)}`;
      const hint = disabledReason ?? `推进+${formatMoney(Math.floor(getEffectiveResearch(state)))} · ${paymentText}`;
      const riskText = !disabledReason && risk ? `${hint}\n${risk.explanation}` : null;
      const buttonTooltip = riskText
        ? `data-event-risk-tooltip data-tooltip="${escapeHtml(riskText)}" aria-description="${escapeHtml(riskText)}"`
        : tooltip(hint);
      const totalPercent = Math.min(100, Math.max(0, point.score / pointScale * 100));
      const initialPercent = Math.min(totalPercent, Math.max(0, point.initialScore / pointScale * 100));
      const supportHint = `${point.supportPaperTitle ?? "暂无支撑论文"}\n原始分 ${formatMoney(point.initialScore)} · 改进分 ${formatMoney(Math.max(0, point.score - point.initialScore))}`;
      return `<div class="graduation-point" data-graduation-point="${index}">
        <span class="rel-detail-label" tabindex="0" ${tooltip(supportHint)}><span class="rel-inline-icon" aria-hidden="true">🔬</span>${label}</span>
        <div class="rel-progress-bar graduation-point-bar${pointScale > reference * 4 ? " is-high-score" : ""}" tabindex="0" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${formatMoney(pointScale)}" aria-valuenow="${formatMoney(point.score)}" aria-valuetext="${escapeHtml(supportHint)}" ${tooltip(supportHint)}>
          <span class="graduation-bar-fill-track${totalPercent <= initialPercent ? " is-unimproved" : ""}">
            <span class="rel-progress-fill research graduation-original" data-thesis-initial-score="${formatMoney(point.initialScore)}" style="width:${formatMoney(initialPercent)}%"></span>
            <span class="rel-progress-fill cooperation graduation-improved" ${animationBarAttribute(`${pointIdentity}:bar`)} style="width:${formatMoney(totalPercent - initialPercent)}%"></span>
          </span>
          ${(["B", "A"] as const).map((grade) => `<span class="graduation-bar-grade is-${grade.toLowerCase()}" style="left:clamp(8px, ${formatMoney(thresholds[grade] / 3 / pointScale * 100)}%, calc(100% - 8px))" aria-hidden="true">${grade}</span>`).join("")}
          </div>
        <strong class="rel-progress-val">${renderAnimatedNumber(`${pointIdentity}:score`, point.score)}</strong>
        <button type="button" class="btn-sm rel-action-btn rel-cooperation-btn graduation-action" data-action="advance-thesis-point" data-thesis-point-index="${index}" ${buttonTooltip}${disabledReason ? ' disabled aria-disabled="true"' : ""}><span>📝推进</span>${riskText ? `<span class="event-choice-risk is-${risk!.risk}" aria-label="${escapeHtml(risk!.explanation)}">${risk!.risk === "certain" ? "！" : "？"}</span>` : ""}<small class="rel-action-cost">${renderSanPayment(quoteSanPayment(state, sanCost, { allowOverdraw: true }), 0, pointIdentity)}</small></button>
      </div>`;
    }).join("")}${state.degree === "master" ? `<div class="graduation-point is-unused" data-graduation-point="2"><span class="rel-detail-label"><span class="rel-inline-icon" aria-hidden="true">🔬</span>研究点3</span><div class="rel-progress-bar graduation-point-bar" role="meter" aria-label="研究点3（硕士无需推进）" aria-valuemin="0" aria-valuemax="${formatMoney(baseScale)}" aria-valuenow="0"></div><strong class="rel-progress-val">0</strong><span class="graduation-unused-action">硕士不需要</span></div>` : ""}</div>
    ${thesis.reviewResolved && review?.reason ? `<p class="graduation-review-reason">${escapeHtml(review.reason)}</p>` : ""}
  </section>`;
}

function renderCareerCard(state: GameState): string {
  const unlocked = isGraduationPreparationUnlocked(state);
  const directions: CareerType[] = ["internet", "stateOwned", "civilService", "academic"];
  const offerCount = Object.values(state.careerOffers).filter((offer) => offer !== undefined).length;
  return `<section class="graduation-card${unlocked ? "" : " is-locked"} rel-card filled rel-card-compact" data-graduation-card="career" aria-labelledby="graduation-career-title">
    <header class="rel-card-header paper-card-header graduation-career-header"><strong class="rel-name" id="graduation-career-title"><span class="rel-inline-icon" aria-hidden="true">💼</span>找工作</strong><span class="graduation-status">${unlocked ? offerCount ? `已获${offerCount}份 offer` : "已开放" : renderGraduationCountdown(monthsUntilOpening(state), "开放")}</span></header>
    <div class="graduation-careers">${directions.map((type) => {
      const failure = getCareerPreparationFailure(state, type);
      const cost = getCareerPreparationSanCost(state, type);
      const choice = { id: "advance", label: "推进", outcome: "", effects: { san: -cost } };
      const risk = failure ? null : getEventChoiceRiskDetails(state, { id: "career-preview", chainId: "career-preview", title: "找工作推进", description: "", source: "career", stage: "act2", blocking: false, deadlineMonths: 0, choices: [choice] }, choice);
      const paymentText = formatCompactSanPayment(quoteSanPayment(state, cost, { allowOverdraw: true }));
      const actionHint = failure ?? `本方向每月一次，不占行动点；${paymentText}${risk ? `\n${risk.explanation}` : ""}`;
      const eligible = unlocked && (type !== "academic" || state.degree === "phd");
      const ability = eligible ? getCareerAbility(state, type) : 0;
      const resume = eligible ? getCareerBaseScore(state, type) : 0;
      const interview = eligible ? Math.min(state.careerProgress[type], state.careerInterviewExperience[type] ?? 0) : 0;
      const practice = eligible ? Math.max(0, state.careerProgress[type] - interview) : 0;
      const minimumGain = calculateMonthlyCareerProgress(state, type, () => 0);
      const maximumGain = calculateMonthlyCareerProgress(state, type, () => 0.999999);
      const gainLabel = minimumGain === maximumGain ? `+${minimumGain}` : `+${minimumGain}～${maximumGain}`;
      const scale = Math.max(ability, ...CAREER_JOBS[type].map((job) => job.threshold));
      const baseWidth = Math.min(100, resume / Math.max(1, scale) * 100);
      const practiceWidth = Math.min(100 - baseWidth, practice / Math.max(1, scale) * 100);
      const interviewWidth = Math.min(100 - baseWidth - practiceWidth, interview / Math.max(1, scale) * 100);
      const offer = state.careerOffers[type];
      const progressHint = eligible
        ? `履历 ${formatMoney(resume)} 分 · 推进 ${formatMoney(practice)} 分 · 面试 ${formatMoney(interview)} 分${offer ? `\n已有 offer：${offer.name}${offer.compensation ? ` · ${offer.compensation}` : ""}` : ""}`
        : type === "academic" && unlocked ? "博士学位方可应聘教职" : "毕业学年开放";
      return `<div class="graduation-career-row">
      <strong class="rel-detail-label" tabindex="0" ${tooltip(progressHint)}><span class="rel-inline-icon" aria-hidden="true">${({ internet: "🏢", stateOwned: "🏛️", civilService: "📋", academic: "🎓" } as const)[type]}</span>${escapeHtml(CAREER_DEFINITIONS[type].name)}${offer ? '<span class="graduation-offer-marker" aria-label="已获 offer">✓</span>' : ""}</strong>
      <div class="rel-progress-bar graduation-career-bar" tabindex="0" role="meter" aria-label="${escapeHtml(CAREER_DEFINITIONS[type].name)}应聘能力" aria-valuemin="0" aria-valuemax="${formatMoney(scale)}" aria-valuenow="${formatMoney(ability)}" ${tooltip(progressHint)}><span class="graduation-bar-fill-track"><span class="rel-progress-fill graduation-career-resume${baseWidth > 0 ? " is-start" : ""}${practiceWidth + interviewWidth === 0 ? " is-end" : ""}" style="width:${formatMoney(baseWidth)}%"></span><span class="rel-progress-fill graduation-career-practice${baseWidth === 0 && practiceWidth > 0 ? " is-start" : ""}${interviewWidth === 0 ? " is-end" : ""}" style="width:${formatMoney(practiceWidth)}%"></span><span class="rel-progress-fill graduation-career-interview${baseWidth + practiceWidth === 0 && interviewWidth > 0 ? " is-start" : ""} is-end" style="width:${formatMoney(interviewWidth)}%"></span></span></div>
      <strong class="rel-progress-val">${renderAnimatedNumber(`graduation:${state.degree}:career:${type}:progress`, ability)}</strong>
      <button type="button" class="btn-sm rel-action-btn rel-cooperation-btn graduation-action" data-action="prepare-career" data-career-type="${type}" ${risk ? "data-event-risk-tooltip" : "data-card-tooltip"} data-tooltip="${escapeHtml(actionHint)}"${failure ? ' disabled aria-disabled="true"' : ""}><span>📈推进</span><span class="graduation-action-gain">${gainLabel}</span>${risk ? `<span class="event-choice-risk is-${risk.risk}" aria-label="${escapeHtml(risk.explanation)}">！</span>` : ""}<small class="rel-action-cost">${renderSanPayment(quoteSanPayment(state, cost, { allowOverdraw: true }))}</small></button>
    </div>`;
    }).join("")}</div>
  </section>`;
}

export function renderGraduationCards(state: GameState): string {
  const unlocked = isGraduationPreparationUnlocked(state);
  return `<div class="graduation-cards rel-card-grid${unlocked ? "" : " is-locked"}">
    ${renderThesisCard(state)}
    ${renderCareerCard(state)}
  </div>`;
}

function renderThesisScoreChart(presentation: NonNullable<PendingEvent["thesisReviewPresentation"]>): string {
  const history = presentation.scoreHistory.length ? presentation.scoreHistory : [{
    totalMonths: 0, pointScores: presentation.pointScores, title: presentation.title,
  }];
  const width = Math.max(680, history.length * 54 + 80);
  const height = 185;
  const left = 42;
  const top = 15;
  const plotWidth = width - left - 18;
  const plotHeight = height - top - 35;
  const total = (scores: number[]): number => scores.reduce((sum, score) => sum + score, 0);
  const max = Math.max(10, ...history.map((entry) => total(entry.pointScores)));
  const scale = Math.ceil(max / 5) * 5;
  const firstMonth = history[0]!.totalMonths;
  const monthSpan = history.at(-1)!.totalMonths - firstMonth;
  const x = (index: number): number => left + (monthSpan === 0 ? plotWidth / 2
    : (history[index]!.totalMonths - firstMonth) / monthSpan * plotWidth);
  const y = (score: number): number => top + (1 - score / scale) * plotHeight;
  const series = Array.from({ length: presentation.pointScores.length }, (_, index) => ({
    label: `研究点${index + 1}`, className: `point-${index + 1}`,
    values: history.map((entry) => entry.pointScores[index] ?? 0),
  }));
  series.push({ label: "总分", className: "total", values: history.map((entry) => total(entry.pointScores)) });
  const ticks = [...new Set([0, Math.floor(history.length / 2), history.length - 1])]
    .filter((index, position, selected) => selected.findIndex((other) => history[other]!.totalMonths === history[index]!.totalMonths) === position);
  const monthLabel = (months: number): string => months > 0
    ? `${getAcademicCalendarYear(Math.floor((months - 1) / 12) + 1, (months - 1) % 12 + 1)}/${getAcademicCalendarMonth((months - 1) % 12 + 1)}`
    : "送审";
  return `<div class="graduation-review-chart-scroll" tabindex="0" role="region" aria-label="研究点和总分变化历程"><svg class="graduation-review-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="毕业论文研究点和总分变化历程">
    ${[0, scale / 2, scale].map((value) => `<line class="graduation-review-grid" x1="${left}" y1="${y(value)}" x2="${width - 18}" y2="${y(value)}"/><text x="${left - 7}" y="${y(value) + 4}" text-anchor="end">${formatMoney(value)}</text>`).join("")}
    ${series.map((line) => `<path class="graduation-review-line is-${line.className}" d="${line.values.map((score, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(score).toFixed(1)}`).join(" ")}"/>${line.values.map((score, index) => `<circle class="graduation-review-dot is-${line.className}" cx="${x(index).toFixed(1)}" cy="${y(score).toFixed(1)}" r="3.5"><title>${monthLabel(history[index]!.totalMonths)} · ${escapeHtml(history[index]!.title)} · ${line.label} ${formatMoney(score)}</title></circle>`).join("")}`).join("")}
    ${ticks.map((index) => `<text x="${x(index).toFixed(1)}" y="${height - 7}" text-anchor="${index === 0 ? "start" : index === history.length - 1 ? "end" : "middle"}">${monthLabel(history[index]!.totalMonths)}</text>`).join("")}
  </svg></div>`;
}

export function renderThesisReviewReports(
  presentation: NonNullable<PendingEvent["thesisReviewPresentation"]>, storyHtml = "",
): string {
  const review = presentation.review;
  const total = presentation.pointScores.reduce((sum, score) => sum + score, 0);
  if (presentation.stage === "overview") return `<section class="graduation-review-event is-overview">
    <header class="graduation-review-hero"><span>${presentation.degree === "master" ? "硕士" : "博士"}学位论文</span><h2>《${escapeHtml(presentation.title)}》</h2></header>
    <div class="graduation-review-score-grid">${presentation.pointScores.map((score, index) => `<div><span>研究点${index + 1}</span><strong>${formatMoney(score)}</strong></div>`).join("")}<div class="is-total"><span>总分</span><strong>${formatMoney(total)}</strong></div></div>
    <div class="graduation-review-chart-head"><h3>分数历程</h3><div class="graduation-review-legend">${presentation.pointScores.map((_, index) => `<span class="is-point-${index + 1}">研究点${index + 1}</span>`).join("")}<span class="is-total">总分</span></div></div>
    ${renderThesisScoreChart(presentation)}
  </section>`;
  if (presentation.stage === "reports") return `<section class="graduation-review-event is-reports">
    <header class="graduation-review-section-head"><h2>专家意见</h2><span>${review.submitted ? `${review.reports.length} 位专家独立评阅` : "未能送审"}</span></header>
    ${review.submitted ? `<div class="graduation-reviewer-grid">${review.reports.map((report, index) => {
      const displayWeights = report.weights.map(roundMoney);
      displayWeights[displayWeights.length - 1] = roundMoney(3 - displayWeights.slice(0, -1).reduce((sum, weight) => sum + weight, 0));
      return `<article class="graduation-reviewer-card is-${report.grade.toLowerCase()}"><div class="graduation-reviewer-head"><span>专家 ${index + 1}</span><strong>${report.grade}</strong></div><div class="graduation-reviewer-scores"><span>评分 <b>${formatMoney(report.score)}/100</b></span><span>加权分 <b>${formatMoney(report.effectiveScore)}</b></span></div><p>研究点权重 ${displayWeights.map(formatMoney).join(" / ")}</p><blockquote>“${escapeHtml(report.comment)}”</blockquote></article>`;
    }).join("")}</div>` : `<p class="graduation-review-unsubmitted">${escapeHtml(review.reason ?? "送审条件未满足，暂无专家意见。")}</p>`}
  </section>`;
  const result = !review.submitted ? "未能送审" : review.passed ? "盲审通过" : "盲审未通过";
  const snapshot = getThesisGlobalStats(presentation.degree);
  const stats = snapshot.data;
  const rate = (count: number): string => stats?.submittedCount
    ? `${formatMoney(Math.round(count / stats.submittedCount * 1000) / 10)}%` : "—";
  return `<section class="graduation-review-event is-decision ${review.passed ? "is-passed" : "is-failed"}">
    <header class="graduation-review-decision"><span aria-hidden="true">${review.passed ? "🎓" : "📋"}</span><strong>${result}</strong><p>${review.excellent ? `优秀${presentation.degree === "master" ? "硕士" : "博士"}论文` : `《${escapeHtml(presentation.title)}》`}</p></header>
    <div class="graduation-review-grade-list">${review.reports.map((report, index) => `<span class="is-${report.grade.toLowerCase()}">专家${index + 1} · ${report.grade}</span>`).join("")}</div>
    <div class="graduation-review-story">${storyHtml}</div>
    <section class="graduation-review-global-stats" data-thesis-stats-degree="${presentation.degree}">
      <h3>所有玩家 · ${presentation.degree === "master" ? "硕士" : "博士"}盲审${snapshot.status !== "ready" ? '<span class="graduation-review-stats-status">统计暂未同步</span>' : ""}</h3>
      <div class="graduation-review-stats-grid">
        <div><span>已送审</span><strong>${stats?.submittedCount ?? "—"}</strong></div>
        <div><span>通过率</span><strong>${stats ? rate(stats.passedCount) : "—"}</strong></div>
        <div><span>优秀率</span><strong>${stats ? rate(stats.excellentCount) : "—"}</strong></div>
        <div><span>未送审</span><strong>${stats?.notSubmittedCount ?? "—"}</strong></div>
      </div>
      <p>通过率、优秀率以已送审人数为分母</p>
    </section>
  </section>`;
}
import "../styles/graduation.css";

