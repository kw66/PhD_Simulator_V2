import "../styles/event-ending.css";
import { getPlayerAttributeCap } from "../core/v2-player-attributes";
import { getAcademicCalendarMonth, getAcademicCalendarYear } from "../core/v2-calendar";
import type { CareerOffer } from "../core/v2-career-rules";
import { ADVISOR_GRANTS, getAdvisorRankLabel } from "../core/v2-advisor-progress";
import { getFellowName, getFellowRoleLabel } from "../core/v2-fellow-progression";
import { getCalendarForTotalMonths, getRoleDefinition } from "../core/v2-progression";
import { getResearchCap } from "../core/v2-research-cap-system";
import { getAcceptedPaperScore } from "../core/v2-publication-rules";
import { formatMoney } from "../core/v2-money";
import { getNextRoleLevelExperience } from "../core/v2-role-experience";
import { getAllAchievementDefinitions } from "../core/v2-role-lobby-meta";
import type { EndingId, GameState, Paper, RoleExperienceAward } from "../core/v2-types";

interface EndingPresentation {
  title: string;
  icon: string;
  tone: "success" | "failure" | "pause";
}

const ENDINGS: Record<Exclude<EndingId, null>, EndingPresentation> = {
  "lab-bankrupt": { title: "实验室破产", icon: "🏚️", tone: "failure" },
  master: { title: "硕士毕业", icon: "🎓", tone: "success" },
  phd: { title: "博士毕业", icon: "🎓", tone: "success" },
  burnout: { title: "不堪重负", icon: "😢", tone: "failure" },
  overthinking: { title: "用脑过度", icon: "🧠", tone: "failure" },
  poor: { title: "穷困潦倒", icon: "💸", tone: "failure" },
  expelled: { title: "逐出师门", icon: "😭", tone: "failure" },
  isolated: { title: "被孤立", icon: "😔", tone: "failure" },
  delay: { title: "延毕", icon: "⏰", tone: "pause" },
  quit: { title: "主动退学", icon: "🚪", tone: "pause" },
};

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function isEndingSystemLog(text: string): boolean {
  return /^(?:SAN|金币|导师好感|社交能力|科研能力)\s*已跌破\s*0，本轮提前结束。?$/u.test(text.trim())
    || text.trim() === "你选择了退学，本轮结束。"
    || /^(?:硕士毕业|博士毕业|延期毕业)：科研分\s/u.test(text.trim());
}

export function renderEndingLog(state: GameState): string {
  const ending = state.ending ? ENDINGS[state.ending] : null;
  return `<div class="log-content event-log-content" id="log-content">
    <button class="log-entry event-history-log-entry" type="button" data-ui-open-ending-content aria-label="回看${ending?.title ?? "本轮结局"}">
      <div class="event"><span class="log-entry-title log-entry-title-only">${ending?.icon ?? "📖"} 结局：${ending?.title ?? "本轮结束"}</span></div>
    </button>
  </div>`;
}

function getEndingPublications(state: GameState): Paper[] {
  return [...new Map([...state.papers, ...state.externalPublications]
    .filter((paper) => paper.status === "published"
      && (paper.nonFirstAuthor === true || !paper.leadAuthorId || paper.leadAuthorId === "player"))
    .map((paper) => [paper.id, paper])).values()];
}

function paperVenue(paper: Paper): string {
  const journal = paper.journalTarget ?? paper.publication?.journalTarget;
  return journal ? journal === "nature" ? "Nature" : journal.toUpperCase()
    : paper.target ? `${paper.target}类会议` : "已发表";
}

function renderEndingShowcase(state: GameState, published: Paper[]): string {
  const candidates = published.filter((paper) => paper.nonFirstAuthor !== true);
  const papers = candidates.length ? candidates : published;
  const representative = [...papers].sort((left, right) => {
    const leftScore = getAcceptedPaperScore({ ...left, journalTarget: left.journalTarget ?? left.publication?.journalTarget });
    const rightScore = getAcceptedPaperScore({ ...right, journalTarget: right.journalTarget ?? right.publication?.journalTarget });
    return rightScore - leftScore || (right.publication?.citations ?? 0) - (left.publication?.citations ?? 0);
  })[0];
  const thesis = state.thesis.review?.submitted && state.thesis.title.trim() ? state.thesis : null;
  if (!thesis && !representative) return "";
  const paperScore = representative ? getAcceptedPaperScore({ ...representative,
    journalTarget: representative.journalTarget ?? representative.publication?.journalTarget }) : 0;
  const thesisAward = thesis?.review?.excellent ? `优秀${thesis.review.degree === "phd" ? "博士" : "硕士"}论文` : "";
  const thesisNotes = thesis ? [
    thesis.researchPoints.length ? `${thesis.researchPoints.length} 个研究点` : "",
    state.ending === "master" || state.ending === "phd" ? `毕业线 ${state.graduationScoreTarget ?? "—"}` : "",
    thesis.review!.passed ? "盲审通过" : "已送审",
  ].filter(Boolean).join(" · ") : "";
  return `<section class="ending-showcase" aria-label="本局代表成果">
    ${thesis ? `<div class="ending-showcase-item is-thesis">
      <div class="ending-showcase-heading"><span class="ending-showcase-kicker">🎓 大论文</span>${thesisAward ? `<span class="ending-showcase-badge">${thesisAward}</span>` : ""}</div>
      <strong class="ending-showcase-title" title="${escapeHtml(thesis.title)}">《${escapeHtml(thesis.title)}》</strong>
      <span class="ending-showcase-meta">${thesisNotes}</span>
    </div>` : ""}
    ${representative ? `<div class="ending-showcase-item is-paper">
      <div class="ending-showcase-heading"><span class="ending-showcase-kicker">📄 ${candidates.length ? "代表作" : "合作代表作"}</span><span class="ending-showcase-badge">${paperVenue(representative)}</span></div>
      <strong class="ending-showcase-title" title="${escapeHtml(representative.title)}">《${escapeHtml(representative.title)}》</strong>
      <span class="ending-showcase-meta">录用分 ${formatMoney(paperScore)} · 引用 ${formatMoney(representative.publication?.citations ?? 0)}</span>
    </div>` : ""}
  </section>`;
}

function endingOfferTitle(offer: CareerOffer): string {
  if (offer.type !== "academic") return offer.name;
  const match = /^academic-(non-elite|211|985|world)-(lecturer|associate|professor)$/u.exec(offer.jobId);
  if (!match) return offer.name;
  const school = { "non-elite": "双非高校", "211": "211 高校", "985": "985 高校", world: "世界名校" }[match[1]!];
  const rank = match[1] === "world" ? "长聘教授"
    : { lecturer: "讲师", associate: "副教授", professor: "教授" }[match[2]!];
  return `${school} · 人工智能学院 · ${rank}`;
}

function renderEndingLife(state: GameState): string {
  const grants = state.advisorProgressState.awards.map((award) => ADVISOR_GRANTS.find((grant) => grant.id === award.id)?.name).filter(Boolean);
  const advisor = state.relationshipState.advisorCount > 0 && state.selectedAdvisorName
    ? `<div class="ending-highlight is-advisor" data-ending-section="relationships-advisor">
        <div class="ending-highlight-heading"><span>👨‍🏫 导师：</span><strong>${escapeHtml(state.selectedAdvisorName)}</strong></div>
        <div class="ending-highlight-tags"><span>${getAdvisorRankLabel(state.advisorProgressState)}</span>${grants.map((grant) => `<span>${escapeHtml(grant!)}</span>`).join("")}</div>
        <div class="ending-highlight-detail"><span>科研积累 ${formatMoney(state.advisorProgressState.researchAccumulation)}</span><span>累计经费 ${formatMoney(state.advisorProgressState.cumulativeFunding ?? state.advisorProgressState.funding)}</span></div>
      </div>` : "";
  const lover = state.loverState.active
    ? `<div class="ending-highlight is-lover" data-ending-section="relationships-lover">
        <div class="ending-highlight-heading"><span>💕 恋人：</span><strong>${escapeHtml(state.loverState.name?.trim() || "恋人")}</strong></div>
        <div class="ending-highlight-detail"><span class="ending-highlight-tags"><span>${state.loverState.type === "beautiful" ? "活泼" : "聪慧"}</span></span><span>亲密 ${formatMoney(state.loverProgressState.intimacy)}</span><span>科研 ${formatMoney(state.loverProgressState.research)}</span></div>
        <div class="ending-highlight-detail"><span>${state.loverState.startTotalMonths !== null ? `相识 ${Math.max(0, state.totalMonths - state.loverState.startTotalMonths + 1)} 个月` : "相识于研究生阶段"}</span></div>
      </div>` : "";
  const offer = Object.values(state.careerOffers).find((entry) => entry !== undefined);
  const offerTitle = offer ? endingOfferTitle(offer).split(" · ") : [];
  const offerMeta = offer ? [...offerTitle.slice(1), offer.compensation, offer.detail].filter(Boolean) : [];
  const destination = offer
    ? `<div class="ending-highlight is-offer" data-ending-section="offers"><div class="ending-highlight-heading"><span>💼 offer：</span><strong>${escapeHtml(offerTitle[0]!)}</strong></div>${offerMeta.length ? `<div class="ending-highlight-detail">${offerMeta.map((detail) => `<span>${escapeHtml(detail!)}</span>`).join("")}</div>` : ""}</div>` : "";
  const fellows = state.fellowProgressState.map((profile) =>
    `<span class="ending-fellow-name"><strong>${escapeHtml(getFellowName(profile))}</strong><span>${getFellowRoleLabel(profile.type, profile.gender)}</span></span>`);
  const fellowCard = fellows.length
    ? `<div class="ending-highlight is-fellows" data-ending-section="relationships-fellows"><div class="ending-highlight-heading"><span>🤝 同学</span></div><div class="ending-fellow-names">${fellows.join(" ")}</div></div>` : "";
  const people = [advisor, destination, fellowCard, lover].filter(Boolean);
  const counts: Array<[string, string, string]> = [
    ["joint-training", "联培", state.conferenceEncounterState.jointTrainingReward || state.conferenceEncounterState.bigBullCooperation ? "✓" : "—"],
    ["internships", "实习", `${state.internshipCount} 次`],
    ["scholarships", "国奖", `${state.scholarshipState.awardCount ?? 0} 次`],
    ["reading", "读论文", `${state.readingState.readCount} 次`],
    ["meetings", "参会", `${state.eventCounters.meetingCount} 次`],
    ["spending", "花销", `${formatMoney(state.personalSpending ?? 0)} 金币`],
  ];
  return `<section class="ending-life" aria-label="本局人际与经历">
    ${people.length ? `<div class="ending-highlights has-${people.length}">
      ${people.join("")}
    </div>` : ""}
    <div class="ending-record-table" aria-label="本局经历统计">${counts.map(([id, label, value]) =>
      `<div class="ending-record-cell" data-ending-section="${id}"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
  </section>`;
}

function renderEndingSummary(state: GameState, published: Paper[]): string {
  const firstCount = published.filter((paper) => paper.nonFirstAuthor !== true).length;
  const metrics = [
    ["research-score", "科研分", state.totalResearchScore],
    ["first-papers", "一作论文", firstCount],
    ["coauthor-papers", "合作论文", published.length - firstCount],
    ["citations", "总引用", state.totalCitations],
  ] as const;
  const venues = ["A", "B", "C", "nature", "nmi", "pami"].map((venue) => {
    const count = published.filter((paper) => {
      const journal = paper.journalTarget ?? paper.publication?.journalTarget;
      return journal ? journal === venue : paper.target === venue;
    }).length;
    const label = venue === "nature" ? "Nature" : venue.toUpperCase();
    return `<span data-ending-stat="${venue}"${count === 0 ? ' class="is-zero"' : ""}>${label}<strong>${count}</strong></span>`;
  });
  const attributes = [
    ["san", "🧠 SAN", `${formatMoney(state.player.san)}/${formatMoney(state.sanCap)}`, state.ending === "burnout"],
    ["research", "💡 科研", `${formatMoney(state.player.research)}/${formatMoney(getResearchCap(state.researchCapacityState))}`, state.ending === "overthinking"],
    ["social", "🤝 社交", `${formatMoney(state.player.social)}/${getPlayerAttributeCap(state, "social")}`, state.ending === "isolated"],
    ["favor", "👨‍🏫 导师好感", `${formatMoney(state.player.favor)}/${getPlayerAttributeCap(state, "favor")}`, state.ending === "expelled"],
    ["money", "💰 金币", formatMoney(state.player.money), state.ending === "poor"],
  ] as const;
  return `<section class="ending-summary" aria-label="本轮属性与成果">
    <div class="ending-summary-research">
      <div class="ending-summary-metrics">${metrics.map(([id, label, value]) => `<div data-ending-stat="${id}"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
      <div class="ending-summary-venues" aria-label="已发表论文分类">${venues.join("")}</div>
    </div>
    <div class="ending-summary-attributes">${attributes.map(([id, label, value, failed]) => `<div data-ending-stat="${id}"${failed ? ' class="is-failed"' : ""}><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
  </section>`;
}

export function renderEndingScreen(state: GameState, experienceAward?: RoleExperienceAward, saveStatus?: string): string {
  const ending = state.ending;
  const copy = ending ? ENDINGS[ending] : {
    title: "本轮结束", icon: "📖", tone: "pause",
  };
  const degree = state.degree === "phd" ? "博士" : "硕士";
  const target = state.graduationScoreTarget;
  const failureStats = { burnout: ["SAN", state.player.san], poor: ["金币", state.player.money], expelled: ["导师好感", state.player.favor], isolated: ["社交", state.player.social], overthinking: ["科研能力", state.player.research] } as const;
  const failedStat = ending && ending in failureStats ? failureStats[ending as keyof typeof failureStats] : null;
  const reason = failedStat ? `${failedStat[0]} ${formatMoney(failedStat[1])}，低于0`
    : ending === "lab-bankrupt" ? `科研经费 ${formatMoney(state.advisorProgressState.funding)}，低于0`
    : ending === "delay" ? target === null ? "毕业要求尚未确定"
      : state.totalResearchScore < target ? `科研分 ${state.totalResearchScore}/${target}，未达标`
        : state.thesis.review?.submitted ? "盲审未通过" : "未完成盲审送审"
    : "";
  const cause = state.endingCause?.text.trim() || null;
  const role = getRoleDefinition(state.selectedRoleId);
  const calendar = getCalendarForTotalMonths(state.totalMonths, state.degree);
  const date = state.totalMonths > 0 ? `${getAcademicCalendarYear(calendar.year, calendar.month)}年${getAcademicCalendarMonth(calendar.month)}月` : "入学前";
  const identity = state.playerName?.trim() || "你";
  const award = experienceAward?.roleId === state.selectedRoleId ? experienceAward : null;
  const nextLevelExp = award ? getNextRoleLevelExperience(award.level) : null;
  const published = getEndingPublications(state);
  const achievementIds = new Set(state.runAchievementIds ?? []);
  const achievements = award?.disqualifiedByDebug || award?.disqualifiedByIntegrity ? []
    : getAllAchievementDefinitions().filter(definition => achievementIds.has(definition.id));
  return `<section class="ending-panel" data-ending="${ending ?? "unknown"}" data-tone="${copy.tone}" aria-labelledby="ending-title">
        <header class="ending-header">
          <div class="ending-header-copy">
            <div class="ending-heading"><span class="ending-emblem" aria-hidden="true">${copy.icon}</span><h2 id="ending-title">${copy.title}</h2><span class="ending-role">${escapeHtml(role.name)}</span></div>
            <div class="ending-identity"><span class="ending-player-name">${escapeHtml(identity)}</span><span>${degree} · 在校${state.totalMonths}个月 · ${date}</span></div>
          </div>
          <button class="event-content-close" type="button" data-ui-close-ending-content aria-label="关闭结局">×</button>
        </header>
        ${reason ? `<div class="ending-result-row"><strong>结果</strong>${escapeHtml(reason)}</div>` : ""}
        ${cause ? `<div class="ending-cause"><strong>触发事件</strong>${escapeHtml(cause)}</div>` : ""}
        ${renderEndingShowcase(state, published)}
        ${renderEndingSummary(state, published)}
        ${renderEndingLife(state)}
        ${achievements.length ? `<section class="ending-achievements" aria-label="本局达成成就">${achievements.map(definition => `<span class="ending-achievement" data-ending-achievement-id="${escapeHtml(definition.id)}"><span aria-hidden="true">${escapeHtml(definition.icon)}</span><strong>${escapeHtml(definition.title)}</strong></span>`).join("")}</section>` : ""}
        ${award?.disqualifiedByIntegrity ? `<div class="ending-experience" aria-label="角色经验结算">操作检查未通过，本局不结算成就、经验及后续统计</div>` : award?.disqualifiedByDebug ? `<div class="ending-experience" aria-label="角色经验结算">调试局，本局不结算成就、经验及后续统计</div>` : award ? `<div class="ending-experience" aria-label="角色经验结算">
          <span>本局经验 <strong>+${award.gained}</strong></span>
          <span>等级 <strong>Lv${award.previousLevel}${award.level > award.previousLevel ? ` → Lv${award.level}` : ""}</strong></span>
          <span>经验 <strong>${award.exp}/${nextLevelExp ?? "∞"}</strong></span>
        </div>${state.phase === "finished" ? `<small class="ending-experience-note">结算后领取；回溯可继续本局</small>` : ""}` : ""}
        <footer class="ending-actions">
          ${saveStatus ? `<p class="run-saves-status" role="status">${escapeHtml(saveStatus)}</p>` : ""}
          <div class="ending-buttons">
            <button class="settings-primary-btn is-return" type="button" data-action="settle-and-return"><i data-lucide="house" aria-hidden="true"></i><span>结算并返回</span></button>
            <button class="settings-primary-btn is-rewind" type="button" data-ui-open-run-saves><i data-lucide="history" aria-hidden="true"></i><span>我要回溯</span></button>
          </div>
        </footer>
    </section>`;
}
