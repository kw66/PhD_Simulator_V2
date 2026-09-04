import type { LobbyInfoSectionId, LobbyViewId } from "./v2-render-types";

const LOBBY_VIEWS: ReadonlyArray<{
  id: LobbyViewId;
  label: string;
  icon: string;
}> = [
  { id: "roles", label: "角色图鉴", icon: "users" },
  { id: "info", label: "游戏信息", icon: "chart-no-axes-column" },
  { id: "messages", label: "留言板", icon: "message-square" },
];

const LOBBY_INFO_SECTIONS: ReadonlyArray<{
  id: LobbyInfoSectionId;
  label: string;
  note: string;
}> = [
  { id: "overview", label: "快速了解", note: "目标与流程" },
  { id: "mechanics", label: "游戏机制", note: "月份与行动" },
  { id: "values", label: "数值规则", note: "属性与档位" },
  { id: "guide", label: "攻略指南", note: "安排与取舍" },
  { id: "events", label: "事件日历", note: "固定与随机" },
  { id: "systems", label: "功能系统", note: "科研与人际" },
  { id: "endings", label: "结局与解锁", note: "目标与角色" },
  { id: "updates", label: "版本记录", note: "开发进度" },
];

function renderMessageComposer(mode: "board" | "feedback"): string {
  const prefix = mode === "board" ? "lobby-message" : "game-feedback";
  const heading = mode === "board" ? "写留言" : "游戏中反馈";

  return `
    <section class="community-compose${mode === "feedback" ? " is-feedback" : ""}">
      <div class="community-section-heading">
        <span class="community-section-icon" aria-hidden="true"><i data-lucide="message-square"></i></span>
        <div>
          <h2>${heading}</h2>
          <span>昵称最多 10 字，内容最多 150 字</span>
        </div>
      </div>
      <div class="community-compose-fields">
        <label class="community-field">
          <span>昵称</span>
          <input id="${prefix}-nickname" type="text" maxlength="10" autocomplete="nickname" placeholder="怎么称呼你" />
        </label>
        <label class="community-field">
          <span>留言</span>
          <textarea id="${prefix}-content" maxlength="150" rows="5" placeholder="说点什么吧"></textarea>
        </label>
      </div>
      <div class="community-compose-actions">
        <span class="community-service-state">V2 独立留言服务待接入</span>
        <button class="community-send-button" type="button" disabled aria-disabled="true">
          <i data-lucide="send" aria-hidden="true"></i>
          <span>发送</span>
        </button>
      </div>
    </section>
  `;
}

export function renderLobbyMasthead(activeView: LobbyViewId): string {
  return `
    <header class="lobby-masthead">
      <div class="lobby-brand-block">
        <strong>研究生模拟器</strong>
        <span>2.0</span>
      </div>
      <nav class="lobby-view-tabs" aria-label="开始页面">
        ${LOBBY_VIEWS.map((view) => `
          <button
            class="lobby-view-tab${view.id === activeView ? " is-active" : ""}"
            type="button"
            data-ui-lobby-view="${view.id}"
            aria-pressed="${view.id === activeView}"
          >
            <i data-lucide="${view.icon}" aria-hidden="true"></i>
            <span>${view.label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="lobby-live-metrics" aria-label="游戏公开数据">
        <span><i aria-hidden="true">👤</i>今日访客 <strong data-community-stat="today-visitors">--</strong></span>
        <span><i aria-hidden="true">🎯</i>今日游玩 <strong data-community-stat="today-games">--</strong></span>
        <span><i aria-hidden="true">👥</i>总访客 <strong data-community-stat="total-visitors">--</strong></span>
        <span><i aria-hidden="true">🎮</i>总游玩 <strong data-community-stat="total-games">--</strong></span>
      </div>
      <div class="lobby-project-links" aria-label="项目链接">
        <a href="https://xhslink.com/m/A2DFslJF4mb" target="_blank" rel="noreferrer"><i data-lucide="user-round" aria-hidden="true"></i><span>作者</span></a>
        <a href="https://github.com/kw66/PhD_Simulator_V2" target="_blank" rel="noreferrer"><i data-lucide="git-fork" aria-hidden="true"></i><span>GitHub</span></a>
        <a href="https://kw66.github.io/games/" target="_blank" rel="noreferrer"><i data-lucide="gamepad-2" aria-hidden="true"></i><span>游戏合集</span></a>
      </div>
    </header>
  `;
}

function renderLobbyInfoNavigation(activeSection: LobbyInfoSectionId): string {
  return `
    <aside class="lobby-info-directory">
      <div class="lobby-directory-heading">
        <span>资料目录</span>
        <h1>游戏信息</h1>
      </div>
      <nav class="lobby-info-directory-nav" aria-label="游戏信息目录">
        ${LOBBY_INFO_SECTIONS.map((section, index) => `
          <button
            class="lobby-info-directory-item${section.id === activeSection ? " is-active" : ""}"
            type="button"
            data-ui-lobby-info-section="${section.id}"
            aria-pressed="${section.id === activeSection}"
          >
            <span class="lobby-info-directory-index">${String(index + 1).padStart(2, "0")}</span>
            <span class="lobby-info-directory-copy"><strong>${section.label}</strong><small>${section.note}</small></span>
            <i data-lucide="chevron-right" aria-hidden="true"></i>
          </button>
        `).join("")}
      </nav>
      <div class="lobby-directory-footnote">
        <span>当前版本</span>
        <strong>2.0 开发版</strong>
        <small>资料会随规则更新</small>
      </div>
    </aside>
  `;
}

function renderInfoSectionHeading(kicker: string, title: string, note = ""): string {
  return `
    <div class="lobby-info-article-heading">
      <div>
        <span>${kicker}</span>
        <h1>${title}</h1>
      </div>
      ${note ? `<small>${note}</small>` : ""}
    </div>
  `;
}

function renderLobbyInfoArticle(section: LobbyInfoSectionId): string {
  switch (section) {
    case "overview":
      return `
        ${renderInfoSectionHeading("快速了解", "研究生模拟器 2.0", "先了解这场游戏")}
        <div class="lobby-info-overview-intro">
          <p>你需要在 68 个月里安排科研、生活和人际关系，直到毕业或转博。每个月先处理待办事件，再决定把有限的精力放在哪里。</p>
          <p>不同选择会改变属性、关系和后续节奏。没有一条固定路线，重要的是知道自己正在为哪种结果积累条件。</p>
        </div>
        <div class="lobby-info-overview-grid">
          <div><strong>01</strong><span>读研之始</span><small>联系导师，加入课题组</small></div>
          <div><strong>02</strong><span>按月推进</span><small>处理事件，安排科研与生活</small></div>
          <div><strong>03</strong><span>中途抉择</span><small>毕业或在合适的年份转博</small></div>
          <div><strong>04</strong><span>走到终点</span><small>查看本轮结果与角色记录</small></div>
        </div>
        <section class="lobby-info-subsection">
          <div class="lobby-info-subsection-heading"><span>公开数据</span><strong>V2 游戏数据</strong><small>统计服务待接入</small></div>
          <div class="lobby-stat-strip">
            <span>今日访客 <strong data-community-stat="today-visitors">--</strong></span>
            <span>今日游玩 <strong data-community-stat="today-games">--</strong></span>
            <span>总访客 <strong data-community-stat="total-visitors">--</strong></span>
            <span>总游玩 <strong data-community-stat="total-games">--</strong></span>
          </div>
        </section>
      `;
    case "mechanics":
      return `
        ${renderInfoSectionHeading("核心循环", "游戏机制", "每个月都要做一次取舍")}
        <div class="lobby-info-rule-list">
          <div><strong>培养周期</strong><span>硕士和博士都使用 68 个月的培养期限</span></div>
          <div><strong>月初结算</strong><span>工资、季节变化和持续效果会在进入新月份时统一结算</span></div>
          <div><strong>月末风险</strong><span>本月结束时的 SAN 档位会影响下个月的生病概率变化</span></div>
          <div><strong>事件处理</strong><span>阻塞事件必须先完成；部分事务可以延期一个月</span></div>
          <div><strong>主动操作</strong><span>科研、人际和商店操作共享当月精力，需要留意 SAN</span></div>
          <div><strong>月末结算</strong><span>完成当月行动后进入下一月，并更新疾病概率等状态</span></div>
          <div><strong>抵抗机制</strong><span>科研、社交和好感达到更高档位后，每点变化独立判定是否生效</span></div>
        </div>
      `;
    case "values":
      return `
        ${renderInfoSectionHeading("数值表", "数值规则", "当前版本的基础口径")}
        <div class="lobby-info-value-groups">
          <section><h2>基础属性</h2><div><span>SAN</span><strong>上限 20</strong></div><div><span>科研 / 社交 / 好感</span><strong>基础上限 20</strong></div><div><span>金币</span><strong>按事件与行动增减</strong></div></section>
          <section><h2>属性档位</h2><div><span>0–5</span><strong>基础档</strong></div><div><span>6–11</span><strong>进阶档</strong></div><div><span>12–17</span><strong>熟练档</strong></div><div><span>18+</span><strong>高阶档</strong></div></section>
          <section><h2>事件中科研杂活</h2><div><span>基础档</span><strong>减免 0</strong></div><div><span>进阶档</span><strong>减免 1</strong></div><div><span>熟练档</span><strong>减免 2</strong></div><div><span>高阶档</span><strong>减免 3</strong></div></section>
          <section><h2>论文评分</h2><div><span>成果系统</span><strong>页面已预留</strong></div><div><span>毕业与转博</span><strong>规则持续接入</strong></div></section>
        </div>
      `;
    case "guide":
      return `
        ${renderInfoSectionHeading("攻略资料", "攻略指南", "先放目录，详细条目逐步补齐")}
        <div class="lobby-info-guide-grid">
          <article><span>01</span><h2>开局路线</h2><p>从入学到第一个学年，先建立可持续的科研与资源循环。</p><small>前 12 个月安排 · 待补充</small></article>
          <article><span>02</span><h2>月度安排</h2><p>先判断事件期限，再分配 SAN、行动次数和金币。</p><small>行动优先级 · 待补充</small></article>
          <article><span>03</span><h2>科研路线</h2><p>科研档位、论文进度和成果目标需要按培养阶段规划。</p><small>论文与科研分 · 待补充</small></article>
          <article><span>04</span><h2>关系经营</h2><p>导师、同门和其他关系各有作用，槽位有限时要考虑取舍。</p><small>关系组合 · 待补充</small></article>
          <article><span>05</span><h2>资源管理</h2><p>金币、商店效果和永久 Buff 会改变中后期的行动效率。</p><small>消费顺序 · 待补充</small></article>
          <article><span>06</span><h2>疾病与 SAN</h2><p>疾病会放大主动操作消耗，低 SAN 也会压缩可选方案。</p><small>风险控制 · 待补充</small></article>
          <article><span>07</span><h2>毕业与转博</h2><p>在关键年份前积累足够成果，同时为不同路线保留余地。</p><small>时间节点 · 待补充</small></article>
          <article><span>08</span><h2>角色成长</h2><p>角色等级、成就和正逆位会形成不同的长期玩法。</p><small>解锁路线 · 待补充</small></article>
        </div>
      `;
    case "events":
      return `
        ${renderInfoSectionHeading("事件资料", "事件日历", "固定事件与随机事件")}
        <div class="lobby-info-rule-list">
          <div><strong>固定事件</strong><span>读研之始、教师节、寒假、年会、暑假、学年总结等按时间推进</span></div>
          <div><strong>随机事件</strong><span>每月从当前事件池抽取，普通事件与疾病事件分开处理</span></div>
          <div><strong>待办事件</strong><span>游戏页面只显示事件名称、时间或 DDL；历史事件单独查看</span></div>
          <div><strong>延期事务</strong><span>可延期事件不会立刻阻塞，但进入到期月后必须处理</span></div>
        </div>
        <div class="lobby-info-placeholder"><strong>完整六年日历</strong><span>日历筛选、事件颜色和详细触发条件将在此处补充</span></div>
      `;
    case "systems":
      return `
        ${renderInfoSectionHeading("系统索引", "功能系统", "已开放与规划中的栏目")}
        <div class="lobby-info-system-list">
          <div><span class="is-ready"></span><strong>属性与 Buff</strong><small>已开放</small></div>
          <div><span class="is-ready"></span><strong>日历与事件</strong><small>已开放</small></div>
          <div><span class="is-ready"></span><strong>游戏日志</strong><small>已开放</small></div>
          <div><span class="is-planned"></span><strong>科研成果</strong><small>页面预留</small></div>
          <div><span class="is-planned"></span><strong>商店与装备</strong><small>逐步接入</small></div>
          <div><span class="is-planned"></span><strong>成就与角色成长</strong><small>展示先行</small></div>
        </div>
      `;
    case "endings":
      return `
        ${renderInfoSectionHeading("结局索引", "结局与解锁", "目标条件会继续调整")}
        <div class="lobby-info-rule-list">
          <div><strong>毕业结果</strong><span>根据培养阶段、科研成果和关键状态结算本轮结果</span></div>
          <div><strong>转博路线</strong><span>满足对应年份和科研要求后，可以选择继续博士阶段</span></div>
          <div><strong>角色解锁</strong><span>完成指定成就后解锁新的角色与正逆位玩法</span></div>
          <div><strong>历史记录</strong><span>角色页面会逐步记录通关次数、科研分、引用和代表作</span></div>
        </div>
        <div class="lobby-info-placeholder"><strong>完整结局表</strong><span>详细条件、奖励和角色解锁路线将在结局系统完成后补充</span></div>
      `;
    case "updates":
      return `
        ${renderInfoSectionHeading("开发记录", "版本记录", "2.0 正在持续开发")}
        <div class="lobby-info-update-list">
          <div><strong>当前版本</strong><span>2.0 开发版</span><small>基础属性、Buff、日历、事件和日志已接入</small></div>
          <div><strong>近期调整</strong><span>事件文本、数值审阅、抵抗提示和关系称谓</span><small>持续校对中</small></div>
          <div><strong>后续计划</strong><span>论文、商店、成果和完整成就判定</span><small>按模块逐步恢复</small></div>
        </div>
      `;
  }
}

export function renderLobbyInfoView(activeSection: LobbyInfoSectionId = "overview"): string {
  return `
    <section class="lobby-community-view lobby-info-view" aria-label="游戏信息">
      ${renderLobbyInfoNavigation(activeSection)}
      <article class="lobby-info-article">
        ${renderLobbyInfoArticle(activeSection)}
      </article>
    </section>
  `;
}

export function renderLobbyMessageView(): string {
  return `
    <section class="lobby-community-view lobby-message-view" aria-labelledby="lobby-message-title">
      ${renderMessageComposer("board")}
      <section class="community-message-stream">
        <div class="lobby-community-section-head">
          <div>
            <span>玩家社区</span>
            <h1 id="lobby-message-title">留言板</h1>
          </div>
          <strong class="community-message-count">0 条</strong>
        </div>
        <div class="community-message-empty">
          <i data-lucide="messages-square" aria-hidden="true"></i>
          <strong>还没有 V2 留言</strong>
          <span>留言服务接入后，这里会显示玩家的留言和回复</span>
        </div>
        <div class="community-pagination" aria-label="留言分页">
          <button type="button" disabled aria-label="上一页"><i data-lucide="chevron-left" aria-hidden="true"></i></button>
          <span><strong>1</strong> / 1</span>
          <button type="button" disabled aria-label="下一页"><i data-lucide="chevron-right" aria-hidden="true"></i></button>
        </div>
      </section>
    </section>
  `;
}

export function renderGameFeedbackOverlay(): string {
  return `
    <div class="community-feedback-overlay" role="dialog" aria-modal="true" aria-labelledby="game-feedback-title">
      <button class="community-feedback-backdrop" type="button" data-ui-close-feedback aria-label="关闭留言反馈"></button>
      <section class="community-feedback-dialog">
        <div class="community-feedback-header">
          <div>
            <span>游戏内反馈</span>
            <h1 id="game-feedback-title">留言反馈</h1>
          </div>
          <button class="community-feedback-close" type="button" data-ui-close-feedback aria-label="关闭">
            <i data-lucide="x" aria-hidden="true"></i>
          </button>
        </div>
        ${renderMessageComposer("feedback")}
      </section>
    </div>
  `;
}
