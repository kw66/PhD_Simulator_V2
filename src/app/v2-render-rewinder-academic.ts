import { getAcademicArchivePreview } from "../core/v2-rewinder-academic";
import type { AcademicYearRecord } from "../core/v2-rewinder-academic-record";
import { BIKE_TIER_DEFINITIONS } from "../core/v2-bike-system";
import { PUBLICATION_TALENT_DEFINITIONS } from "../core/v2-publication-talent";
import { formatMoney } from "../core/v2-money";
import { getAcceptedPaperScore } from "../core/v2-publication-rules";
import type { CoffeeState, GameState, Paper } from "../core/v2-types";
import "../styles/rewinder-academic.css";

export type AcademicArchiveAct = 0 | 1 | 2;
type Preview = NonNullable<ReturnType<typeof getAcademicArchivePreview>>;
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const number = (value: number | undefined): string => formatMoney(value ?? 0);
const ACTS = [
  { title: "让这一年，成为最好的起点", label: "属性定格", numeral: "I", line: "每一次走到这里，都让下一年的自己更进一步。" },
  { title: "带走成长，留下代表作", label: "成长与成果", numeral: "II", line: "经历逐项留下，论文选择一份完整的答案。" },
  { title: "选定与你走向下一年的人", label: "人际定稿", numeral: "III", line: "这一刻选定的六张卡片，将在下个九月与你重逢。" },
] as const;

function attributeCard(preview: Preview, label: string, key: "san" | "research" | "social" | "favor", cap: "sanCap" | "researchCap" | "socialCap" | "favorCap", icon: string): string {
  const { current, previous, best } = preview;
  const improved = best.attributes[key] > (previous?.attributes[key] ?? 0) || best.attributes[cap] > (previous?.attributes[cap] ?? 0);
  return `<article class="academic-stat-card${improved ? " is-improved" : ""}"><div class="academic-stat-heading"><i data-lucide="${icon}" aria-hidden="true"></i><h3>${label}</h3><span>${previous ? improved ? "刷新纪录" : "保留最佳" : "首次定格"}</span></div><div class="academic-stat-main"><strong>${number(best.attributes[key])}</strong><span>/ ${number(best.attributes[cap])}<small>上限</small></span></div><div class="academic-stat-comparison"><span>本次 <b>${number(current.attributes[key])} / ${number(current.attributes[cap])}</b></span><span>原纪录 <b>${previous ? `${number(previous.attributes[key])} / ${number(previous.attributes[cap])}` : "—"}</b></span></div></article>`;
}

function renderAttributes(preview: Preview): string {
  return `<div class="academic-attribute-grid">${attributeCard(preview, "SAN", "san", "sanCap", "heart-pulse")}${attributeCard(preview, "科研", "research", "researchCap", "brain")}${attributeCard(preview, "社交", "social", "socialCap", "users-round")}${attributeCard(preview, "导师好感", "favor", "favorCap", "heart-handshake")}</div><section class="academic-money-card"><div><i data-lucide="coins" aria-hidden="true"></i><span>留给下一年的金币</span></div><strong>${number(preview.best.attributes.money)}</strong><p>本次 ${number(preview.current.attributes.money)} <span>·</span> 原纪录 ${preview.previous ? number(preview.previous.attributes.money) : "—"}</p></section><p class="academic-footnote">当前值、上限和金币分别取最高值。本年纪录只用于下一年，重玩本年仍从原起点出发。</p>`;
}

function growthMetric(label: string, current: number | undefined, best: number | undefined): string {
  return `<div class="academic-growth-metric"><span>${label}</span><strong>${number(best)}</strong>${(best ?? 0) !== (current ?? 0) ? `<small>本次 ${number(current)}</small>` : '<small>已保留</small>'}</div>`;
}

function published(record: AcademicYearRecord): Paper[] {
  return [...new Map([...record.papers.papers, ...record.papers.externalPublications].filter(paper => paper.status === "published").map(paper => [paper.id, paper])).values()];
}

function paperChoice(preview: Preview, source: "current" | "previous", record: AcademicYearRecord): string {
  const papers = published(record);
  const selected = preview.paperSource === source;
  const firstAuthor = papers.filter(paper => !paper.nonFirstAuthor).length;
  const representative = [...papers].sort((a, b) => (b.publication?.citations ?? 0) - (a.publication?.citations ?? 0))[0];
  return `<button type="button" class="academic-paper-choice${selected ? " is-selected" : ""}" data-action="select-rewinder-archive-papers" data-rewinder-paper-source="${source}" aria-pressed="${selected}"><span class="academic-choice-heading"><strong>${source === "current" ? "本次成果" : "原归档成果"}</strong><span>${selected ? "✓ 已选定" : "选择这套成果"}</span></span><span class="academic-paper-metrics"><span><strong>${number(record.papers.totalResearchScore)}</strong>科研分</span><span><strong>${number(record.papers.totalCitations)}</strong>引用</span><span><strong>${papers.length}</strong>论文</span></span><span class="academic-paper-detail">一作 ${firstAuthor} 篇 · 合作 ${papers.length - firstAuthor} 篇</span><span class="academic-paper-title">${representative ? escapeHtml(representative.title) : "尚无已发表论文"}</span></button>`;
}

function selectedPaperList(preview: Preview): string {
  const record = preview.paperSource === "previous" ? preview.previous ?? preview.current : preview.current;
  const papers = published(record);
  if (!papers.length) return "";
  return `<details class="academic-paper-list"><summary>查看选定成果的全部 ${papers.length} 篇论文</summary><ol>${papers.map(paper => {
    const journal = paper.journalTarget ?? paper.publication?.journalTarget;
    const venue = journal ? journal === "nature" ? "Nature" : journal.toUpperCase() : `${paper.target ?? ""}类会议`;
    return `<li><strong>${escapeHtml(paper.title)}</strong><span>${venue} · ${paper.nonFirstAuthor ? "合作" : "一作"} · 录用分 ${number(getAcceptedPaperScore(paper))} · 引用 ${number(paper.publication?.citations)}</span></li>`;
  }).join("")}</ol></details>`;
}

const coffeeLabels: Record<Exclude<CoffeeState["machineUpgrade"], null>, string> = {
  manual: "手动咖啡机", automatic: "自动咖啡机", advanced: "高级咖啡机", unlimited: "无限咖啡机",
};
function coffeeLabel(coffee: CoffeeState): string { return !coffee.machineOwned ? "未购置咖啡机" : coffee.machineUpgrade ? coffeeLabels[coffee.machineUpgrade] : "咖啡机"; }

function renderGrowth(preview: Preview): string {
  const { current, best, previous } = preview;
  const growth = best.growth;
  const currentGrowth = current.growth;
  const talents = new Set(growth.publicationTalentState?.claimedIds ?? []);
  const talentNames = PUBLICATION_TALENT_DEFINITIONS.filter(item => talents.has(item.id)).map(item => item.name);
  const bike = best.equipment.bike;
  const coffee = best.equipment.coffee;
  const coffeeChoice = !!previous && current.equipment.coffee.machineOwned && previous.equipment.coffee.machineOwned
    && current.equipment.coffee.machineUpgrade !== previous.equipment.coffee.machineUpgrade;
  return `<div class="academic-growth-metrics">${growthMetric("读论文", currentGrowth.readingState.readCount, growth.readingState.readCount)}${growthMetric("打工", currentGrowth.partTimeWorkCount, growth.partTimeWorkCount)}${growthMetric("实习经历", currentGrowth.internshipCount, growth.internshipCount)}${growthMetric("国奖", currentGrowth.scholarshipState.awardCount, growth.scholarshipState.awardCount)}${growthMetric("论文熟手", currentGrowth.paperMasteryState?.count, growth.paperMasteryState?.count)}</div><div class="academic-record-line"><span>实验室传承 <strong>${number(growth.displayCounters.labResearchGrowth)}</strong></span><span>论文合作 · 我的一作 <strong>${number(growth.displayCounters.playerLedPublications)}</strong></span><span>论文合作 · 同伴一作 <strong>${number(growth.displayCounters.fellowLedPublications)}</strong></span></div><div class="academic-kept-grid"><section class="academic-kept-card"><h3><i data-lucide="sparkles" aria-hidden="true"></i>永久成长</h3><div class="academic-kept-tags">${best.permanentBuffs.length ? best.permanentBuffs.map(buff => `<span title="${escapeHtml(buff.description ?? buff.name)}">${escapeHtml(buff.name)}</span>`).join("") : '<span class="is-empty">尚无永久buff</span>'}</div><p>成长、经历与事件计数分别取最佳。</p></section><section class="academic-kept-card"><h3><i data-lucide="award" aria-hidden="true"></i>发表天赋</h3><div class="academic-kept-tags">${talentNames.length ? talentNames.map(name => `<span>${escapeHtml(name)}</span>`).join("") : '<span class="is-empty">尚未解锁发表天赋</span>'}</div><p>已达成的天赋保留，旧奖励不会重复发放。</p></section></div><div class="academic-equipment-row"><div><i data-lucide="footprints" aria-hidden="true"></i><span><strong>${bike.bikeOwned ? BIKE_TIER_DEFINITIONS.find(item => item.level === bike.bikeLevel)?.name ?? "自行车" : "未购置自行车"}</strong><small>骑行积累 ${number(bike.bikeSanSpent)} · 已增SAN上限 ${number(bike.bikeSanCapGains)}</small></span></div><div><i data-lucide="coffee" aria-hidden="true"></i><span><strong>${coffeeLabel(coffee)}</strong><small>累计制作 ${number(coffee.machineTrackedCoffeeCount)} 杯</small></span></div></div>${coffeeChoice ? `<div class="academic-coffee-choice"><span>选择保留的咖啡机路线</span>${(["current", "previous"] as const).map(source => `<button type="button" data-action="select-rewinder-archive-coffee" data-rewinder-coffee-source="${source}" aria-pressed="${preview.coffeeSource === source}">${source === "current" ? "本次" : "原档案"} · ${coffeeLabel(source === "current" ? current.equipment.coffee : previous!.equipment.coffee)}</button>`).join("")}</div>` : ""}<section class="academic-paper-section"><div class="academic-section-heading"><h3>选择一整套论文成果</h3><p>论文、引用与科研分一同保留，不拼接不同尝试。</p></div><div class="academic-paper-options">${paperChoice(preview, "current", current)}${previous ? paperChoice(preview, "previous", previous) : ""}</div>${selectedPaperList(preview)}</section><p class="academic-footnote">只留下已发表论文；待参会论文按已完成展示保存。在研、在投论文及临时buff清除。</p>`;
}

function personCard(person: Preview["candidates"][number], selectedSlot = false): string {
  const kind = person.kind === "advisor" ? "导师" : person.kind === "lover" ? "恋人" : "同伴";
  return `<button type="button" class="academic-person-card${person.selected ? " is-selected" : ""}${selectedSlot ? " is-final" : ""}" data-action="toggle-rewinder-archive-person" data-rewinder-person-key="${escapeHtml(person.key)}" aria-pressed="${person.selected}"${person.disabledReason && !person.selected ? ` disabled title="${escapeHtml(person.disabledReason)}"` : ""}><span class="academic-person-top"><span class="academic-person-kind">${kind}</span><small>${person.key.startsWith("previous:") ? "原档案" : "本次"}</small><span class="academic-person-check" aria-hidden="true">${person.selected ? "✓" : "+"}</span></span><strong>${escapeHtml(person.name)}</strong><span class="academic-person-detail">${escapeHtml(person.detail)}</span><span class="academic-person-state">${person.selected ? person.kind === "advisor" ? "已选定 · 在候选中替换" : "已选定 · 点击移出" : person.disabledReason ? escapeHtml(person.disabledReason) : "选择此卡"}</span></button>`;
}

function renderPeople(preview: Preview): string {
  const selected = preview.candidates.filter(person => person.selected);
  const slots = [selected.find(person => person.kind === "advisor"), selected.find(person => person.kind === "lover"), ...Array.from({ length: 4 }, (_, index) => selected.filter(person => person.kind === "fellow")[index])];
  const alternatives = preview.candidates.filter(person => !person.selected);
  return `<div class="academic-section-heading"><h3>下一年的六个席位</h3><p>导师 ${selected.filter(person => person.kind === "advisor").length}/1 · 恋人 ${selected.filter(person => person.kind === "lover").length}/1 · 同伴 ${selected.filter(person => person.kind === "fellow").length}/4</p></div><div class="academic-final-people">${slots.map((person, index) => person ? personCard(person, true) : `<div class="academic-person-empty"><i data-lucide="${index === 0 ? "graduation-cap" : index === 1 ? "heart" : "user-round"}" aria-hidden="true"></i><strong>${index === 0 ? "导师" : index === 1 ? "恋人" : `同伴 ${index - 1}`}</strong><span>空席</span></div>`).join("")}</div>${alternatives.length ? `<section class="academic-alternative-people"><div class="academic-section-heading"><h3>可以替换的人际卡</h3><p>整张卡片保存，科研、关系和任务进度一同留下。</p></div><div class="academic-candidate-people">${alternatives.map(person => personCard(person)).join("")}</div></section>` : '<p class="academic-footnote">本次没有其他候选卡片。空席可以留给下一年的相遇。</p>'}<div class="academic-final-note"><i data-lucide="book-open" aria-hidden="true"></i><span>确认后保存第${preview.year}学年档案。下次可以重玩本年，或以这份档案开始第${preview.year + 1}学年。</span></div>`;
}

/** Three separate pages, deliberately independent of the ordinary event panel. */
export function renderAcademicArchive(state: GameState, requestedAct: AcademicArchiveAct = 0, saveStatus = ""): string {
  const preview = getAcademicArchivePreview(state);
  if (!preview) return "";
  const act: AcademicArchiveAct = requestedAct === 1 || requestedAct === 2 ? requestedAct : 0;
  const scene = ACTS[act];
  const completed = !!state.rewinderState?.academic?.completed;
  let content = act === 0 ? renderAttributes(preview) : act === 1 ? renderGrowth(preview) : renderPeople(preview);
  if (completed) content = content.replace(/<button\b[^>]*>/g, tag => tag.includes(" disabled") ? tag : tag.replace(">", " disabled>"));
  return `<div class="academic-archive-overlay" role="dialog" aria-modal="true" aria-labelledby="academic-archive-title" data-academic-archive-act="${act}"><section class="academic-archive-panel"><header class="academic-archive-header"><div class="academic-archive-meta"><span>第${preview.year}学年 · 八月终章</span><span>第${preview.cycleNumber ?? 1}次轮回</span></div><div class="academic-act-seal" aria-hidden="true">${scene.numeral}</div><div class="academic-archive-heading"><span>第${["一", "二", "三"][act]}幕 · ${scene.label}</span><h2 id="academic-archive-title" tabindex="-1">${scene.title}</h2><p>${scene.line}</p></div><div class="academic-act-progress" aria-label="第${act + 1}幕，共3幕">${ACTS.map((item, index) => `<span class="${index === act ? "is-current" : index < act ? "is-complete" : ""}"><i aria-hidden="true">${index < act ? "✓" : index + 1}</i>${item.label}</span>`).join("")}</div></header><div class="academic-archive-body" data-academic-act-page="${act}">${content}</div>${saveStatus ? `<div class="academic-save-error" role="alert">${escapeHtml(saveStatus)}</div>` : ""}<footer class="academic-archive-footer">${act > 0 ? `<button class="academic-back-button" type="button" data-ui-academic-archive-act="${act - 1}"><i data-lucide="chevron-left" aria-hidden="true"></i>上一幕</button>` : '<span class="academic-save-note">所有选择确认后统一保存</span>'}${act < 2 ? `<button class="academic-next-button" type="button" data-ui-academic-archive-act="${act + 1}">下一幕 · ${ACTS[act + 1].label}<i data-lucide="arrow-right" aria-hidden="true"></i></button>` : `<button class="academic-next-button is-confirm" type="button" data-action="confirm-rewinder-archive"${preview.canConfirm ? "" : ' disabled title="请先选定一位导师，并检查人际卡数量"'}><i data-lucide="badge-check" aria-hidden="true"></i>${completed ? "重试保存并返回" : "定稿归档 · 返回开始页"}</button>`}</footer></section></div>`;
}
