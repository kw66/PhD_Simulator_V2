import "../styles/event-ending.css";
import { getAcademicCalendarMonth, getAcademicCalendarYear } from "../core/v2-calendar";
import { CAREER_DEFINITIONS, type CareerType } from "../core/v2-career-rules";
import { getCalendarForTotalMonths, getRoleDefinition } from "../core/v2-progression";
import { getResearchCap } from "../core/v2-research-cap-system";
import { getAcceptedPaperScore } from "../core/v2-publication-rules";
import { formatMoney } from "../core/v2-money";
import { getNextRoleLevelExperience } from "../core/v2-role-experience";
import { getDesignedTalentNodes } from "./v2-render-setup-screen";
import { getRoleCardPortraitUrl, hasRoleCardPortrait } from "./v2-role-portrait-assets";
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
  const thesisNotes = thesis ? [
    thesis.review!.excellent ? `优秀${thesis.review!.degree === "phd" ? "博士" : "硕士"}论文` : thesis.review!.passed ? "" : "已送审",
    thesis.researchPoints.length ? `${thesis.researchPoints.length} 个研究点` : "",
  ].filter(Boolean).join(" · ") : "";
  return `<section class="ending-showcase" aria-label="本局代表成果">
    ${thesis ? `<div class="ending-showcase-item is-thesis"><span class="ending-showcase-kicker">🎓 学位论文</span><strong title="${escapeHtml(thesis.title)}">《${escapeHtml(thesis.title)}》</strong>${thesisNotes ? `<span>${thesisNotes}</span>` : ""}</div>` : ""}
    ${representative ? `<div class="ending-showcase-item is-paper"><span class="ending-showcase-kicker">📄 ${candidates.length ? "代表作" : "合作代表作"} · ${paperVenue(representative)}</span><strong title="${escapeHtml(representative.title)}">《${escapeHtml(representative.title)}》</strong><span>录用分 ${formatMoney(paperScore)} · 引用 ${formatMoney(representative.publication?.citations ?? 0)}</span></div>` : ""}
  </section>`;
}

function renderEndingLife(state: GameState, published: Paper[], allocation: Record<string, number>): string {
  const advisor = state.relationshipState.advisorCount > 0 && state.selectedAdvisorName
    ? `导师 ${state.selectedAdvisorName}${state.advisorProgressState.researchAccumulation > 0 ? ` · 科研积累${formatMoney(state.advisorProgressState.researchAccumulation)}` : ""}` : null;
  const fellows = state.fellowProgressState.map((profile) =>
    `${profile.name?.trim() || "同学"} · 科研${formatMoney(profile.research)}/默契${formatMoney(profile.affinity)}`);
  const lover = state.loverState.active
    ? `${state.loverState.name?.trim() || "恋人"} · 亲密${formatMoney(state.loverProgressState.intimacy)}` : null;
  const relationships = [advisor, ...fellows, lover].filter((item): item is string => Boolean(item));
  const talents = (getDesignedTalentNodes(state.selectedRoleId) ?? [])
    .filter((node) => (allocation[node.id] ?? node.initialLevel ?? 0) > 0)
    .map((node) => `${node.name} ${allocation[node.id] ?? node.initialLevel ?? 0}级`);
  const goods = [
    state.shopState.gpuLevel > 0 ? `显卡 Lv${state.shopState.gpuLevel}` : null,
    state.shopState.monitorOwned ? "2K显示器" : null,
    state.shopState.keyboardOwned ? "机械键盘" : null,
    state.shopState.chairOwned ? "办公椅" : null,
    state.coffeeState.machineOwned ? "咖啡机" : null,
    state.shopState.bikeOwned ? "自行车" : null,
    state.shopState.ebikeOwned ? "小电驴" : null,
    ...Object.entries(state.aiShopState.subscriptions)
      .filter(([, subscription]) => subscription.active)
      .map(([provider]) => `${provider.toUpperCase()}订阅`),
  ].filter((item): item is string => Boolean(item));
  const counters = state.eventCounters;
  const footprints = [
    counters.badmintonCount > 0 ? `羽毛球 ${counters.badmintonCount} 次` : null,
    counters.pokerCount > 0 ? `打牌 ${counters.pokerCount} 次` : null,
    counters.terrariaCount > 0 ? `泰拉瑞亚 ${counters.terrariaCount} 次` : null,
    counters.magicTowerCount > 0 ? `魔塔 ${counters.magicTowerCount} 次` : null,
    counters.rocoCount > 0 ? `洛克王国 ${counters.rocoCount} 次` : null,
    counters.meetingCount > 0 ? `参会 ${counters.meetingCount} 次` : null,
    counters.teachersDayErrandCount > 0 ? `教师节跑腿 ${counters.teachersDayErrandCount} 次` : null,
    state.readingState.readCount > 0 ? `读论文 ${state.readingState.readCount} 次` : null,
    state.partTimeWorkCount > 0 ? `劳务 ${state.partTimeWorkCount} 次` : null,
  ].filter((item): item is string => Boolean(item));
  const projectCount = state.advisorProgressState.playerProjectCompletions.horizontal
    + state.advisorProgressState.playerProjectCompletions.vertical;
  const milestones = [
    published.some((paper) => paper.publication?.highlyCited)
      ? `ESI高被引 ${published.filter((paper) => paper.publication?.highlyCited).length} 篇` : null,
    (state.scholarshipState.awardCount ?? 0) > 0 ? `国家奖学金 ${state.scholarshipState.awardCount} 次` : null,
    projectCount > 0 ? `参与项目 ${projectCount} 项` : null,
    state.internshipCount > 0 ? `完成实习 ${state.internshipCount} 次` : null,
  ].filter((item): item is string => Boolean(item));
  const offers = (Object.entries(state.careerOffers) as Array<[CareerType, NonNullable<typeof state.careerOffers[CareerType]>]>)
    .map(([type, offer]) => `${CAREER_DEFINITIONS[type].name}：${offer.name}${offer.compensation ? `（${offer.compensation}）` : ""}`);
  const rows: Array<[string, string, string[]]> = [
    ["relationships", "人际", relationships], ["talents", "天赋", talents],
    ["goods", "物品", goods], ["milestones", "经历", milestones],
    ["footprints", "足迹", footprints], ["offers", "持有 offer", offers],
  ];
  const visibleRows = rows.filter(([, , items]) => items.length > 0);
  if (!visibleRows.length) return "";
  return `<section class="ending-life" aria-label="本局生活记录">${visibleRows.map(([id, label, items]) =>
    `<div class="ending-life-row${items.join("").length > 38 ? " is-wide" : ""}" data-ending-section="${id}"><strong>${label}</strong><div>${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></div>`).join("")}</section>`;
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
    ["social", "🤝 社交", `${formatMoney(state.player.social)}/20`, state.ending === "isolated"],
    ["favor", "🎓 导师好感", `${formatMoney(state.player.favor)}/20`, state.ending === "expelled"],
    ["money", "💰 金币", formatMoney(state.player.money), state.ending === "poor"],
  ] as const;
  return `<section class="ending-summary" aria-label="本轮属性与成果">
    <div class="ending-summary-metrics">${metrics.map(([id, label, value]) => `<div data-ending-stat="${id}"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
    <div class="ending-summary-venues" aria-label="已发表论文分类">${venues.join("")}</div>
    <div class="ending-summary-attributes">${attributes.map(([id, label, value, failed]) => `<div data-ending-stat="${id}"${failed ? ' class="is-failed"' : ""}><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
  </section>`;
}

export function renderEndingScreen(state: GameState, experienceAward?: RoleExperienceAward, talentAllocation: Record<string, number> = {}): string {
  const ending = state.ending;
  const copy = ending ? ENDINGS[ending] : {
    title: "本轮结束", icon: "📖", tone: "pause",
  };
  const graduated = ending === "master" || ending === "phd";
  const degree = state.degree === "phd" ? "博士" : "硕士";
  const target = state.graduationScoreTarget;
  const failureStats = { burnout: ["SAN", state.player.san], poor: ["金币", state.player.money], expelled: ["导师好感", state.player.favor], isolated: ["社交", state.player.social], overthinking: ["科研能力", state.player.research] } as const;
  const failedStat = ending && ending in failureStats ? failureStats[ending as keyof typeof failureStats] : null;
  const reason = failedStat ? `${failedStat[0]} ${formatMoney(failedStat[1])}，低于0`
    : ending === "lab-bankrupt" ? `科研经费 ${formatMoney(state.advisorProgressState.funding)}，低于0`
    : ending === "delay" ? target === null ? "毕业要求尚未确定"
      : state.totalResearchScore < target ? `科研分 ${state.totalResearchScore}/${target}，未达标`
        : state.thesis.review?.submitted ? "盲审未通过" : "未完成盲审送审"
    : graduated ? `毕业线 ${target ?? "—"} · 盲审通过` : "";
  const cause = failedStat ? state.endingCause?.text.trim() : null;
  const role = getRoleDefinition(state.selectedRoleId);
  const calendar = getCalendarForTotalMonths(state.totalMonths, state.degree);
  const date = state.totalMonths > 0 ? `${getAcademicCalendarYear(calendar.year, calendar.month)}年${getAcademicCalendarMonth(calendar.month)}月` : "入学前";
  const identity = state.playerName?.trim() || "你";
  const award = experienceAward?.roleId === state.selectedRoleId ? experienceAward : null;
  const nextLevelExp = award ? getNextRoleLevelExperience(award.level) : null;
  const published = getEndingPublications(state);
  return `<section class="ending-panel" data-ending="${ending ?? "unknown"}" data-tone="${copy.tone}" aria-labelledby="ending-title">
        <header class="ending-header">
          <div class="ending-header-copy">
            <div class="ending-heading"><span class="ending-emblem" aria-hidden="true">${copy.icon}</span><h2 id="ending-title">${copy.title}</h2>${reason ? `<span class="ending-result">${escapeHtml(reason)}</span>` : ""}</div>
            <div class="ending-identity"><span class="ending-player-name">${escapeHtml(identity)}</span><span>${escapeHtml(role.name)}${graduated ? "" : ` · ${degree}`} · 在校${state.totalMonths}个月 · ${date}</span></div>
          </div>
          ${hasRoleCardPortrait(state.selectedRoleId) ? `<img class="ending-cover-portrait" src="${escapeHtml(getRoleCardPortraitUrl(state.selectedRoleId))}" alt="" decoding="async">` : ""}
          <button class="event-content-close" type="button" data-ui-close-ending-content aria-label="关闭结局">×</button>
        </header>
        ${cause ? `<div class="ending-cause"><strong>触发事件</strong>${escapeHtml(cause)}</div>` : ""}
        ${renderEndingShowcase(state, published)}
        ${renderEndingSummary(state, published)}
        ${renderEndingLife(state, published, talentAllocation)}
        ${award?.disqualifiedByDebug ? `<div class="ending-experience" aria-label="角色经验结算">调试局，本局不结算角色经验</div>` : award ? `<div class="ending-experience" aria-label="角色经验结算">
          <span>本局经验 <strong>+${award.gained}</strong></span>
          <span>等级 <strong>Lv${award.previousLevel}${award.level > award.previousLevel ? ` → Lv${award.level}` : ""}</strong></span>
          <span>经验 <strong>${award.exp}/${nextLevelExp ?? "∞"}</strong></span>
        </div>` : ""}
        <footer class="ending-actions">
          <div class="ending-buttons">
            <button class="settings-primary-btn is-restart" type="button" data-action="restart-game"><i data-lucide="rotate-ccw" aria-hidden="true"></i><span>再读一次</span></button>
            <button class="settings-primary-btn is-return" type="button" data-action="reset-game"><i data-lucide="house" aria-hidden="true"></i><span>返回开始页面</span></button>
          </div>
        </footer>
    </section>`;
}
