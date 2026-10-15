import { formatMoney } from "../core/v2-money";
import { getReviewThresholds } from "../core/v2-review-config";
import { formatEventSanChange } from "../core/v2-sanity-rules";
import type { JournalAcceptancePresentation, PaperReviewEventPresentation, PaperReviewerReport, PaperReviewerType } from "../core/v2-types";
import { getAcademicCalendarMonth, getAcademicCalendarYear } from "../core/v2-calendar";
import { getConferenceGlobalStats, type ConferenceStatsMeanKey } from "./v2-conference-stats";
import { getJournalGlobalStats } from "./v2-journal-stats";
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

const REVIEWER_EMOJI: Record<PaperReviewerType, string> = {
  novelty: "💡", experiment: "🧪", normal: "📝", gpt: "🤖",
  expert: "🔎", kind: "🤝", strict: "🧐", hostile: "😠",
};

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
  const acceptedRate = rate(stats?.accepted);
  return `<section class="paper-review-event is-overview" data-conference-stats-name="${escapeHtml(presentation.conferenceName)}" data-conference-stats-year="${presentation.conferenceYear}" data-conference-stats-target="${presentation.target}">
    <header class="paper-review-conference-hero is-grade-${presentation.target.toLowerCase()}"><div class="paper-review-conference-title"><span class="paper-review-conference-grade">${presentation.target} 类会议</span><h2>${escapeHtml(presentation.conferenceName)}${presentation.conferenceYear}</h2></div><p class="paper-review-conference-fullname">${escapeHtml(presentation.conferenceFullName)}</p></header>
    <div class="paper-review-global-totals"><div><span>影响力</span><b>×${presentation.venueInfluence.toFixed(2)}</b></div><div><span>投稿数</span><b>${stats ? stats.submissions.toLocaleString("zh-CN") : "−"}</b></div><div><span>录用数</span><b>${stats ? stats.accepted.toLocaleString("zh-CN") : "−"}</b></div><div><span>录用率</span><b>${acceptedRate}</b></div></div>
    <section class="paper-review-distribution" aria-label="会议评审统计"><h3>本届结果分布 ${stats ? "" : '<span class="paper-review-distribution-status">统计暂未同步</span>'}</h3><div class="paper-review-distribution-grid">${RESULT_COLUMNS.map((column) => {
      const count = column.key === "Reject" ? stats ? stats.submissions - stats.accepted : undefined : stats?.counts[column.key];
      const share = stats && stats.submissions > 0 && count !== undefined ? Math.max(0, Math.min(100, count / stats.submissions * 100)) : 0;
      return `<div class="paper-review-distribution-item is-${column.tone}" style="--result-share:${share.toFixed(1)}%"><span class="paper-review-distribution-label">${renderPaperTerm(column.key)}</span><strong>${rate(count)}</strong><span class="paper-review-distribution-mean">均分 ${show(stats?.means[column.key])}</span><i aria-hidden="true"></i></div>`;
    }).join("")}</div></section>
  </section>`;
}

function renderReviewers(presentation: Extract<PaperReviewEventPresentation, { kind: "reviewers" }>): string {
  const reviewedTotal = presentation.reviewedScores.idea + presentation.reviewedScores.experiment + presentation.reviewedScores.writing;
  const scores = (["idea", "experiment", "writing", "total"] as const).map((field) => {
    const submitted = field === "total" ? presentation.submittedScore : presentation.submittedScores[field];
    const reviewed = field === "total" ? reviewedTotal : presentation.reviewedScores[field];
    const change = reviewed - submitted;
    const label = field === "experiment" ? "实验" : field === "writing" ? "写作" : field === "total" ? "总分" : "idea";
    return `<div class="paper-review-score-item is-${field} ${change < 0 ? "is-decayed" : change > 0 ? "is-gained" : "is-steady"}"><span>${label}</span><strong>${formatMoney(submitted)} <i aria-hidden="true">→</i> ${formatMoney(reviewed)}</strong><small>${change < 0 ? `衰减 ${formatMoney(-change)}` : change > 0 ? `增加 ${signed(change)}` : "未变化"}</small></div>`;
  });
  return `<section class="paper-review-event is-reviewers">
    <header class="paper-review-paper-block"><h2>${escapeHtml(presentation.paperTitle)} <span aria-hidden="true">📄</span></h2><p>投稿分 → 审稿时${presentation.reviewDurationMonths ? ` · 送审 ${presentation.reviewDurationMonths} 月` : ""}</p><div class="paper-review-score-grid" aria-label="送审期间四项分数变化">${scores.join("")}</div></header>
    <div class="paper-reviewer-grid">${presentation.reports.map((report, index) => {
      const label = renderPaperTerm(report.decision);
      const improvement = improvementText(report);
      const threshold = report.reviewerType ? getReviewThresholds(presentation.target, presentation.venueInfluence)[report.reviewerType] : undefined;
      const tone = report.decision.toLowerCase();
      return `<article class="paper-reviewer-card is-${tone}">
        <div class="paper-reviewer-card-head"><span class="paper-reviewer-number">Review ${escapeHtml(report.reviewCode ?? String(index + 1))}</span><strong class="paper-reviewer-verdict">${label}（${signed(report.reviewScore)}）</strong><h3>${escapeHtml(report.reviewer)}</h3></div>
        <div class="paper-reviewer-weights"><span>权重</span><p>${escapeHtml(report.weightInfo ?? "未记录")}</p></div>
        <dl class="paper-reviewer-metrics"><div><dt>有效分</dt><dd>${formatMoney(report.effectiveScore)}</dd></div><div><dt>${renderPaperTerm("Reject")} 阈值</dt><dd>${threshold ? `＜${threshold.reject}` : "−"}</dd></div><div><dt>${renderPaperTerm("Accept")} 阈值</dt><dd>${threshold ? `≥${threshold.borderline}` : "−"}</dd></div></dl>
        <blockquote class="paper-reviewer-comment">“${escapeHtml(report.comment ?? "未留下具体意见")}” <span aria-hidden="true">${REVIEWER_EMOJI[report.reviewerType ?? "normal"]}</span></blockquote>
        <div class="paper-reviewer-effects">${improvement ? `<span>拒稿后修改：${escapeHtml(improvement)}</span>` : ""}${report.sanChange ? `<span>审稿影响 ${escapeHtml(formatEventSanChange(report.sanChange, report.illnessSanIncrease))}</span>` : ""}</div>
      </article>`;
    }).join("")}</div></section>`;
}

function pcAssessment(presentation: Extract<PaperReviewEventPresentation, { kind: "decision" }>): { votes: string; comment: string } {
  const votes = (["Accept", "Borderline", "Reject"] as const).flatMap((decision) => {
    const reviewers = (presentation.reports ?? []).flatMap((report, index) => report.decision === decision ? [index + 1] : []);
    return reviewers.length ? [`${reviewers.map((index) => `Review ${escapeHtml(presentation.reports?.[index - 1]?.reviewCode ?? String(index))}`).join("、")} 给出了 ${renderPaperTerm(decision)}`] : [];
  });
  const concern = (presentation.reports ?? []).find((report) => report.decision === "Reject" && report.comment?.trim())
    ?? (presentation.reports ?? []).find((report) => report.decision === "Borderline" && report.comment?.trim())
    ?? (presentation.reports ?? []).find((report) => report.comment?.trim());
  return {
    votes: votes.length ? `评审概况：${votes.join("；")}。` : "评审概况：审稿意见已汇总。",
    comment: presentation.accepted
      ? `PC 评语：综合评审后，论文达到本届录用要求。${concern?.comment ? `定稿时建议回应：“${escapeHtml(concern.comment)}”。` : "定稿时仍需仔细回应审稿意见。"}`
      : `PC 评语：综合评审后，论文暂未达到本届录用要求。${concern?.comment ? `优先处理：“${escapeHtml(concern.comment)}”。` : "建议根据审稿意见补充论证后再投稿。"}`,
  };
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
  const assessment = pcAssessment(presentation);
  return `<section class="paper-review-event is-decision ${presentation.accepted ? "is-accepted" : "is-rejected"}">
    <section class="paper-review-pc"><h3>${renderPaperTerm("PC Meta Review")} <span aria-hidden="true">📝</span></h3><p>${assessment.votes}</p><p class="paper-review-pc-comment">${assessment.comment}</p><dl class="paper-review-pc-summary"><div><dt>总审稿分</dt><dd>${signed(presentation.totalReviewScore)}</dd></div>${presentation.borderlineChance === null ? "" : `<div><dt>${renderPaperTerm("Borderline")} 录用概率</dt><dd>${(presentation.borderlineChance * 100).toFixed(1)}%</dd></div>`}<div><dt>最终决定</dt><dd class="paper-review-pc-verdict">${renderPaperTerm(presentation.accepted ? "Accept" : "Reject")}</dd></div></dl></section>
    <div class="paper-review-decision-head"><span class="paper-review-result-icon" aria-hidden="true">${presentation.accepted ? "🎉" : "😥"}</span><strong>${presentation.accepted ? "恭喜" : "很遗憾"}，${escapeHtml(venue)} 给出了 ${renderPaperTerm(presentation.accepted ? "Accept" : "Reject")}</strong><p>${presentation.accepted ? `录用类型：${award}` : "可根据审稿意见修改后重投其他会议"}</p></div>
    <section class="paper-review-settlement" aria-label="${settled ? "结算记录" : "本次结算"}">${renderSettlement(resultItems.map((item) => `结果：${item}`))}</section>
  </section>`;
}

function journalMonthLabel(totalMonths: number): string {
  const gameYear = Math.floor((totalMonths - 1) / 12) + 1;
  const gameMonth = (totalMonths - 1) % 12 + 1;
  return `${getAcademicCalendarYear(gameYear, gameMonth)}/${getAcademicCalendarMonth(gameMonth)}`;
}

function renderJournalScoreChart(presentation: JournalAcceptancePresentation): string {
  const history = presentation.scoreHistory;
  const firstMonth = history[0]?.totalMonths ?? 1;
  const lastMonth = history.at(-1)?.totalMonths ?? firstMonth;
  const span = Math.max(0, lastMonth - firstMonth);
  const width = Math.max(720, span * 36 + 82, history.length * 20 + 82);
  const height = 194;
  const left = 44;
  const right = 20;
  const top = 18;
  const bottom = 38;
  const values = history.map((entry) => entry.score);
  const domainMin = Math.floor((Math.min(...values, presentation.submissionThreshold) - 10) / 10) * 10;
  const domainMax = Math.ceil((Math.max(...values, presentation.acceptanceThreshold) + 10) / 10) * 10;
  const x = (entry: JournalAcceptancePresentation["scoreHistory"][number], index: number): number => left
    + (span > 0 ? (entry.totalMonths - firstMonth) / span : index / Math.max(1, history.length - 1)) * (width - left - right);
  const y = (score: number): number => top + (domainMax - score) / Math.max(1, domainMax - domainMin) * (height - top - bottom);
  const points = history.map((entry, index) => ({ entry, x: x(entry, index), y: y(entry.score) }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const tickStep = Math.max(1, Math.ceil(span / 5));
  const tickMonths = span === 0 ? [firstMonth] : Array.from({ length: Math.floor(span / tickStep) + 1 }, (_, index) => firstMonth + index * tickStep);
  if (tickMonths.at(-1) !== lastMonth) tickMonths.push(lastMonth);
  return `<div class="journal-chart-scroll" tabindex="0" role="region" aria-label="????????"><svg class="journal-score-chart" data-score-chart-min-width="${Math.max(250, span * 30 + 64, history.length * 20 + 64)}" data-score-chart-left="${left}" data-score-chart-right="${right}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(presentation.journalName)}投稿分数走势，从${formatMoney(presentation.submissionScore)}分到${formatMoney(presentation.acceptanceScore)}分">
    ${[domainMin, (domainMin + domainMax) / 2, domainMax].map((value) => `<line class="journal-chart-grid" x1="${left}" y1="${y(value).toFixed(1)}" x2="${width - right}" y2="${y(value).toFixed(1)}" /><text class="journal-chart-y" x="${left - 8}" y="${(y(value) + 4).toFixed(1)}" text-anchor="end">${formatMoney(value)}</text>`).join("")}
    <line class="journal-chart-threshold" x1="${left}" y1="${y(presentation.acceptanceThreshold).toFixed(1)}" x2="${width - right}" y2="${y(presentation.acceptanceThreshold).toFixed(1)}" /><text class="journal-chart-threshold-label" x="${left + 6}" y="${(y(presentation.acceptanceThreshold) - 6).toFixed(1)}" text-anchor="start">达标 ${formatMoney(presentation.acceptanceThreshold)}</text>
    <path class="journal-chart-line" d="${path}" />
    ${points.map((point, index) => `<circle class="journal-chart-dot${index === points.length - 1 ? " is-final" : ""}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"><title>${journalMonthLabel(point.entry.totalMonths)} · ${formatMoney(point.entry.score)} 分</title></circle>`).join("")}
    ${tickMonths.map((month) => {
      const tickX = span > 0 ? left + (month - firstMonth) / span * (width - left - right) : points[0]?.x ?? width / 2;
      return `<text class="journal-chart-x" x="${tickX.toFixed(1)}" y="${height - 9}" text-anchor="${month === firstMonth ? "start" : month === lastMonth ? "end" : "middle"}">${journalMonthLabel(month)}</text>`;
    }).join("")}
  </svg></div>`;
}

export function renderJournalAcceptanceEvent(presentation: JournalAcceptancePresentation, storyHtml: string): string {
  if (presentation.stage === "overview") {
    const snapshot = getJournalGlobalStats(presentation.journalTarget);
    const stats = snapshot.data;
    return `<section class="journal-acceptance-event paper-review-event is-accepted" data-journal-stats-target="${presentation.journalTarget}">
      <header class="paper-review-decision-head"><span class="paper-review-result-icon" aria-hidden="true">🎉</span><strong>${escapeHtml(presentation.journalName)} ${renderPaperTerm("Accept")}</strong><p>《${escapeHtml(presentation.paperTitle)}》 · 中稿 ${formatMoney(presentation.acceptanceScore)} 分</p></header>
      <section class="journal-run-stats"><h3>所有玩家统计 ${snapshot.status !== "ready" ? '<span class="journal-stats-status">统计暂未同步</span>' : ""}</h3><div class="journal-run-stats-grid"><div><span>中稿均分</span><strong>${stats?.meanScore == null ? "—" : formatMoney(stats.meanScore)}</strong></div><div><span>平均投稿时长</span><strong>${stats?.meanMonths == null ? "—" : `${formatMoney(stats.meanMonths)} 月`}</strong></div><div><span>中稿数</span><strong>${stats?.acceptedCount ?? "—"}</strong></div></div></section>
    </section>`;
  }
  const firstMonth = presentation.scoreHistory[0]?.totalMonths ?? 1;
  const lastMonth = presentation.scoreHistory.at(-1)?.totalMonths ?? firstMonth;
  return `<section class="journal-acceptance-event paper-review-event is-timeline">
    <header class="journal-chart-heading"><h2>《${escapeHtml(presentation.paperTitle)}》投稿历程</h2><span>${escapeHtml(presentation.journalName.replace(/^(顶刊|子刊)/u, ""))} · 历时 ${Math.max(0, lastMonth - firstMonth)} 月</span></header>
    <div class="journal-chart-summary"><span>投稿 ${formatMoney(presentation.submissionScore)}</span><span aria-hidden="true">→</span><strong>中稿 ${formatMoney(presentation.acceptanceScore)}</strong><span>送审线 ${formatMoney(presentation.submissionThreshold)}</span></div>
    ${renderJournalScoreChart(presentation)}
    <div class="journal-acceptance-story">${storyHtml}</div>
  </section>`;
}
