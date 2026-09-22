import "../styles/event-ending.css";
import { getAcademicCalendarMonth, getAcademicCalendarYear } from "../core/v2-calendar";
import { getCalendarForTotalMonths, getRoleDefinition } from "../core/v2-progression";
import { getResearchCap } from "../core/v2-research-cap-system";
import type { EndingId, GameState } from "../core/v2-types";

interface EndingPresentation {
  title: string;
  icon: string;
  label: string;
  tone: "success" | "failure" | "pause";
  story: string[];
  closing: string;
}

const ENDINGS: Record<Exclude<EndingId, null>, EndingPresentation> = {
  master: {
    title: "硕士毕业", icon: "🎓", label: "学业完成", tone: "success",
    story: ["离校手续终于办完，你开始收拾工位。插线板底下竟然还压着一张刚入学时的便签，上面的待办早已做完，只是一直没扔。", "你完成了硕士阶段的科研要求，把电脑和笔记装进包。平时总嫌椅子坐着不舒服，真要搬走时，倒又在上面坐了一会儿。"],
    closing: "把学位留作纪念，把好奇心带去下一站",
  },
  phd: {
    title: "博士毕业", icon: "🎓", label: "学业完成", tone: "success",
    story: ["离开实验室前，你把研究文件又备份了一遍。目录里那些标着‘最终版’的稿件，一个也没舍得删，每个后缀都让你想起一段赶工的日子。", "你完成了博士阶段的科研要求。关电脑前，还有同学来问一个实验问题，你照常讲了半天，才想起明天不用再来这个工位了。"],
    closing: "学位有终点，探索没有",
  },
  burnout: {
    title: "不堪重负", icon: "😢", label: "提前离校", tone: "failure",
    story: ["你已经很久没有踏实休息过了。实验、修改和接连而来的任务挤满日程，连合上电脑以后，脑子里也还在赶进度。", "这一次，你没能再撑下去。研究计划停在了半途，你决定离开工位，先把自己的生活慢慢找回来。"],
    closing: "这回，先让自己好好歇一歇",
  },
  poor: {
    title: "穷困潦倒", icon: "💸", label: "提前离校", tone: "failure",
    story: ["你又核对了一遍余额，把最近的支出从头翻到尾。那些平时分散在各处的小数目，加在一起，已经超出了你能承担的范围。", "你不得不中断学业，收拾东西离开实验室。手头还没做完的研究，只能先停在这里。"],
    closing: "电脑合上了，先想办法把日子过下去",
  },
  expelled: {
    title: "逐出师门", icon: "😭", label: "提前离校", tone: "failure",
    story: ["这次谈话没有像往常那样落在下一步工作上。积累已久的分歧让师生之间的信任耗尽，导师明确表示，无法再继续指导你。", "你收起材料，走出那间来过很多次的办公室。这段师门关系结束了，原本的学业计划也随之中断。"],
    closing: "办公室的门关上了，你还得想想往后怎么走",
  },
  isolated: {
    title: "被孤立", icon: "😔", label: "提前离校", tone: "failure",
    story: ["实验室仍然很热闹，只是讨论和邀约渐渐与你无关。一次次没有处理好的来往，让你与身边人的距离越来越远。", "当问题再次堆到眼前，你已很难找到可以一起商量的人。这段求学生活最终没有继续下去，你独自离开了熟悉的工位。"],
    closing: "走到楼下，你才想起刚才没有和谁道别",
  },
  delay: {
    title: "延毕", icon: "⏰", label: "未能按期毕业", tone: "pause",
    story: ["毕业季到了，群里有人约着拍照，有人转让显示器。你翻开自己的成果清单，又和毕业要求对了一遍，还是没能达标。", "这一轮培养期已经结束，你没能按期毕业。桌上的实验记录写了不少页，只是其中能列进毕业材料的成果，还不够。"],
    closing: "毕业照已经拍了，工位上的东西还不能收",
  },
  quit: {
    title: "主动退学", icon: "🚪", label: "主动离校", tone: "pause",
    story: ["你认真考虑了接下来想过的生活，最终决定不再继续这段学业。把决定说出口并不轻松，但这一次，你没有再把它拖到下个月。", "研究生生活在这里告一段落。你带走已经学到的东西，把时间留给另一种可能。"],
    closing: "换一条路，也可以继续向前",
  },
};

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function isEndingSystemLog(text: string): boolean {
  return /^(?:SAN|金币|导师好感|社交能力)\s*已跌破\s*0，本轮提前结束。?$/u.test(text.trim())
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

function renderEndingSummary(state: GameState): string {
  const published = [...new Map([...state.papers, ...state.externalPublications]
    .filter((paper) => paper.status === "published"
      && (paper.nonFirstAuthor === true || !paper.leadAuthorId || paper.leadAuthorId === "player"))
    .map((paper) => [paper.id, paper])).values()];
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
    return `<span data-ending-stat="${venue}">${label}<strong>${count}</strong></span>`;
  });
  const relationshipCount = state.relationshipState.advisorCount + state.fellowProgressState.length + Number(state.loverState.active);
  const attributes = [
    ["san", "🧠 SAN", `${state.player.san}/${state.sanCap}`, state.ending === "burnout"],
    ["research", "💡 科研", `${state.player.research}/${getResearchCap(state.researchCapacityState)}`, false],
    ["social", "🤝 社交", state.player.social, state.ending === "isolated"],
    ["favor", "🎓 导师好感", state.player.favor, state.ending === "expelled"],
    ["money", "💰 金币", state.player.money, state.ending === "poor"],
    ["relationships", "👥 关系人数", relationshipCount, false],
  ] as const;
  return `<section class="ending-summary" aria-label="本轮属性与成果">
    <div class="ending-summary-metrics">${metrics.map(([id, label, value]) => `<div data-ending-stat="${id}"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
    <div class="ending-summary-venues" aria-label="已发表论文分类">${venues.join("")}</div>
    <div class="ending-summary-attributes">${attributes.map(([id, label, value, failed]) => `<div data-ending-stat="${id}"${failed ? ' class="is-failed"' : ""}><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
  </section>`;
}

export function renderEndingScreen(state: GameState): string {
  const ending = state.ending;
  const copy = ending ? ENDINGS[ending] : {
    title: "本轮结束", icon: "📖", label: "本轮结束", tone: "pause", story: ["这段研究生生活暂时告一段落。"], closing: "感谢游玩研究生模拟器 v2.0",
  };
  const graduated = ending === "master" || ending === "phd";
  const degree = state.degree === "phd" ? "博士" : "硕士";
  const target = state.graduationScoreTarget;
  const failureStats = { burnout: ["SAN", state.player.san], poor: ["金币", state.player.money], expelled: ["导师好感", state.player.favor], isolated: ["社交", state.player.social] } as const;
  const failedStat = ending && ending in failureStats ? failureStats[ending as keyof typeof failureStats] : null;
  const reason = failedStat ? `${failedStat[0]} ${failedStat[1]}，低于0，无法继续学业`
    : ending === "quit" ? "你选择结束本轮学业"
    : ending === "delay" ? `培养期已满${state.maxMonths}个月，${target === null ? "毕业要求尚未确定" : `科研分${state.totalResearchScore}/${target}，尚未达标`}`
    : graduated ? `${degree}毕业要求已达成：科研分 ${state.totalResearchScore}/${target ?? "—"}` : "本轮已结束";
  const cause = failedStat ? state.endingCause?.text.trim() : null;
  const role = getRoleDefinition(state.selectedRoleId);
  const calendar = getCalendarForTotalMonths(state.totalMonths, state.degree);
  const date = state.totalMonths > 0 ? `${getAcademicCalendarYear(calendar.year, calendar.month)}年${getAcademicCalendarMonth(calendar.month)}月` : "入学前";
  const identity = state.playerName?.trim() || "你";
  return `<section class="ending-panel" data-ending="${ending ?? "unknown"}" data-tone="${copy.tone}" aria-labelledby="ending-title">
        <header class="ending-header">
          <span class="ending-role">${escapeHtml(role.name)}</span>
          <div class="ending-heading"><span class="ending-emblem" aria-hidden="true">${copy.icon}</span><h2 id="ending-title">${copy.title}</h2></div>
          <div class="ending-header-actions"><span class="ending-status">${copy.label}</span><button class="event-content-close" type="button" data-ui-close-ending-content aria-label="关闭结局">×</button></div>
        </header>
        <div class="ending-identity"><div class="ending-identity-details"><span>${escapeHtml(identity)}</span><span>${degree}</span><span>在校${state.totalMonths}个月</span></div><span>${date}</span></div>
        <div class="ending-story">${copy.story.map((paragraph) => `<p>${paragraph}</p>`).join("")}</div>
        <section class="ending-reason" aria-label="${graduated ? "毕业条件" : "结局原因"}">
          <p><strong>${graduated ? "毕业条件" : "结局原因"}</strong>${escapeHtml(reason)}</p>
          ${cause ? `<p class="ending-cause"><strong>最后发生的事</strong>${escapeHtml(cause)}</p>` : ""}
        </section>
        ${renderEndingSummary(state)}
        <footer class="ending-actions">
          <p class="ending-closing">${copy.closing}</p>
          <div class="ending-buttons">
            <button class="settings-primary-btn is-restart" type="button" data-action="restart-game"><i data-lucide="rotate-ccw" aria-hidden="true"></i><span>再读一次</span></button>
            <button class="settings-primary-btn is-return" type="button" data-action="reset-game"><i data-lucide="house" aria-hidden="true"></i><span>返回开始页</span></button>
          </div>
        </footer>
    </section>`;
}
