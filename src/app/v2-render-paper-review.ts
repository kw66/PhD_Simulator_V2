import { formatMoney } from "../core/v2-money";
import { getReviewThresholds } from "../core/v2-review-config";
import { formatEventSanChange } from "../core/v2-sanity-rules";
import type { PaperReviewEventPresentation, PaperReviewerReport } from "../core/v2-types";
import { getConferenceGlobalStats, type ConferenceStatsMeanKey } from "./v2-conference-stats";
import { renderPaperTerm } from "./v2-paper-terms";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${formatMoney(value)}`;
}

function improvementText(report: PaperReviewerReport): string {
  return (["idea", "experiment", "writing"] as const).flatMap((field) => {
    const amount = (report.improvements?.[field] ?? 0) + (report.improvementAction === field ? report.improvementAmount ?? 0 : 0);
    return amount ? [`${field === "experiment" ? "实验" : field === "writing" ? "写作" : "idea"} ${signed(amount)}`] : [];
  }).join(" · ");
}

const RESULT_COLUMNS: Array<{ key: ConferenceStatsMeanKey; tone: string }> = [
  { key: "Reject", tone: "reject" },
  { key: "Poster", tone: "poster" },
  { key: "Spotlight", tone: "spotlight" },
  { key: "Oral", tone: "oral" },
  { key: "Best Paper Candidate", tone: "candidate" },
  { key: "Best Paper", tone: "best" },
];

function renderOverview(presentation: Extract<PaperReviewEventPresentation, { kind: "overview" }>): string {
  const stats = getConferenceGlobalStats(presentation.conferenceName, presentation.conferenceYear, presentation.target).data;
  const show = (value: number | null | undefined): string => value == null ? "−" : formatMoney(value);
  const rate = (count: number | undefined): string => stats && stats.submissions > 0 && count !== undefined
    ? `${(count / stats.submissions * 100).toFixed(1)}%` : "−";
  return `<section class="paper-review-event is-overview" data-conference-stats-name="${escapeHtml(presentation.conferenceName)}" data-conference-stats-year="${presentation.conferenceYear}" data-conference-stats-target="${presentation.target}">
    <header class="paper-review-conference-hero"><h2>${escapeHtml(presentation.conferenceName)}${presentation.conferenceYear}</h2><p class="paper-review-conference-fullname">${escapeHtml(presentation.conferenceFullName)}</p></header>
    <div class="paper-review-statistics"><div class="paper-review-global-totals"><div><span>会议影响力</span><b>×${presentation.venueInfluence.toFixed(2)}</b></div><div><span>投稿数</span><b>${stats ? stats.submissions.toLocaleString("zh-CN") : "−"}</b></div><div><span>录用数</span><b>${stats ? stats.accepted.toLocaleString("zh-CN") : "−"}</b></div><div><span>录用率</span><b>${rate(stats?.accepted)}</b></div></div>
    <table class="paper-review-global-table" aria-label="会议评审统计"><thead><tr><th scope="col">结果</th>${RESULT_COLUMNS.map((column) => `<th scope="col" class="is-${column.tone}">${renderPaperTerm(column.key)}</th>`).join("")}</tr></thead>
      <tbody><tr><th scope="row">占比</th>${RESULT_COLUMNS.map((column) => `<td class="is-${column.tone}">${rate(column.key === "Reject" ? stats ? stats.submissions - stats.accepted : undefined : stats?.counts[column.key])}</td>`).join("")}</tr>
      <tr><th scope="row">均分</th>${RESULT_COLUMNS.map((column) => `<td class="is-${column.tone}">${show(stats?.means[column.key])}</td>`).join("")}</tr></tbody></table></div>
  </section>`;
}

function renderReviewers(presentation: Extract<PaperReviewEventPresentation, { kind: "reviewers" }>): string {
  return `<section class="paper-review-event is-reviewers">
    <header class="paper-review-paper-block"><h2>${escapeHtml(presentation.paperTitle)}</h2><table class="paper-review-submission" aria-label="投稿时分数"><thead><tr><th scope="col">idea</th><th scope="col">实验</th><th scope="col">写作</th><th scope="col">投稿总分</th></tr></thead><tbody><tr><td>${presentation.submittedScores.idea}</td><td>${presentation.submittedScores.experiment}</td><td>${presentation.submittedScores.writing}</td><td>${presentation.submittedScore}</td></tr></tbody></table></header>
    <div class="paper-reviewer-grid">${presentation.reports.map((report, index) => {
      const label = renderPaperTerm(report.decision);
      const improvement = improvementText(report);
      const threshold = report.reviewerType ? getReviewThresholds(presentation.target, presentation.venueInfluence)[report.reviewerType] : undefined;
      const tone = report.decision.toLowerCase();
      return `<article class="paper-reviewer-card is-${tone}">
        <div class="paper-reviewer-card-head"><span class="paper-reviewer-number">审稿人 ${index + 1}</span><strong class="paper-reviewer-verdict">${label}（${signed(report.reviewScore)}）</strong><h3>${escapeHtml(report.reviewer)}</h3></div>
        <div class="paper-reviewer-weights"><span>计算权重</span><p>${escapeHtml(report.weightInfo ?? "未记录")}</p></div>
        <dl class="paper-reviewer-metrics"><div><dt>有效分</dt><dd>${formatMoney(report.effectiveScore)}</dd></div><div><dt>${renderPaperTerm("Reject")} 阈值</dt><dd>${threshold ? `＜${threshold.reject}` : "−"}</dd></div><div><dt>${renderPaperTerm("Accept")} 阈值</dt><dd>${threshold ? `≥${threshold.borderline}` : "−"}</dd></div></dl>
        <blockquote class="paper-reviewer-comment">“${escapeHtml(report.comment ?? "未留下具体意见")}”</blockquote>
        <div class="paper-reviewer-effects">${improvement ? `<span>拒稿后修改：${escapeHtml(improvement)}</span>` : ""}${report.sanChange ? `<span>审稿影响 ${escapeHtml(formatEventSanChange(report.sanChange, report.illnessSanIncrease))}</span>` : ""}</div>
      </article>`;
    }).join("")}</div></section>`;
}

function pcAssessment(presentation: Extract<PaperReviewEventPresentation, { kind: "decision" }>): string {
  const votes = (["Accept", "Borderline", "Reject"] as const).flatMap((decision) => {
    const reviewers = (presentation.reports ?? []).flatMap((report, index) => report.decision === decision ? [index + 1] : []);
    return reviewers.length ? [`审稿人${reviewers.join("、")}给出了 ${renderPaperTerm(decision)}`] : [];
  });
  return `${votes.join("；")}${votes.length ? "。" : ""}`;
}

export function renderPaperReviewEvent(
  presentation: PaperReviewEventPresentation,
  settled: boolean,
  renderSettlement: (items: string[]) => string,
): string {
  if (presentation.kind === "overview") return renderOverview(presentation);
  if (presentation.kind === "reviewers") return renderReviewers(presentation);
  const change = presentation.scoreChange;
  const resultItems = presentation.rewardText.split("；").map((item) => item.trim()).filter((item) => item && item !== "论文退回草稿" && item !== "本轮无分数提升" && !item.startsWith("修改反馈："));
  for (const [field, label] of [["idea", "idea"], ["experiment", "实验"], ["writing", "写作"]] as const) {
    if (change.submitted[field] !== change.afterSettlement[field]) resultItems.push(`${label} ${formatMoney(change.submitted[field])} → ${formatMoney(change.afterSettlement[field])}`);
  }
  resultItems.push(`论文总分 ${formatMoney(change.submitted.total)} → ${formatMoney(change.afterSettlement.total)}`);
  const venue = `${presentation.conferenceName ?? `${presentation.target}类会议`}${presentation.conferenceYear ?? ""}`;
  const award = renderPaperTerm(presentation.acceptType ?? "Poster");
  return `<section class="paper-review-event is-decision ${presentation.accepted ? "is-accepted" : "is-rejected"}">
    <section class="paper-review-pc"><h3>${renderPaperTerm("PC Meta Review")}</h3><p>${pcAssessment(presentation)}</p><dl class="paper-review-pc-summary"><div><dt>总审稿分</dt><dd>${signed(presentation.totalReviewScore)}</dd></div>${presentation.borderlineChance === null ? "" : `<div><dt>${renderPaperTerm("Borderline")} 录用概率</dt><dd>${(presentation.borderlineChance * 100).toFixed(1)}%</dd></div>`}<div><dt>最终决定</dt><dd class="paper-review-pc-verdict">${renderPaperTerm(presentation.accepted ? "Accept" : "Reject")}</dd></div></dl></section>
    <div class="paper-review-decision-head"><span class="paper-review-result-icon" aria-hidden="true">${presentation.accepted ? "🎉" : "😥"}</span><strong>${presentation.accepted ? "恭喜" : "很遗憾"}，${escapeHtml(venue)} 给出了 ${renderPaperTerm(presentation.accepted ? "Accept" : "Reject")}</strong><p>${presentation.accepted ? `录用类型：${award}` : "可根据审稿意见修改后重投其他会议"}</p></div>
    <section class="paper-review-settlement" aria-label="${settled ? "结算记录" : "本次结算"}">${renderSettlement(resultItems.map((item) => `结果：${item}`))}</section>
  </section>`;
}
