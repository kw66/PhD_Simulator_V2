import { REVIEW_BASE_THRESHOLDS, REVIEW_TARGET_AVERAGE_INFLUENCE, REVIEWER_ANNUAL_WEIGHT_DELTAS, REVIEWER_BASE_WEIGHTS, REVIEWER_DEFINITIONS } from "../core/v2-paper-rules";
import { ADVISOR_GRANTS } from "../core/v2-advisor-progress";
import { getSecondaryPlayHelpContext } from "./v2-play-help-secondary";
import type { PlayRenderUiState } from "./v2-render-types";

export interface PlayHelpPage {
  title: string;
  summary: string;
  body: string;
  expandable?: boolean;
}

export interface PlayHelpContext {
  key: string;
  label: string;
  pages: readonly PlayHelpPage[];
}

function directPage(title: string, body: string): PlayHelpPage {
  return { title, summary: "", body };
}

function detailPage(title: string, summary: string, body: string): PlayHelpPage {
  return { title, summary, body, expandable: true };
}

type ReviewerGuideSection = "probability" | "method" | "effect";

function renderReviewerGuide(section: ReviewerGuideSection, offset = 0, count = 8): string {
  const rules = {
    novelty: ["idea×2，其余各×0.5", "拒稿：idea+5"],
    experiment: ["实验×2，其余各×0.5", "拒稿：实验+5"],
    normal: ["三项各×0.8～1.4", "拒稿：三项各+2"],
    gpt: ["三项各×0.2～2.6", "—"],
    expert: ["最高两项各×1.5", "拒稿：idea+10"],
    kind: ["最高一项×3", "结算：SAN+1"],
    strict: ["最低两项各×1.5", "拒稿：最低两项各+3"],
    hostile: ["最低一项×3", "基础：SAN-2"],
  };
  const weights = new Map(REVIEWER_BASE_WEIGHTS);
  const deltas = new Map(REVIEWER_ANNUAL_WEIGHT_DELTAS);
  return `<table class="panel-tip-table reviewer-guide-table reviewer-${section}-table">
    <thead><tr><th scope="col">审稿人</th><th scope="col">${{ probability: "概率", method: "评分方式", effect: "结果影响" }[section]}</th></tr></thead>
    <tbody>${REVIEWER_DEFINITIONS.slice(offset, offset + count).map(({ type, name }) => {
      const base = Math.round((weights.get(type) ?? 0) * 100);
      const delta = Math.round((deltas.get(type) ?? 0) * 100);
      const coefficient = Math.abs(delta) === 1 ? "" : Math.abs(delta);
      const probability = delta === 0 ? `${base}%` : `(${base}${delta > 0 ? "+" : "−"}${coefficient}y)%`;
      const value = section === "probability" ? probability : rules[type][section === "method" ? 0 : 1];
      return `<tr><th scope="row">${name.replace("审稿人", "")}</th><td>${value}</td></tr>`;
    }).join("")}</tbody></table>`;
}

function renderReviewerThresholds(): string {
  return `<table class="panel-tip-table workstation-threshold-table">
    <thead><tr><th scope="col">审稿人</th><th scope="col">A类</th><th scope="col">B类</th><th scope="col">C类</th></tr></thead>
    <tbody>${REVIEWER_DEFINITIONS.map(({ type, name }) => `<tr><th scope="row">${name.replace("审稿人", "")}</th>${(["A", "B", "C"] as const).map((target) => {
      const threshold = REVIEW_BASE_THRESHOLDS[target][type];
      return `<td>${threshold.reject} / ${threshold.borderline}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table>`;
}

const WORKSTATION_PAGES: readonly PlayHelpPage[] = [
  directPage("科研入门", `<p><b>新建论文→想idea→做实验→写论文</b>，点击卡片选择要修改的论文。</p>
    <p>实验需要idea有分，写作需要实验有分。</p>
    <p>分数格上行是<b>自身分</b>，下行是<b>协作分</b>，右侧总分为六格之和。</p>
    <p><b>多次执行：</b>装备或Buff可让一次科研连续执行多遍，不额外扣行动点或SAN；每遍都重新生成分数，每遍与上一遍自身分+1取最大值。</p>
    <details class="play-help-details"><summary>多次执行的规则</summary><div class="play-help-detail-content">
    <p>“仅下次”加分与倍率只用于第一遍；持续Buff和装备每遍生效。协作分不变。</p>
    <p>总次数=1+⌊n⌋，n为额外次数之和，至少执行1次。</p></div></details>`),
  detailPage("科研分数计算", `<p>科研越高，本次生成分数通常越高。操作只更新一项<b>自身分，至少+1</b>；协作分持续累加，不会被覆盖。</p>`,
    `<p><b>基础分</b> = 科研能力×随机倍率（0.5～1.5）+随机加分（0～5）</p>
    <p><b>本次分</b> = 基础分×总倍率+固定分，结果四舍五入</p>
    <p><b>更新自身分：</b>原自身+1与本次分，取较大值</p>
    <p><b>先合并倍率，再加固定分</b>：倍率从×1开始，×1.5算+0.5，×0.8算−0.2。两个×1.5合并为×2。</p>
    <p>固定分来自生效的Buff、AI和显卡。</p>
    <p>例：自身20、协作10，本次25→自身25、协作10，合计35。</p>`),
  directPage("会议投稿", `<p>idea、实验、写作都有分即可投稿；<b>审稿3个月，期间不能修改</b>。</p>
    <p>评审按<b>投稿时idea、实验、写作各项的自身分与协作分之和</b>计算，审稿期间的衰减不影响本次评审。</p>
    <p>会议参考分对应三项均衡时约50%的录用率，<b>不保证录用</b>。</p>
    <p><b>三人评审：</b>接收+1、边缘0、拒稿−1。总评≥+2接收，≤−2拒稿；其余由PC结合总评、投稿总分和会议等级判定。</p>`),
  detailPage("会议分数衰减", `<p>草稿和会议审稿中的论文每月衰减，<b>热度越高，衰减越快</b>。拒稿后从衰减后的分数继续修改。</p>`,
    `<p>每项扣分=⌊s×h×10%⌋，至少扣1；合计最低保留1。</p>
    <p>s为该项自身与协作合计分，h为热度。</p>
    <p><b>热度会影响引用倍率</b>；不同topic的热度会随时间变化，新建论文按当年热度抽取。</p>
    <p>原本0或1分不扣。先算合计扣分，再按自身／协作比例分摊。</p>`),
  directPage("审稿人概率", `<p>3位独立抽取，类型可重复。<b>y=投稿学年−1</b>，首年y=0。</p>${renderReviewerGuide("probability")}`),
  directPage("审稿评分", `${renderReviewerGuide("method")}<p>普通与LLM的三项权重随机生成，<b>权重之和均为3</b>。最高／最低按投稿时的各项合计分选取，有效分四舍五入。</p>`),
  directPage("审稿人反馈", `<p>拒稿加分只在退稿后生效；<b>SAN变化无论中稿或拒稿都生效</b>，三位审稿人的效果可叠加。扣SAN先乘疾病倍率并向上取整，再加季节与恋人固定修正，最低0；恢复不受影响。</p>${renderReviewerGuide("effect")}`),
  directPage("审稿门槛", `<p><b>基础门槛：边缘／接收</b>，低于前值拒稿，达到后值接收。</p>${renderReviewerThresholds()}
    <details class="play-help-details"><summary>按会议影响力换算</summary><div class="play-help-detail-content">
    <p>实际门槛=基础门槛×会议影响力÷等级均值，四舍五入。等级均值：A ${REVIEW_TARGET_AVERAGE_INFLUENCE.A}，B ${REVIEW_TARGET_AVERAGE_INFLUENCE.B}，C ${REVIEW_TARGET_AVERAGE_INFLUENCE.C}。</p></div></details>`),
  directPage("会议结果", `<p><b>拒稿：</b>回到草稿，保留衰减后的分数，再将审稿反馈加到自身分，协作分不变。</p>
    <p><b>中稿：</b>论文移入成果、腾出卡片，一作按等级增加科研分。</p>
    <p>成长奖励另记为<b>天赋触发</b>，一篇可同时完成多项；审稿SAN影响在确认结果时结算。</p>
    <p><b>录用类型：</b>A类可获Poster、Spotlight、Oral、Best Paper Candidate或Best Paper；B／C类为Poster或Oral。</p>
    <p>按投稿总分和会议影响力抽取，达到分数线也不保证抽中。引用倍率见成果提示。</p>`),
  directPage("期刊投稿", `<p>期刊送审后<b>不衰减，可继续修改、接受协作</b>。</p>
    <table class="panel-tip-table"><thead><tr><th>期刊</th><th>送审分</th><th>达标分</th></tr></thead><tbody>
      <tr><th>PAMI</th><td>75</td><td>125</td></tr><tr><th>NMI</th><td>100</td><td>250</td></tr><tr><th>Nature</th><td>150</td><td>500</td></tr>
    </tbody></table><p><b>期刊分=idea+实验+写作</b>，自身与协作分均计入。三项都有分且总分达到送审线即可投稿。</p>
    <p>送审后继续按当前总分判断，达到录用线即发表并开始被引。</p>`),
];

const RELATIONSHIP_PAGES: readonly PlayHelpPage[] = [
  detailPage("导师成长", `<p>科研积累从<b>20</b>开始；科研经费初始0、经费上限20。有经费时每月消耗1，科研积累按5%自然增长，增长量下取整；经费不足时暂停自然增长。</p>
    <p>做横向：<b>基础SAN-5、经费+1</b>，实际消耗见按钮；不耗行动点，每月限一次。</p>`,
    `<p>每月先结算导师收入，再消耗经费；论文固定科研分会增加导师积累，同一篇论文只计一次。3月先增长再申请，8月公布结果，积累不扣除。</p>
    <p>项目门槛与期限见下一条提示；院士需积累1000且已获杰青，获选后每月经费+1。</p>
    <p>人际SAN减免（含Gemini 3及后续型号）适用于同学、导师和恋人。</p>`),
  directPage("导师项目", `<table class="panel-tip-table"><thead><tr><th>项目</th><th>积累</th><th>经费</th><th>期限</th></tr></thead><tbody>${ADVISOR_GRANTS.filter((grant) => grant.id !== "academician").map((grant) => `<tr><th>${grant.name}</th><td>${grant.threshold}</td><td>+${grant.funding}</td><td>${grant.durationYears}年</td></tr>`).join("")}</tbody></table>
    <p>每年按积累申请符合门槛且不限项的最高新项目，积累不扣除。</p>`),
  detailPage("导师职称与补助", `<p><b>晋升后下月加薪</b>：硕士每级+0.25金币，博士每级+0.5金币。</p>
    <p><b>小数累计、整数发放</b>，如1.5按1、2交替。</p>`,
    `<table class="panel-tip-table"><thead><tr><th>获批</th><th>职称</th><th>硕士/月</th><th>博士/月</th></tr></thead><tbody>
    <tr><th>—</th><td>讲师</td><td>1</td><td>3</td></tr>
    <tr><th>青基</th><td>副教授</td><td>1.25</td><td>3.5</td></tr><tr><th>面上</th><td>教授·四级</td><td>1.5</td><td>4</td></tr><tr><th>优青</th><td>教授·三级</td><td>1.75</td><td>4.5</td></tr><tr><th>杰青</th><td>教授·二级</td><td>2</td><td>5</td></tr><tr><th>院士</th><td>教授·一级</td><td>2.25</td><td>5.5</td></tr>
    </tbody></table><p>讲师限1项，晋升后限2项；项目到期释放名额，职称与已获项目保留。</p>`),
  detailPage("同学协作", `<p>每位同学每月可主动协作一次，默契也会自动推进协作进度；进度满100后自动互助，超出部分保留。</p>
    <p>每篇共同发表的论文默契+1，默契上限20。</p>`,
    `<p>主动推进=⌊你的科研⌋+随机0～5，SAN消耗见按钮；审稿期间也能推进。</p>
    <table class="panel-tip-table rel-help-table"><thead><tr><th>同学</th><th>帮助方式</th></tr></thead><tbody>
    <tr><th>师兄／师姐</th><td>提升最高项</td></tr><tr><th>同门</th><td>随机提升一项</td></tr><tr><th>师弟／师妹</th><td>提升最低项</td></tr>
    </tbody></table><p>每次只帮一篇论文的一项。双方独立结算，条满时按各自科研能力给对方论文加分；没有可修改论文时，互助机会暂存，各最多一次。</p>`),
  directPage("同学论文", `<p>加入时开新稿，此后每2个月科研一次：依次完成idea、实验、写作；同一人的研究方向固定。</p>
    <p>达到当月会议参考分后，优先投A，其次B、C。<b>审稿3个月</b>，拒稿继续改，中稿开新篇。</p>
    <p><b>你实际帮这篇论文加过分才会署名</b>；接收后计入合作成果、引用和合作发表奖励，不计玩家科研分。</p>`),
  detailPage("恋人类型与约会", `<p>恋人有<b>活泼</b>和<b>聪慧</b>两种类型，科研与亲密的初始侧重点相反。</p>
    <p>玩耍、学习、购物各有100进度，每月共用一次约会；基础消耗依次为金币-2、SAN-4、金币-3，实际见按钮；科研与亲密上限均为20。</p>`,
    `<p>初始属性：活泼恋人科研3～6、亲密9～12；聪慧恋人科研9～12、亲密3～6。</p>
    <p>手动进度：玩耍=⌊(亲密+你的社交)/2⌋；学习=⌊(恋人科研+你的科研)/2⌋；购物=⌊亲密/2⌋+10。</p>
    <p>恋爱次月起：活泼恋人玩耍+亲密、学习+⌊亲密/2⌋；聪慧恋人学习+亲密、玩耍+⌊亲密/2⌋，购物只靠手动约会。进度条和卡片底部提示显示当前路线效果。</p>`),
  detailPage("恋人条满奖励", `<p>玩耍和学习每次满100，亲密+1并按三轮循环；购物每次满100获得礼物券和亲密。</p>`,
    `<p><b>玩耍：</b>①SAN+6；②SAN上限+1；③下个月SAN消耗-1，含事件与审稿等即时损失，不影响固定月耗和恢复。</p>
    <p><b>学习：</b>①随机论文协作项+恋人科研；②论文三项分数永久+1；③科研能力较低者+1。</p>
    <p><b>购物：</b>礼物券+1、亲密+2。礼物券优先用于手动商店购买，没有其他可购买项目时才用于自动续费。</p>
    <p>没有可帮助的论文时，学习奖励暂存，之后自动使用。</p>`),
];

export function getPlayHelpContext(uiState: PlayRenderUiState = {}): PlayHelpContext {
  if (uiState.activePlayTab === "workstation") return { key: "workstation", label: "科研提示", pages: WORKSTATION_PAGES };
  if (uiState.activePlayTab === "relationship") return { key: "relationship", label: "人际提示", pages: RELATIONSHIP_PAGES };
  return getSecondaryPlayHelpContext(uiState);
}

export function getPlayHelpPageIndex(context: PlayHelpContext, requested = 0): number {
  return Number.isFinite(requested) ? Math.max(0, Math.min(context.pages.length - 1, Math.floor(requested))) : 0;
}

export function renderPlayHelpPanel(uiState: PlayRenderUiState = {}): string {
  const context = getPlayHelpContext(uiState);
  if (context.pages.length === 0) return "";
  const index = getPlayHelpPageIndex(context, uiState.helpPageByContext?.[context.key]);
  const page = context.pages[index]!;
  const content = page.expandable
    ? `<div class="play-help-summary">${page.summary}</div><details class="play-help-details">
        <summary><span class="play-help-expand">查看详细规则</span><span class="play-help-collapse">收起详细规则</span></summary>
        <div class="play-help-detail-content">${page.body}</div>
      </details>`
    : `${page.summary ? `<div class="play-help-summary">${page.summary}</div>` : ""}<div class="play-help-content">${page.body}</div>`;
  return `<div class="play-help-area">
    <button class="play-help-toggle btn-sm" type="button" data-ui-help-toggle aria-controls="play-help-panel" aria-expanded="${uiState.isHelpOpen === true}">💡 小提示</button>
    <section class="play-help-panel${uiState.isHelpOpen ? " is-open" : ""}" id="play-help-panel" aria-label="${context.label}" data-help-context="${context.key}" data-help-page-index="${index}" data-help-page-count="${context.pages.length}">
      <div class="play-help-header">
        <strong class="play-help-topic">💡 ${page.title}提示</strong>
        <nav class="play-help-pagination" aria-label="提示分页"${context.pages.length === 1 ? " hidden" : ""}>
          <button class="todo-nav-btn" type="button" data-ui-help-page="${index - 1}" aria-label="上一条提示" ${index === 0 ? "disabled" : ""}>‹</button>
          <span>${index + 1}/${context.pages.length}</span>
          <button class="todo-nav-btn" type="button" data-ui-help-page="${index + 1}" aria-label="下一条提示" ${index === context.pages.length - 1 ? "disabled" : ""}>›</button>
        </nav>
        <button class="play-help-close todo-nav-btn" type="button" data-ui-help-toggle aria-label="收起小提示">×</button>
      </div>
      <div class="play-help-body panel-tip-group" tabindex="0" aria-label="提示内容">${content}</div>
    </section>
  </div>`;
}
