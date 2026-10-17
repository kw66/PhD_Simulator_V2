import { ADVISOR_GRANTS } from "../core/v2-advisor-progress";
import { formatMoney } from "../core/v2-money";
import { getFellowName } from "../core/v2-fellow-progression";
import { getLoverName } from "../core/v2-lover-system";
import { getRewinderPreview } from "../core/v2-rewinder";
import type { RewinderYearRecord } from "../core/v2-rewinder-state";
import type { GameState } from "../core/v2-types";
import "../styles/rewinder-event.css";

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const growthLabels = {
  readCount: "读论文", partTimeWorkCount: "打工", badmintonCount: "羽毛球", pokerCount: "打牌",
  teachersDayErrandCount: "跑腿", terrariaCount: "泰拉瑞亚", magicTowerCount: "魔塔", rocoCount: "洛克王国",
  meetingCount: "参会", domesticMeetingCount: "国内参会", asiaMeetingCount: "亚洲参会", westMeetingCount: "欧美参会",
  internshipCount: "实习", hasInternshipExperience: "实习经历", hasJointTrainingExperience: "联培经历",
} as const;

function comparison(label: string, before: string | number, after: string | number): string {
  const display = (value: string | number): string => escapeHtml(typeof value === "number" ? formatMoney(value) : value);
  return `<div class="rewinder-comparison${before !== after ? " is-improved" : ""}"><span>${escapeHtml(label)}</span><span class="rewinder-comparison-values"><span>${display(before)}</span><span aria-label="变为">→</span><strong>${display(after)}</strong></span></div>`;
}

function advisorRank(record: RewinderYearRecord): string {
  const index = ADVISOR_GRANTS.reduce((highest, grant, current) => record.relationships.advisor.awards.some(award => award.id === grant.id) ? current : highest, -1);
  return ["讲师", "副教授", "四级教授", "三级教授", "二级教授", "一级教授"][index + 1] ?? "一级教授";
}

/** Historical stages use their frozen comparisons; only a live annual event offers choices. */
export function renderRewinderEvent(presentation: { year: number; before: RewinderYearRecord; after: RewinderYearRecord }, state?: GameState): string {
  const live = state ? getRewinderPreview(state) : null;
  const { year, before, after } = live ?? presentation;
  const values = before.growth.attributes;
  const inherited = after.growth.attributes;
  const people = live?.candidates ?? [];
  const awards = (record: RewinderYearRecord): string => record.relationships.advisor.awards
    .map(award => ADVISOR_GRANTS.find(grant => grant.id === award.id)?.name ?? award.id).join("、") || "暂无";
  const fellowNames = (record: RewinderYearRecord): string => record.relationships.fellows.map(person => getFellowName(person.profile)).join("、") || "暂无";
  const loverNames = (record: RewinderYearRecord): string => record.relationships.lovers.map(person => getLoverName(person.lover)).join("、") || "暂无";
  return `<section class="rewinder-event" aria-label="第${year}学年轮回对比">
    <div class="rewinder-event-heading"><strong>第${year}学年 · 往世回响</strong><span>本世 → 轮回后</span></div>
    <section class="rewinder-event-section"><h3>属性 <small>当前值 / 上限</small></h3><div class="rewinder-comparison-grid">
      ${([ ["SAN", "san", "sanCap"], ["科研", "research", "researchCap"], ["社交", "social", "socialCap"], ["导师好感", "favor", "favorCap"] ] as const)
        .map(([label, value, cap]) => comparison(label, `${formatMoney(values[value])} / ${formatMoney(values[cap])}`, `${formatMoney(inherited[value])} / ${formatMoney(inherited[cap])}`)).join("")}
    </div></section>
    <section class="rewinder-event-section"><h3>成长</h3><div class="rewinder-comparison-grid is-growth">
      ${Object.entries(growthLabels).map(([rawKey, label]) => {
        const key = rawKey as keyof typeof growthLabels;
        const previous = before.growth.growth[key]; const next = after.growth.growth[key];
        return comparison(label, typeof previous === "boolean" ? previous ? "有" : "无" : previous, typeof next === "boolean" ? next ? "有" : "无" : next);
      }).join("")}
    </div></section>
    <section class="rewinder-event-section"><h3>导师</h3><div class="rewinder-comparison-grid">
      ${comparison("科研经费", before.relationships.advisor.funding, after.relationships.advisor.funding)}
      ${comparison("科研积累", before.relationships.advisor.researchAccumulation, after.relationships.advisor.researchAccumulation)}
      ${comparison("职称", advisorRank(before), advisorRank(after))}
      ${comparison("已获帽子", awards(before), awards(after))}
    </div></section>
    <section class="rewinder-event-section"><h3>人际</h3><div class="rewinder-comparison-grid">
      ${comparison("同学", fellowNames(before), fellowNames(after))}${comparison("恋人", loverNames(before), loverNames(after))}
    </div></section>
    ${live ? `<section class="rewinder-event-section"><h3>往世故人 <small>勾选后加入空位</small></h3>
      ${people.length ? `<div class="rewinder-people">${people.map(person => `<button type="button" class="rewinder-person${person.selected ? " is-selected" : ""}" data-action="toggle-rewinder-person" data-rewinder-person-key="${escapeHtml(person.key)}" aria-pressed="${person.selected}"${person.disabledReason && !person.selected ? ` disabled aria-disabled="true"` : ""}>
        <span class="rewinder-person-check" aria-hidden="true">${person.selected ? "✓" : ""}</span><span class="rewinder-person-content"><strong>${escapeHtml(person.name)} <small>${person.kind === "lover" ? "恋人" : "同学"}</small></strong><span>${escapeHtml(person.detail)}</span>${person.disabledReason ? `<em>${escapeHtml(person.disabledReason)}</em>` : ""}</span>
      </button>`).join("")}</div>` : '<p class="rewinder-empty">这一学年尚无往世故人，本世人际将随记录留存。</p>'}
    </section>` : ""}
  </section>`;
}
