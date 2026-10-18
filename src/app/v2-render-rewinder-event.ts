import { ADVISOR_GRANTS } from "../core/v2-advisor-progress";
import { formatMoney } from "../core/v2-money";
import { getFellowName } from "../core/v2-fellow-progression";
import { getLoverName } from "../core/v2-lover-system";
import { getRewinderPreview } from "../core/v2-rewinder";
import { normalizeRewinderCycleNumber } from "../core/v2-rewinder-cycle";
import type { RewinderPresentation, RewinderYearRecord } from "../core/v2-rewinder-state";
import type { GameState } from "../core/v2-types";
import "../styles/rewinder-event.css";

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Counters which still affect a future life. Meetings and career experiences are not part of the presentation. */
const growthLabels = {
  readCount: "读论文", partTimeWorkCount: "打工", badmintonCount: "羽毛球", pokerCount: "打牌",
  paperMasteryCount: "论文熟手", terrariaCount: "泰拉瑞亚", magicTowerCount: "魔塔", rocoCount: "洛克王国",
} as const;

const attributeRows = [
  ["SAN", "san", "sanCap"], ["科研", "research", "researchCap"],
  ["社交", "social", "socialCap"], ["导师好感", "favor", "favorCap"],
] as const;

function display(value: string | number): string {
  return escapeHtml(typeof value === "number" ? formatMoney(value) : value);
}

function comparison(label: string, before: string | number, after: string | number): string {
  return `<div class="rewinder-comparison${before !== after ? " is-improved" : ""}"><span class="rewinder-comparison-label">${escapeHtml(label)}</span><span class="rewinder-comparison-values"><span>${display(before)}</span><span aria-label="变为">→</span><strong>${display(after)}</strong></span></div>`;
}

function attributeCard(label: string, before: number, beforeCap: number, after: number, afterCap: number): string {
  const beforeText = `${formatMoney(before)} / ${formatMoney(beforeCap)}`;
  const afterText = `${formatMoney(after)} / ${formatMoney(afterCap)}`;
  const increases = [after > before ? `当前值 +${formatMoney(after - before)}` : "", afterCap > beforeCap ? `上限 +${formatMoney(afterCap - beforeCap)}` : ""].filter(Boolean);
  return `<div class="rewinder-stat-card${beforeText !== afterText ? " is-improved" : ""}" aria-label="${escapeHtml(label)}：${display(beforeText)} → ${display(afterText)}"><div class="rewinder-stat-label">${escapeHtml(label)} <span>当前 / 上限</span></div><div class="rewinder-stat-values"><span>${display(beforeText)}</span><i aria-hidden="true">→</i><strong>${formatMoney(after)}<small> / ${formatMoney(afterCap)}</small></strong></div><div class="rewinder-stat-gains">${increases.length ? increases.map(value => `<span>${value}</span>`).join("") : '<span class="is-unchanged">保持</span>'}</div></div>`;
}

function advisorRank(record: RewinderYearRecord): string {
  const index = ADVISOR_GRANTS.reduce((highest, grant, current) => record.relationships.advisor.awards.some(award => award.id === grant.id) ? current : highest, -1);
  return ["讲师", "副教授", "四级教授", "三级教授", "二级教授", "一级教授"][index + 1] ?? "一级教授";
}

function awards(record: RewinderYearRecord): string {
  return record.relationships.advisor.awards.map(award => ADVISOR_GRANTS.find(grant => grant.id === award.id)?.name ?? award.id).join("、") || "暂无";
}

function fellowNames(record: RewinderYearRecord): string {
  return record.relationships.fellows.map(person => getFellowName(person.profile)).join("、") || "暂无";
}

function loverNames(record: RewinderYearRecord): string {
  return record.relationships.lovers.map(person => getLoverName(person.lover)).join("、") || "暂无";
}

export type RewinderAct = "attributes" | "growth" | "relationships";

const acts: ReadonlyArray<{ id: RewinderAct; title: string; subtitle: string }> = [
  { id: "attributes", title: "属性", subtitle: "能力与上限" },
  { id: "growth", title: "成长", subtitle: "行动积累" },
  { id: "relationships", title: "人际", subtitle: "导师与故人" },
];

/** Historical stages use frozen comparisons; only a live annual event offers choices. */
export function renderRewinderEvent(presentation: RewinderPresentation, state?: GameState, act: RewinderAct = "attributes"): string {
  const live = state ? getRewinderPreview(state) : null;
  const { year, before, after } = live ?? presentation;
  const cycle = normalizeRewinderCycleNumber((live ?? presentation).cycleNumber);
  const values = before.growth.attributes;
  const inherited = after.growth.attributes;
  const people = live?.candidates ?? [];
  const peopleHtml = people.length
    ? `<div class="rewinder-people">${people.map(person => `<button type="button" class="rewinder-person${person.selected ? " is-selected" : ""}" data-action="toggle-rewinder-person" data-rewinder-person-key="${escapeHtml(person.key)}" aria-pressed="${person.selected}"${person.disabledReason && !person.selected ? ` disabled aria-disabled="true"` : ""}><span class="rewinder-person-check" aria-hidden="true">${person.selected ? "✓" : ""}</span><span class="rewinder-person-content"><strong>${escapeHtml(person.name)} <small>${person.kind === "lover" ? "恋人" : "同学"}</small></strong><span>${escapeHtml(person.detail)}</span>${person.disabledReason ? `<em>${escapeHtml(person.disabledReason)}</em>` : ""}</span></button>`).join("")}</div>`
    : '<p class="rewinder-empty">这一学年尚无可带回的故人，本世人际将随记录留存。</p>';

  const advisorHtml = `<div class="rewinder-advisor-card">
    <div class="rewinder-advisor-heading"><span>导师积累</span><strong>${escapeHtml(advisorRank(after))}</strong></div>
    <div class="rewinder-advisor-stats">
      ${comparison("科研经费", before.relationships.advisor.funding, after.relationships.advisor.funding)}
      ${comparison("科研积累", before.relationships.advisor.researchAccumulation, after.relationships.advisor.researchAccumulation)}
      ${comparison("职称", advisorRank(before), advisorRank(after))}
      ${comparison("已获帽子", awards(before), awards(after))}
    </div>
  </div>`;
  const relationshipsHtml = live
    ? `<div class="rewinder-people-section"><div class="rewinder-people-heading"><strong>往世故人</strong><span>自行勾选，加入本世空位</span></div>${peopleHtml}</div>`
    : `<div class="rewinder-history-people"><span>轮回后的人际</span><strong>同学：${escapeHtml(fellowNames(after))} · 恋人：${escapeHtml(loverNames(after))}</strong></div>`;

  const content = act === "attributes"
    ? `<div class="rewinder-scene-heading"><strong>能力，留在此刻</strong><span>与往世同一学年的记录逐项取高</span></div><div class="rewinder-stat-grid">${attributeRows.map(([label, value, cap]) => attributeCard(label, values[value], values[cap], inherited[value], inherited[cap])).join("")}</div>`
    : act === "growth"
      ? `<div class="rewinder-scene-heading"><strong>积累，自有回响</strong><span>与往世同一学年的行动次数逐项取高</span></div><div class="rewinder-comparison-grid is-growth">${Object.entries(growthLabels).map(([rawKey, label]) => { const key = rawKey as keyof typeof growthLabels; return comparison(label, before.growth.growth[key] ?? 0, after.growth.growth[key] ?? 0); }).join("")}</div>`
      : `${advisorHtml}${relationshipsHtml}`;

  return `<section class="rewinder-event" data-rewinder-act="${act}" data-rewinder-cycle="${cycle}" aria-label="第${cycle}次轮回 · 第${year}学年轮回对比">
    <header class="rewinder-event-heading"><div class="rewinder-time-orbit" aria-hidden="true"><span>${cycle}</span></div><div class="rewinder-hero-copy"><div class="rewinder-hero-kicker">第${year}学年 · 往世回响</div><div class="rewinder-hero-main"><strong>第${cycle}次轮回</strong><span>本世 <i aria-hidden="true">→</i> 轮回后</span></div><p>这一学年走到尽头，往世的积累再次与你相遇。</p></div></header>
    <nav class="rewinder-act-nav" aria-label="轮回三幕">${acts.map((item, index) => `<button type="button" class="rewinder-act-tab${act === item.id ? " is-active" : ""}" data-ui-rewinder-act="${item.id}" aria-pressed="${act === item.id}"><span class="rewinder-act-index">0${index + 1}</span><span class="rewinder-act-title"><strong>${item.title}</strong><small>${item.subtitle}</small></span></button>`).join("")}</nav>
    <section class="rewinder-scene rewinder-scene-${act}" aria-label="${acts.find(item => item.id === act)!.title}">${content}</section>
  </section>`;
}
