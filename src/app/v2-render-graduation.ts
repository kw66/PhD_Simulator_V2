import { CAREER_DEFINITIONS, type CareerType } from "../core/v2-career-rules";
import { getEventChoiceRiskDetails } from "../core/v2-event-choice-risk";
import { CAREER_PREPARATION_SAN_COST, getCareerPreparationFailure } from "../core/v2-graduation-career";
import { formatMoney, roundMoney } from "../core/v2-money";
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
  const scale = reference;
  const identity = `graduation:${state.degree}:thesis`;
  const sanCost = getThesisAdvanceSanCost(state);
  const preview: PendingEvent = {
    id: "thesis-advance-preview", chainId: "thesis-advance-preview", title: "推进毕业论文", description: "",
    source: "thesis", blocking: false, deadlineMonths: 0, stage: "act2",
    choices: [{ id: "advance", label: "推进", outcome: "", effects: { san: -sanCost } }],
  };
  const risk = unlocked && !frozen ? getEventChoiceRiskDetails(state, preview, preview.choices[0]!) : null;
  const review = thesis.review;
  const pendingNotice = state.eventQueue.find((event) => event.source === "thesis");
  const status = !unlocked ? renderGraduationCountdown(monthsUntilOpening(state), "开放") : review && thesis.reviewResolved
    ? review.submitted ? review.passed ? "盲审通过" : "盲审未通过" : "未送审"
    : review ? review.submitted ? "已送审 · 等待结果" : "等待盲审通知"
      : frozen ? "已封存 · 等待盲审" : renderGraduationCountdown(8 - state.month, "盲审", `${identity}:months`);
  return `<section class="graduation-card${unlocked ? "" : " is-locked"} rel-card filled rel-card-compact" data-graduation-card="thesis" aria-labelledby="graduation-thesis-title">
    <header class="rel-card-header paper-card-header graduation-thesis-header"><strong class="rel-name" id="graduation-thesis-title">${state.degree === "master" ? "硕士" : "博士"}毕业论文</strong><span class="graduation-reference" ${tooltip("A／B为各研究点同分时的参考线，实际按专家权重评分；任一专家评为B以下将延毕")}>参考分 ${(["A", "B"] as const).map((grade) => `<span data-thesis-grade="${grade}" data-thesis-threshold="${formatMoney(thresholds[grade] / 3)}">${grade}：${formatMoney(thresholds[grade] / 3)}</span>`).join(" ")}</span><span class="graduation-status">${status}</span></header>
    <div class="graduation-thesis-heading"><strong class="graduation-ellipsis" tabindex="0" ${tooltip(unlocked ? thesis.title : "开放时根据届时成果确定题目和方向")}>${unlocked ? escapeHtml(thesis.title) : "毕业论文题目待定"}</strong><span class="paper-topic-tag">${unlocked || thesis.researchPoints.some((point) => point.supportPaperId) ? escapeHtml(thesis.topicLabel) : "方向待定"}</span></div>
    <div class="graduation-points">${thesis.researchPoints.map((point, index) => {
      const failure = getThesisAdvanceFailure(state, index);
      const disabledReason = !unlocked ? `${monthsUntilOpening(state)}月后开放` : state.phase !== "playing" ? "本局已结束" : frozen ? "盲审已封存" : failure;
      const pointIdentity = `${identity}:point:${index}`;
      const pointScale = Math.max(scale, point.score);
      const label = `研究点${formatMoney(index + 1)}`;
      const hint = disabledReason ?? `推进+${formatMoney(Math.floor(state.player.research))} · SAN-${formatMoney(sanCost)}`;
      const riskText = !disabledReason && risk ? `${hint}\n${risk.explanation}` : null;
      const buttonTooltip = riskText
        ? `data-event-risk-tooltip data-tooltip="${escapeHtml(riskText)}" aria-description="${escapeHtml(riskText)}"`
        : tooltip(hint);
      const initialPercent = Math.min(100, Math.max(0, point.initialScore / pointScale * 100));
      const totalPercent = Math.min(100, Math.max(0, point.score / pointScale * 100));
      const supportHint = `${point.supportPaperTitle ?? "暂无支撑论文"}\n原始分 ${formatMoney(point.initialScore)} · 改进分 ${formatMoney(Math.max(0, point.score - point.initialScore))}`;
      return `<div class="graduation-point" data-graduation-point="${index}">
        <span class="rel-detail-label">${label}</span>
        <div class="rel-progress-bar graduation-point-bar" tabindex="0" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${formatMoney(Math.max(scale, point.score))}" aria-valuenow="${formatMoney(point.score)}" aria-valuetext="${escapeHtml(supportHint)}" ${tooltip(supportHint)}>
          <span class="rel-progress-fill research graduation-original" data-thesis-initial-score="${formatMoney(point.initialScore)}" style="width:${formatMoney(initialPercent)}%"></span>
          <span class="rel-progress-fill cooperation graduation-improved" ${animationBarAttribute(`${pointIdentity}:bar`)} style="width:${formatMoney(totalPercent - initialPercent)}%"></span>
          ${(["B", "A"] as const).map((grade) => `<span class="graduation-bar-grade is-${grade.toLowerCase()}" style="left:clamp(8px, ${formatMoney(thresholds[grade] / 3 / pointScale * 100)}%, calc(100% - 8px))" aria-hidden="true">${grade}</span>`).join("")}
          </div>
        <strong class="rel-progress-val">${renderAnimatedNumber(`${pointIdentity}:score`, point.score)}</strong>
        <button type="button" class="btn-sm rel-action-btn rel-cooperation-btn graduation-action" data-action="advance-thesis-point" data-thesis-point-index="${index}" ${buttonTooltip}${disabledReason ? ' disabled aria-disabled="true"' : ""}><span>推进</span>${riskText ? `<span class="event-choice-risk is-${risk!.risk}" aria-label="${escapeHtml(risk!.explanation)}">${risk!.risk === "certain" ? "！" : "？"}</span>` : ""}<small class="rel-action-cost">SAN-${renderAnimatedNumber(`${pointIdentity}:san-cost`, sanCost)}</small></button>
      </div>`;
    }).join("")}${state.degree === "master" ? `<div class="graduation-point is-unused" data-graduation-point="2"><span class="rel-detail-label">研究点3</span><div class="rel-progress-bar graduation-point-bar" role="meter" aria-label="研究点3（硕士无需推进）" aria-valuemin="0" aria-valuemax="${formatMoney(scale)}" aria-valuenow="0"></div><strong class="rel-progress-val">0</strong><span class="graduation-unused-action">硕士不需要</span></div>` : ""}</div>
    ${thesis.reviewResolved && review?.reason ? `<p class="graduation-review-reason">${escapeHtml(review.reason)}</p>` : ""}
    ${pendingNotice && !thesis.reviewResolved ? `<button type="button" class="btn-sm rel-action-btn graduation-notice" data-ui-open-event-id="${escapeHtml(pendingNotice.id)}">查看通知</button>` : ""}
  </section>`;
}

function renderCareerCard(state: GameState): string {
  const unlocked = isGraduationPreparationUnlocked(state);
  const directions: CareerType[] = ["internet", "stateOwned", "civilService", "academic"];
  const hints = {
    internet: "初始准备参考：一作论文、实习经历；推进侧重技术与面试准备。",
    stateOwned: "初始准备参考：国奖、论文；推进侧重岗位笔试与面试。",
    civilService: "初始准备参考：国奖、论文；主要依靠行测、申论准备。",
    academic: "初始准备参考：论文数量、等级、引用；推进侧重研究计划与学术报告。",
  };
  return `<section class="graduation-card${unlocked ? "" : " is-locked"} rel-card filled rel-card-compact" data-graduation-card="career" aria-labelledby="graduation-career-title">
    <header class="rel-card-header paper-card-header graduation-career-header"><strong class="rel-name" id="graduation-career-title">找工作</strong><span class="graduation-status">${unlocked ? "已开放" : renderGraduationCountdown(monthsUntilOpening(state), "开放")}</span></header>
    <div class="graduation-careers">${directions.map((type) => {
      const failure = getCareerPreparationFailure(state, type);
      const cost = CAREER_PREPARATION_SAN_COST[type];
      const choice = { id: "advance", label: "推进", outcome: "", effects: { san: -cost } };
      const risk = failure ? null : getEventChoiceRiskDetails(state, { id: "career-preview", chainId: "career-preview", title: "求职推进", description: "", source: "career", stage: "act2", blocking: false, deadlineMonths: 0, choices: [choice] }, choice);
      const actionHint = failure ?? `本方向每月一次，不占行动点；SAN-${cost}${risk ? `\n${risk.explanation}` : ""}`;
      return `<div class="graduation-career-row">
      <strong class="rel-detail-label">${type === "internet" ? "私企" : escapeHtml(CAREER_DEFINITIONS[type].name)}</strong>
      <div class="rel-progress-bar graduation-career-bar" tabindex="0" role="meter" aria-label="${type === "internet" ? "私企" : escapeHtml(CAREER_DEFINITIONS[type].name)}准备能力" aria-valuemin="0" aria-valuemax="${Math.max(500, state.careerProgress[type])}" aria-valuenow="${formatMoney(unlocked ? state.careerProgress[type] : 0)}" ${tooltip(`${hints[type]}\n初始能力折算待定；当前显示已积累的准备进度。`)}><span class="rel-progress-fill research" style="width:${formatMoney(Math.min(100, (unlocked ? state.careerProgress[type] : 0) / 500 * 100))}%"></span></div>
      <strong class="rel-progress-val">${renderAnimatedNumber(`graduation:${state.degree}:career:${type}:progress`, unlocked ? state.careerProgress[type] : 0)}</strong>
      <button type="button" class="btn-sm rel-action-btn rel-cooperation-btn graduation-action" data-action="prepare-career" data-career-type="${type}" ${risk ? "data-event-risk-tooltip" : "data-card-tooltip"} data-tooltip="${escapeHtml(actionHint)}"${failure ? ' disabled aria-disabled="true"' : ""}>推进${risk ? `<span class="event-choice-risk is-${risk.risk}" aria-label="${escapeHtml(risk.explanation)}">！</span>` : ""}<small class="rel-action-cost">SAN-${cost}</small></button>
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

export function renderThesisReviewReports(presentation: NonNullable<PendingEvent["thesisReviewPresentation"]>): string {
  if (!presentation.review.submitted) return "";
  const identity = `thesis-review:${presentation.degree}:${presentation.title}`;
  return `<div class="graduation-review-reports">
    <div class="graduation-review-point-scores">${presentation.pointScores.map((score, index) => `<span>研究点${formatMoney(index + 1)} <strong>${renderAnimatedNumber(`${identity}:point:${index}`, score)}</strong></span>`).join("")}</div>
    <div class="graduation-review-table-scroll" tabindex="0" role="region" aria-label="盲审专家报告">
      <table class="graduation-review-table"><caption>盲审专家报告</caption>
        <thead><tr><th scope="col">专家</th><th scope="col">研究点权重</th><th scope="col">加权原始分</th><th scope="col">评分</th><th scope="col">等级</th></tr></thead>
        <tbody>${presentation.review.reports.map((report, index) => {
          const displayWeights = report.weights.map(roundMoney);
          displayWeights[displayWeights.length - 1] = roundMoney(3 - displayWeights.slice(0, -1).reduce((sum, weight) => sum + weight, 0));
          return `<tr class="graduation-review-grade-${report.grade.toLowerCase()}">
            <th scope="row" tabindex="0" ${tooltip(report.comment)}>专家${formatMoney(index + 1)}</th>
            <td ${tooltip(`按研究点顺序；合计${formatMoney(3)}`)}>${displayWeights.map(formatMoney).join(" / ")}</td>
            <td>${renderAnimatedNumber(`${identity}:expert:${index}:effective`, report.effectiveScore)}</td>
            <td>${renderAnimatedNumber(`${identity}:expert:${index}:score`, report.score)} / ${formatMoney(100)}</td>
            <td><strong>${report.grade}</strong></td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>
  </div>`;
}
import "../styles/graduation.css";

