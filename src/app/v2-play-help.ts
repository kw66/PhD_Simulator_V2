import { REVIEW_BASE_THRESHOLDS, REVIEW_TARGET_AVERAGE_INFLUENCE, REVIEWER_ANNUAL_WEIGHT_DELTAS, REVIEWER_BASE_WEIGHTS, REVIEWER_DEFINITIONS } from "../core/v2-paper-rules";
import { LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD } from "../core/v2-lab-projects";
import { ANNUAL_RESEARCH_HELP_PAGE, ATTRIBUTE_RESISTANCE_HELP_PAGE, SALARY_HELP_PAGE, getSecondaryPlayHelpContext } from "./v2-play-help-secondary";
import type { PlayRenderUiState } from "./v2-render-types";
import { renderPaperTerm } from "./v2-paper-terms";
import { THESIS_REVIEW_THRESHOLDS } from "../core/v2-thesis-rules";

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
  if (section === "probability" && count > 4) {
    const firstCount = Math.ceil(count / 2);
    return `<div class="reviewer-probability-columns">${renderReviewerGuide(section, offset, firstCount)}${renderReviewerGuide(section, offset + firstCount, count - firstCount)}</div>`;
  }
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
  detailPage("科研分数计算", `<p>科研越高，本次生成分数通常越高。操作只更新一项<b>自身分，至少+1</b>；协作分持续累加，不会被覆盖。</p>`,
    `<p>基础分 = 实际科研能力×随机倍率（0.5～1.5）+随机加分（0～5），科研小数不提前取整。</p>
    <p>本次分 = 基础分×总倍率+固定分，结果四舍五入</p>
    <p>更新自身分：原自身+1与本次分，取较大值</p>
    <p>先合并倍率，再加固定分：倍率从×1开始，×1.5算+0.5，×0.8算−0.2。两个×1.5合并为×2。</p>
    <p>例：自身20、协作10，本次25→自身25、协作10，合计35。</p>`),
  detailPage("多次执行", `<p>装备或Buff可让一次科研连续执行多遍；额外执行不另扣行动点或SAN，实验经费也只收一次。</p>
    <p>每遍都重新生成分数，每遍与上一遍自身分+1取最大值。</p>`,
    `<p>总次数=1+⌊n⌋，n为额外次数之和，至少执行1次。</p>
    <p>“仅下次”加分与倍率只用于第一遍；持续Buff和装备每遍生效。协作分不变。</p>
    <p>例如原自身分10，连续生成8和9分，两遍分别保底到11和12分。</p>`),
  directPage("实验经费", `<p>做实验先结算全组费用变动，再扣你的个人减免，费用最低为0。</p>
    <p>费用优先从导师科研经费支付；<b>不足的差额由你自付金币</b>。经费和金币合计不足时，本次无法做实验。</p>`),
  directPage("会议投稿", `<p>评审使用投稿时三项自身分与协作分的合计快照；审稿期间的衰减不影响本次评审。</p>
    <p>会议参考分对应三项均衡时约50%的录用率，不保证录用。</p>
    <p>三人评审：${renderPaperTerm("Accept")} +1、${renderPaperTerm("Borderline")} 0、${renderPaperTerm("Reject")} −1。<b>总评≥+2</b>为Accept，<b>≤−2</b>为Reject；其余由PC结合总评、投稿总分和会议等级判定。</p>`),
  detailPage("会议分数衰减", `<p>草稿和会议审稿中的论文每月衰减，<b>热度越高，衰减越快</b>。拒稿后从衰减后的分数继续修改。</p>`,
    `<p>每项扣分=⌊s×h×10%⌋，至少扣1；合计最低保留1。</p>
    <p>s为该项自身与协作合计分，h为热度。</p>
    <p>热度也影响引用倍率；不同topic的热度会随时间变化，新建论文按当年热度抽取。</p>
    <p>原本0或1分不扣。先算合计扣分，再按自身／协作比例分摊。</p>`),
  directPage("审稿人概率", `<p>随着学年推进，审稿人的平均质量逐渐下降，AI审稿激增。论文投稿越来越像随机抽奖：辛苦打磨的工作，能不能中还得看抽到谁。</p>
    <p>3位独立抽取，类型可重复。<b>y=投稿学年−1</b>，首年y=0。</p>${renderReviewerGuide("probability")}`),
  directPage("审稿评分", `${renderReviewerGuide("method")}<p>普通与LLM的三项权重随机生成，<b>权重之和均为3</b>。最高／最低按投稿时的各项合计分选取，有效分四舍五入。</p>`),
  directPage("审稿人反馈", `<p>拒稿加分只在退稿后生效；SAN变化<b>中稿或拒稿均生效</b>，三位审稿人的效果可叠加。扣SAN先乘疾病倍率并向上取整，再加季节与恋人固定修正，最低0；恢复不受影响。</p>${renderReviewerGuide("effect")}`),
  directPage("审稿门槛", `<p>表中依次为${renderPaperTerm("Borderline")}／${renderPaperTerm("Accept")}基础门槛；低于前值为Reject，达到后值为Accept。</p>${renderReviewerThresholds()}
    <p>实际门槛=基础门槛×会议影响力÷等级均值，四舍五入。等级均值：A ${REVIEW_TARGET_AVERAGE_INFLUENCE.A}，B ${REVIEW_TARGET_AVERAGE_INFLUENCE.B}，C ${REVIEW_TARGET_AVERAGE_INFLUENCE.C}。</p>`),
  directPage("毕业论文", `<p>推进分按科研能力向下取整；SAN基础消耗不受科研档位减免，季节与通用SAN效果仍生效。</p>`),
  directPage("支撑论文", `<p>只计自己的一作成果。各方向取最高的2／3篇，合计最高的方向作为大论文方向，缺少的研究点从0开始。</p>
    <p>送审前，同方向新论文高于研究点<b>当前总分</b>才整体替换，不叠加此前提升；每篇只支撑一个研究点。</p>
    <p>其他方向最高2／3篇的总分超过当前所有研究点总分时，整体换方向，旧提升清除，当月次数不重置。</p>`),
  directPage("毕业盲审", `<p>硕士3位、博士5位专家，随机权重之和为3，有效分四舍五入。</p>
    <p>A／B参考刻度按各研究点同分计算，仅作参考；超过A参考线仍可继续提升。</p>
    <table class="panel-tip-table thesis-threshold-table"><thead><tr><th scope="col">有效分门槛</th><th scope="col">C</th><th scope="col">B</th><th scope="col">A</th></tr></thead><tbody>
    <tr><th>硕士</th><td>${THESIS_REVIEW_THRESHOLDS.master.C}</td><td>${THESIS_REVIEW_THRESHOLDS.master.B}</td><td>${THESIS_REVIEW_THRESHOLDS.master.A}</td></tr>
    <tr><th>博士</th><td>${THESIS_REVIEW_THRESHOLDS.phd.C}</td><td>${THESIS_REVIEW_THRESHOLDS.phd.B}</td><td>${THESIS_REVIEW_THRESHOLDS.phd.A}</td></tr></tbody></table>
    <p>低于C线为D；全部A／B才通过，全A获优秀硕士／博士论文。百分制评分在对应等级区间内生成，不改变结果。</p>`),
  detailPage("找工作计分", `<p>找工作进度条分为履历、主动推进和面试经验。履历随成果实时变化；笔面试无论成败，面试经验均+5～10。进度条以各方向最高岗位门槛为参照。</p>`,
    `<table class="panel-tip-table"><thead><tr><th>方向</th><th>履历分</th><th>主动推进</th></tr></thead><tbody>
    <tr><th>大厂</th><td>学历20／50＋科研分×4＋每100引用×2＋实习次数×20</td><td>⌊科研能力×0.5⌋</td></tr>
    <tr><th>央国企</th><td>学历20／50＋科研分×2＋国奖次数×20</td><td>⌊科研能力×0.25⌋＋随机0～5</td></tr>
    <tr><th>公务员</th><td>学历20／50＋科研分＋国奖次数×10</td><td>⌊推进前当前SAN÷2⌋＋随机0～5，SAN最低按0计</td></tr>
    <tr><th>教职</th><td>科研分×6＋每100引用×3＋参与结项的纵向×2＋横向＋导师帽子</td><td>⌊科研能力×0.25⌋</td></tr>
    </tbody></table>
    <p>学历20／50分别指硕士／博士；教职仅限博士。导师帽子按无、青基、面上、优青、杰青、院士分别加0／5／15／30／40／50分。</p>
    <p>四个方向各有六档岗位，分数是录用概率的参考线，不是必过线。明显低于要求时录用率截断为0%，最高95%。</p>
    <p>每个方向每月可主动推进一次。招聘窗口：大厂9月至次年3月、央国企10月至次年4月、公务员11月至次年5月、教职12月至次年6月；教职仅限博士。</p>
    <p>毕业学年每月最多参加一场招聘。已有 offer 仍可应聘，但只能保留一份；新机会可替换旧 offer。找工作结果不影响毕业。</p>`),
  directPage("期刊投稿", `<p>期刊送审后分数<b>不衰减</b>，仍可修改和接受协作。</p>
    <p>点击期刊按钮送审；达到达标分后可继续修改，再次点击该期刊按钮才发表。玩家一作的版面费在缴费事件最后确认时才扣除。</p>`),
];

const RELATIONSHIP_PAGES: readonly PlayHelpPage[] = [
  ATTRIBUTE_RESISTANCE_HELP_PAGE,
  directPage("导师项目", `<p>你和同学发表论文时，按获得的科研分提升导师科研积累。同学也会自动推进项目。</p>
    <p>纵向结项时若没有可修改论文，写作协作奖励会各暂存一次。</p>`),
  directPage("科研经费", `<p>科研经费低于0时实验室破产。同学实验先用经费，不足差额用钱包；两者都不足则改做横向。</p>
    <p>同学做项目时，月初经费&lt;${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}选横向，否则选纵向。</p>`),
  SALARY_HELP_PAGE,
  directPage("经费报销", `<p>报销按购买时的实际费用扣科研经费，已支付的费用不退；经费不足时暂停报销，不自动改为自费。</p>
    <p>显卡、工位报销限获批当月使用；AI报销可留待后续购买或续费，次数用完才结束。</p>`),
  directPage("会议费用", `<p>一作注册费由导师支付；同学的参会也默认免费代贴。同一会议的多篇论文只结算一次差旅。</p>
    <p>参会选项在录用时出现，确认时支付；亲自参会后，到开会月才开放会场活动。找人代贴不参加活动。</p>
    <p>VALSE免注册费，差旅2金币。</p>`),
  directPage("会场活动", `<p>亲自参会后才有会场活动；高级活动需<b>社交≥6</b>。</p>
    <p>C类只从低级活动中抽取3个选项；B类从高低级混合池抽4个，A类抽5个。</p>
    <p>A／B类不保底高级活动；社交达标也不保证本次抽中。</p>`),
  directPage("大牛合作与邀请", `<p>第2次起与当前大牛合作，社交原始+1，经过抵抗。</p>
    <p>第3次及以后合作时，科研≥12可收到联培邀请。</p>
    <p>拒绝后换一位大牛，合作计数归0，从头积累；可无限拒绝。</p>
    <p>联培奖励详见天赋→关系。</p>`),
  directPage("企业交流与邀请", `<p>企业交流第2次起，已有<b>A类会议论文</b>，或有<b>实习经历</b>，且当前没有进行中的实习，即可收到企业实习邀请。</p>
    <p>可无限拒绝，拒绝不清空企业交流计数；以后满足条件仍可获邀。</p>
    <p>远程实习通过导师约谈获准；实习待遇详见天赋→关系。</p>`),
  directPage("会场搭讪", `<p>选择“异性学者”后，活泼／聪慧各50%，不能直接选类型。</p>
    <p>活泼：SAN+5；聪慧：下次想idea+2分、额外执行2次，不额外消耗行动点。</p>
    <p>与同一人第2次搭讪起，社交原始+1，经过抵抗；两位学者分别计数。</p>`),
  directPage("恋人邀请", `<p>与同一人搭讪≥3次（含本次），社交≥12且没有恋人时，对方会约你单独见面。</p>
    <p>接受活泼恋人：SAN上限+3；接受聪慧恋人：科研原始+1，经过抵抗。接受或拒绝后，同类型会场联系人换新、计数归0，可再次结识。</p>
    <p>已有恋人时搭讪，当前恋人亲密原始-6，经过抵抗；结算后亲密&lt;0则分手。</p>`),
  directPage("期刊版面费", `<p>PAMI／NMI／Nature的OA版面费为5／10／20；玩家一作发表后进入“期刊中稿→缴费方式→缴费确认”。</p>
    <p>可选自费或导师经费，最终确认时扣款，不能返回重选；不足时按钮显示失败预警。</p>
    <p>同学一作发表时自动扣科研经费，不扣同学钱包；离校后论文费用责任保留。</p>`),
  directPage("同学协作", `<p>审稿中的论文仍可协作。自动推进使用实际默契，长期合作每月额外推进1次。</p>
    <p>满100互助，加分为⌊帮助者科研⌋。你帮同学最低项，同学随机选你的论文，方向如下。</p>
    <table class="panel-tip-table"><thead><tr><th>同学</th><th>帮助方向</th></tr></thead><tbody><tr><th>师兄／师姐</th><td>idea</td></tr><tr><th>同门</th><td>随机一项</td></tr><tr><th>师弟／师妹</th><td>实验</td></tr></tbody></table>
    <p>无可修改论文时，双方各暂存一次帮助。</p>`),
  detailPage("同学论文", `<p>加入时开新稿，次月开始科研；科研成功后，下月做项目，两者交替。审稿3个月，等待时继续做项目。</p>
    <p>中稿当月开新稿，退稿当月继续修改。你实际帮助过才会署名；成果与引用计入玩家，科研分不计。</p>`,
    `<p>论文按idea→实验→写作补齐，再提升最低项；达到参考分后优先投A，其次B、C。共同发表使默契原始+1，经过抵抗，双方主导均可触发。</p>`),
  directPage("同学学业", `<p>同门与你同届；师弟／师妹加入时为硕士，毕设辅导为大四，指导新生为第一年。初始科研=年级×2+随机0～3，从0逐点抵抗，上限20。</p>
    <p>6月底：第2／3年硕士科研分达到2／3先转博；第3年仍为硕士需科研分1、第6年博士需科研分7才毕业。未达标退学并结束合作，已投稿论文及费用责任保留。</p>`),
  directPage("同学钱包与AI", `<p>同学的钱包只补实验差额和订阅AI，不付论文费用。预留生活费与一次实验费用后，才会择优订阅AI，每月一种。</p>
    <p>AI只作用于自己的论文，不影响协作；离校后保留钱包与论文责任，不再发工资或购买AI。</p>`),
  ANNUAL_RESEARCH_HELP_PAGE,
  directPage("长期合作", `<p>合作机会在条件暂未满足时会保留。长期合作从次月起生效，标签不能单独取消。</p>
    <p>人际栏满时可先关闭事件，停止其他合作后再确认；仍满则无事发生，不扣费、不新增。</p>`),
  directPage("恋人初始属性", `<p>科研基础=年级×2+随机0～3；聪慧额外+3。亲密基础=3+随机0～3；活泼额外+3。两项分别抵抗，上限20。</p>`),
  directPage("恋人约会", `<p>三条约会路线共用每月一次的主动机会。</p>
    <p>主动推进：玩耍=⌊(亲密+你的社交)/2⌋，学习=⌊(恋人科研+你的科研)/2⌋，购物=⌊亲密/2⌋+10。</p>
    <p>自动推进从次月开始，每次⌊月初亲密/2⌋；活泼每月玩耍2次、学习1次，聪慧相反；购物不自动推进。</p>
    <p>条满奖励如无可帮助的论文，学习奖励会暂存。</p>`),
  directPage("恋人条满奖励", `<p>玩耍、学习满100时亲密原始+1并循环三轮；亲密奖励经过档位抵抗。</p>
    <p>学习路线第三轮只提升双方科研较低者，相同时不加；没有可帮助的论文时，论文协作奖励会暂存。礼物券的使用顺序见商店提示。</p>`),
];

export function getPlayHelpContext(uiState: PlayRenderUiState = {}): PlayHelpContext {
  if (uiState.activePlayTab === "workstation") return { key: "workstation", label: "科研提示", pages: WORKSTATION_PAGES };
  if (uiState.activePlayTab === "relationship") return { key: "relationship", label: "人际提示", pages: RELATIONSHIP_PAGES };
  return getSecondaryPlayHelpContext(uiState);
}

export function getPlayHelpPageIndex(context: PlayHelpContext, requested = 0): number {
  return Number.isFinite(requested) ? Math.max(0, Math.min(context.pages.length - 1, Math.floor(requested))) : 0;
}

export function getAllPlayHelpPageIds(): string[] {
  const contexts = [getPlayHelpContext({ activePlayTab: "workstation" }), getPlayHelpContext({ activePlayTab: "relationship" }),
    ...(["events", "research"] as const).map(activePlayTab => getPlayHelpContext({ activePlayTab })),
    ...(["gear", "life", "ai", "coffee", "rest"] as const).map(activeShopTab => getPlayHelpContext({ activePlayTab: "shop", activeShopTab })),
    ...(["character", "relation", "equip", "growth", "publication"] as const).map(activeTalentTab => getPlayHelpContext({ activePlayTab: "talent", activeTalentTab }))];
  return [...new Set(contexts.flatMap(context => context.pages.map((_, index) => `${context.key}:${index}`)))];
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
        <strong class="play-help-topic">💡 ${page.title}</strong>
        <nav class="play-help-pagination" aria-label="提示分页"${context.pages.length === 1 ? " hidden" : ""}>
          <button class="todo-nav-btn pager-arrow" type="button" data-ui-help-page="${index - 1}" aria-label="上一条提示" ${index === 0 ? "disabled" : ""}><i data-lucide="chevron-left" aria-hidden="true"></i></button>
          <span>${index + 1}/${context.pages.length}</span>
          <button class="todo-nav-btn pager-arrow" type="button" data-ui-help-page="${index + 1}" aria-label="下一条提示" ${index === context.pages.length - 1 ? "disabled" : ""}><i data-lucide="chevron-right" aria-hidden="true"></i></button>
        </nav>
        <button class="play-help-close todo-nav-btn" type="button" data-ui-help-toggle aria-label="收起小提示">×</button>
      </div>
      <div class="play-help-body panel-tip-group" tabindex="0" aria-label="提示内容">${content}</div>
    </section>
  </div>`;
}
