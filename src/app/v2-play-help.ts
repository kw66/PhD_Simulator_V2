import { REVIEW_BASE_THRESHOLDS, REVIEW_TARGET_AVERAGE_INFLUENCE, REVIEWER_ANNUAL_WEIGHT_DELTAS, REVIEWER_BASE_WEIGHTS, REVIEWER_DEFINITIONS } from "../core/v2-paper-rules";
import { LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD } from "../core/v2-lab-projects";
import { ANNUAL_RESEARCH_HELP_PAGE, ATTRIBUTE_RESISTANCE_HELP_PAGE, SALARY_HELP_PAGE, getSecondaryPlayHelpContext } from "./v2-play-help-secondary";
import type { PlayRenderUiState } from "./v2-render-types";
import { renderPaperTerm } from "./v2-paper-terms";

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
  directPage("科研入门", `<p><b>新建论文→想idea→做实验→写论文</b>，点击卡片选择要修改的论文。</p>
    <p>实验需要idea有分，写作需要实验有分。</p>
    <p><b>实验基础费用3经费</b>；算力短缺持续6个月，玩家与同学每次实验费用+1。玩家费用由实验室支付，不足时暂停实验；同学不足差额由自己的钱包支付。</p>
    <p>分数格上行是<b>自身分</b>，下行是<b>协作分</b>，右侧总分为六格之和。</p>
    <p>个人显卡RTX 4090起每次实验减1经费，H20起减2；实习减免见天赋→关系，合计费用最低0。减免仅限玩家，不影响同学；先算共享涨价与个人减免，再扣实验室经费。</p>
    <p>悬浮实验按钮查看实际经费消耗；玩家经费不足时不会扣SAN或行动点。</p>`),
  detailPage("多次执行", `<p>装备或Buff可让一次科研连续执行多遍，<b>不额外扣行动点或SAN，实验经费也只收一次</b>。</p>
    <p>每遍都重新生成分数，每遍与上一遍自身分+1取最大值。</p>`,
    `<p>总次数=1+⌊n⌋，n为额外次数之和，至少执行1次。</p>
    <p>“仅下次”加分与倍率只用于第一遍；持续Buff和装备每遍生效。协作分不变。</p>
    <p>例如原自身分10，连续生成8和9分，两遍分别保底到11和12分。</p>`),
  detailPage("科研分数计算", `<p>科研越高，本次生成分数通常越高。操作只更新一项<b>自身分，至少+1</b>；协作分持续累加，不会被覆盖。</p>`,
    `<p><b>基础分</b> = 实际科研能力×随机倍率（0.5～1.5）+随机加分（0～5），科研小数不提前取整。</p>
    <p><b>本次分</b> = 基础分×总倍率+固定分，结果四舍五入</p>
    <p><b>更新自身分：</b>原自身+1与本次分，取较大值</p>
    <p><b>先合并倍率，再加固定分</b>：倍率从×1开始，×1.5算+0.5，×0.8算−0.2。两个×1.5合并为×2。</p>
    <p>固定分来自生效的Buff、AI、显卡和实习；GPT最后两个版本为三项科研提供×1.25倍率。</p>
    <p>例：自身20、协作10，本次25→自身25、协作10，合计35。</p>`),
  directPage("会议投稿", `<p>idea、实验、写作都有分即可投稿；<b>审稿3个月，期间不能修改</b>。</p>
    <p>评审按<b>投稿时idea、实验、写作各项的自身分与协作分之和</b>计算，审稿期间的衰减不影响本次评审。</p>
    <p>会议参考分对应三项均衡时约50%的录用率，<b>不保证录用</b>。</p>
    <p><b>三人评审：</b>${renderPaperTerm("Accept")} +1、${renderPaperTerm("Borderline")} 0、${renderPaperTerm("Reject")} −1。总评≥+2为Accept，≤−2为Reject；其余由PC结合总评、投稿总分和会议等级判定。</p>`),
  detailPage("会议分数衰减", `<p>草稿和会议审稿中的论文每月衰减，<b>热度越高，衰减越快</b>。拒稿后从衰减后的分数继续修改。</p>`,
    `<p>每项扣分=⌊s×h×10%⌋，至少扣1；合计最低保留1。</p>
    <p>s为该项自身与协作合计分，h为热度。</p>
    <p><b>热度会影响引用倍率</b>；不同topic的热度会随时间变化，新建论文按当年热度抽取。</p>
    <p>原本0或1分不扣。先算合计扣分，再按自身／协作比例分摊。</p>`),
  directPage("审稿人概率", `<p>随着学年推进，审稿人的平均质量逐渐下降，AI 审稿激增。论文投稿<b>越来越像随机抽奖</b>：辛苦打磨的工作，能不能中还得看抽到谁。</p>
    <p>3位独立抽取，类型可重复。<b>y=投稿学年−1</b>，首年y=0。</p>${renderReviewerGuide("probability")}`),
  directPage("审稿评分", `${renderReviewerGuide("method")}<p>普通与LLM的三项权重随机生成，<b>权重之和均为3</b>。最高／最低按投稿时的各项合计分选取，有效分四舍五入。</p>`),
  directPage("审稿人反馈", `<p>拒稿加分只在退稿后生效；<b>SAN变化无论中稿或拒稿都生效</b>，三位审稿人的效果可叠加。扣SAN先乘疾病倍率并向上取整，再加季节与恋人固定修正，最低0；恢复不受影响。</p>${renderReviewerGuide("effect")}`),
  directPage("审稿门槛", `<p><b>基础门槛：${renderPaperTerm("Borderline")}／${renderPaperTerm("Accept")}</b>，低于前值为Reject，达到后值为Accept。</p>${renderReviewerThresholds()}
    <p>实际门槛=基础门槛×会议影响力÷等级均值，四舍五入。等级均值：A ${REVIEW_TARGET_AVERAGE_INFLUENCE.A}，B ${REVIEW_TARGET_AVERAGE_INFLUENCE.B}，C ${REVIEW_TARGET_AVERAGE_INFLUENCE.C}。</p>`),
  directPage("会议结果", `<p><b>${renderPaperTerm("Reject")}：</b>回到草稿，保留衰减后的分数，再将审稿反馈加到自身分，协作分不变。</p>
    <p><b>${renderPaperTerm("Accept")}：</b>论文移入成果、腾出卡片，一作按等级增加科研分。</p>
    <p>成长奖励另记为<b>天赋触发</b>，一篇可同时完成多项；审稿SAN影响在确认结果时结算。</p>
    <p><b>录用类型：</b>A类可获${renderPaperTerm("Poster")}、${renderPaperTerm("Spotlight")}、${renderPaperTerm("Oral")}、${renderPaperTerm("Best Paper Candidate")}或${renderPaperTerm("Best Paper")}；B／C类为Poster或Oral。</p>
    <p>按投稿总分和会议影响力抽取，达到分数线也不保证抽中。引用倍率见成果提示。</p>`),
  directPage("期刊投稿", `<p>期刊送审后<b>不衰减，可继续修改、接受协作</b>。</p>
    <table class="panel-tip-table"><thead><tr><th>期刊</th><th>送审分</th><th>达标分</th></tr></thead><tbody>
      <tr><th>PAMI</th><td>75</td><td>125</td></tr><tr><th>NMI</th><td>100</td><td>250</td></tr><tr><th>Nature</th><td>150</td><td>500</td></tr>
    </tbody></table><p><b>期刊分=idea+实验+写作</b>，自身与协作分均计入。三项都有分且总分达到送审线即可投稿。</p>
    <p>送审后继续按当前总分判断，达到录用线即发表并开始被引。PAMI／NMI／Nature的OA版面费分别5／10／20；玩家一作生成“期刊中稿→缴费方式→缴费确认”三幕事件，可选自费或导师经费，最终确认时扣款。</p>`),
];

const RELATIONSHIP_PAGES: readonly PlayHelpPage[] = [
  ATTRIBUTE_RESISTANCE_HELP_PAGE,
  directPage("导师项目", `<p>你和同学发表论文，按科研分提升导师科研积累。基金与晋升详见天赋→关系。</p>
    <p>每月选一项：横向基础SAN-5、纵向SAN-4；推进⌊科研+随机0～5⌋。导师每月轮流推进10，同学也会自动做项目。</p>
    <p>满100结项：横向增加经费并发劳务费；纵向科研积累+10%（向下取整），你和同学各获一篇论文写作协作+10，无可修改论文时暂存一次。</p>`),
  directPage("科研经费", `<p>经费用于学生工资、实验、论文费用和报销；<b>低于0时实验室破产。</b>导师卡“经费收支”可查看本月明细。</p>
    <p>实验基础费用3。算力短缺持续6个月，双方每次+1；显卡和实习减免仅限玩家，先算涨价再减免。</p>
    <p>玩家经费不足暂停实验；同学先用经费，不足差额用钱包，两者都不足则改做横向。</p>
    <p>同学做项目时，月初经费&lt;${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}选横向，否则选纵向。达到该值还会增发工资补贴、开放导师经费事件。</p>`),
  SALARY_HELP_PAGE,
  directPage("经费报销", `<p>“导师经费”事件需经费≥${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}。四档好感对应报销率40%／60%／80%／100%；劳务费必得3／5／7／9金币，领取时扣同额经费。</p>
    <p>显卡、工位各限获批当月一次，购买或升级时扣实际经费，月底失效。</p>
    <p>AI报销下月生效，购买与续费扣实际经费；已付费用不退。经费不足时暂停报销，不自动自费。</p>`),
  directPage("会议费用", `<p><b>录用确认：</b>每篇一作注册费1金币，导师支付；同学同样处理，默认免费代贴。</p>
    <p><b>差旅：</b>国内／亚太／欧美2／4／6金币，同会合并。自费扣金币；报销扣经费及好感1／2／3（抵抗后结算）。找人代贴免费，无会场活动。</p>
    <p><b>时间：</b>录用后即有“会议名参会”，确认时付差旅；结果生成后第3个月开会，最迟当月确认。亲自参会后预告“会议名活动”，到开会月开放。</p>
    <p>VALSE免注册费，差旅2金币。</p>`),
  directPage("会场活动", `<p><b>亲自参会→选择活动→确认结果</b>。高级活动需社交≥6。</p>
    <p>C类只从低级活动中抽取3个选项；B类从高低级混合池抽4个，A类抽5个。</p>
    <p>A／B类不保底高级活动；社交达标也不保证本次抽中。</p>`),
  directPage("大牛合作与邀请", `<p>第2次起与当前大牛合作，社交原始+1，经过抵抗。</p>
    <p>第3次及以后合作时，科研≥12可收到联培邀请。</p>
    <p>拒绝后换一位大牛，合作计数归0，从头积累；可无限拒绝。</p>
    <p>接受后的永久奖励见天赋→关系→大牛联培。</p>`),
  directPage("企业交流与邀请", `<p>企业交流第2次起，<b>已有A类会议论文，或有实习经历</b>，且当前没有进行中的实习，即可收到企业实习邀请。</p>
    <p>可无限拒绝，拒绝不清空企业交流计数；以后满足条件仍可获邀。</p>
    <p>远程实习通过导师约谈获准。两类实习的工资、消耗与实验奖励见天赋→关系。</p>`),
  directPage("会场搭讪", `<p>搭讪只有一个选项，活泼／聪慧各50%，不能直接选类型。</p>
    <p>活泼：SAN+5；聪慧：下次想idea+2分、额外执行2次，不额外消耗行动点。</p>
    <p>同类型第2次搭讪起，社交原始+1，经过抵抗；两种类型分别计数。</p>`),
  directPage("恋人邀请", `<p>搭讪时社交≥12且没有恋人，即可收到恋人邀请。</p>
    <p>接受活泼恋人：SAN上限+3；接受聪慧恋人：科研原始+1，经过抵抗。接受或拒绝后，同类型会场联系人换新、计数归0，可再次结识。</p>
    <p>已有恋人时搭讪，当前恋人亲密原始-6，经过抵抗；结算后亲密&lt;0则分手。</p>`),
  directPage("期刊版面费", `<p>PAMI／NMI／Nature的OA版面费为5／10／20；玩家一作发表后进入“期刊中稿→缴费方式→缴费确认”。</p>
    <p>可选自费或导师经费，最终确认时扣款，不能返回重选；不足时按钮显示失败预警。</p>
    <p>同学一作发表时自动扣科研经费，不扣同学钱包；离校后论文费用责任保留。</p>`),
  directPage("同学协作", `<p>每位同学每月可主动协作一次，基础SAN为师兄／师姐4、同门3、师弟／师妹2；审稿时也可协作。</p>
    <p>主动推进=⌊你的实际科研+随机0～5⌋；自动推进使用实际默契，长期合作每月额外推进1次。</p>
    <p>满100互助，加分为⌊帮助者科研⌋。你帮同学最低项，同学随机选你的论文，方向如下。</p>
    <table class="panel-tip-table"><thead><tr><th>同学</th><th>帮助方向</th></tr></thead><tbody><tr><th>师兄／师姐</th><td>idea</td></tr><tr><th>同门</th><td>随机一项</td></tr><tr><th>师弟／师妹</th><td>实验</td></tr></tbody></table>
    <p>无可修改论文时，双方各暂存一次帮助。</p>`),
  detailPage("同学论文", `<p>加入时开新稿，次月开始科研；科研成功后，下月做项目，两者交替。审稿3个月，等待时继续做项目。</p>
    <p>中稿当月开新稿，退稿当月继续修改。你实际帮助过才会署名；成果与引用计入玩家，科研分不计。</p>`,
    `<p>论文按idea→实验→写作补齐，再提升最低项；达到参考分后优先投A，其次B、C。共同发表使默契原始+1，经过抵抗，双方主导均可触发。</p>`),
  directPage("同学学业", `<p>同门与你同届；师弟／师妹加入时为硕士，毕设辅导为大四，指导新生为第一年。初始科研=年级×2+随机0～3，从0逐点抵抗，上限20。</p>
    <p>6月底：第二／三年硕士科研分达到2／3先转博。第三年仍为硕士需科研分1，第六年博士需科研分7，达标毕业。</p>
    <p>未达标按退学处理并移出人际栏；离开后不再推进或协作，已投稿和论文费用责任保留。</p>`),
  directPage("同学钱包与AI", `<p>金币和AI在卡片第二行，悬浮AI标签查看模型。工资和横向5%劳务费入账，生活费从钱包扣除。</p>
    <p>钱包只补实验差额和订阅AI，不付论文费用。预留1金币生活费与一次实验费用后，从GPT、DeepSeek、豆包、Claude中择优订阅，每月一种。</p>
    <p>AI只作用于自己的论文，不影响协作；离校后保留钱包与论文责任，不再发工资或购买AI。</p>`),
  ANNUAL_RESEARCH_HELP_PAGE,
  directPage("长期合作", `<p>同门合作需社交≥6，师兄／师姐指导需科研≥6，指导师弟／师妹需一作论文；不满足时机会暂存。</p>
    <p>尝试合作／认真指导基础SAN-5；长期合作从次月起每月SAN-1，并额外推进协作1次。长期合作标签不可单独取消。</p>
    <p>人际栏满时可先关闭事件，停止其他合作后再确认；仍满则无事发生，不扣费、不新增。</p>
    <p>同门学术交流下次idea+5，师兄／师姐+8；请师弟／师妹吃饭金币-2、社交+1。</p>`),
  directPage("恋人初始属性", `<p>恋人分活泼、聪慧两类，特质标签放在姓名后。年级和学位随玩家同步。</p>
    <p>科研基础=年级×2+随机0～3；聪慧额外+3。亲密基础=3+随机0～3；活泼额外+3。两项分别抵抗，上限20。</p>
    <p>每学年科研自然成长+2；恋人不计入实验室传承。</p>`),
  directPage("恋人约会", `<p>玩耍、学习、购物各100进度，每月共用一次约会；消耗金币-2、SAN-4、金币-3。</p>
    <p>主动推进：玩耍=⌊(亲密+你的社交)/2⌋，学习=⌊(恋人科研+你的科研)/2⌋，购物=⌊亲密/2⌋+10。</p>
    <p>自动推进从次月开始，每次⌊月初亲密/2⌋；活泼每月玩耍2次、学习1次，聪慧相反；购物不自动推进。</p>
    <p>卡片标签显示主动推进、自动推进和下次奖励。</p>`),
  detailPage("恋人条满奖励", `<p>玩耍、学习满100时亲密原始+1并循环三轮；购物满100得礼物券和亲密。亲密奖励均经抵抗。</p>`,
    `<p><b>玩耍：</b>SAN+6 → SAN上限+1 → 下月即时SAN消耗-1。</p>
    <p><b>学习：</b>论文最低项协作+⌊恋人科研⌋ → 三项科研操作永久各+1分 → 双方科研较低者原始+1（抵抗后结算，相同则不加）。</p>
    <p><b>购物：</b>礼物券+1、亲密原始+2。</p>
    <p>礼物券优先手动购物，无可购买项目时才自动续费；没有可帮助的论文时学习奖励暂存。</p>`),
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
