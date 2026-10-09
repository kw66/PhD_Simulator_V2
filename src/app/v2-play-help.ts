import { REVIEW_BASE_THRESHOLDS, REVIEW_TARGET_AVERAGE_INFLUENCE, REVIEWER_ANNUAL_WEIGHT_DELTAS, REVIEWER_BASE_WEIGHTS, REVIEWER_DEFINITIONS } from "../core/v2-paper-rules";
import { ADVISOR_GRANTS } from "../core/v2-advisor-progress";
import { ADVISOR_SALARY_BONUS } from "../core/v2-content";
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
    <p>个人显卡RTX 4090起每次实验减1经费，H20起减2；远程实习期间再减1，最低0。减免仅限玩家，不影响同学；先算共享涨价与个人减免，再扣实验室经费。</p>
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
  directPage("导师成长", `<p><b>你和同学发表论文，按科研分提升导师科研积累</b>；同一篇只增加一次，恋人论文不计。</p>
    <p><b>项目进度满100才结算：</b>横向按导师职称获得50／60／70／80／90／100科研经费，再从经费支付你和结项时每位在组同学各占总奖励5%的劳务费；无需参与，已离校不领取。纵向导师科研积累增加当前值的10%（下取整）。</p>
    <p>纵向项目满100时，导师为玩家和每位同学各随机选择一篇论文，<b>写作协作+10</b>。暂无可修改论文时，保留一次指导。</p>`),
  detailPage("项目推进", `<p>导师、同学和你共同推进卡片上的两条项目进度。</p>
    <p><b>玩家每月选一项：</b>横向 SAN-5、纵向 SAN-4；推进=⌊实际科研能力+随机0～5⌋，最终向下取整。同学也按自身科研计算。</p>
    <p>导师每月轮流推进项目<b>10</b>，横向不设最低经费要求。</p>`,
    `<p>“导师项目”事件由你牵头：横向基础SAN-8、纵向基础SAN-6，享受科研档位减免；对应进度+100。满条奖励单独记入项目完成日志。</p>`),
  directPage("经费使用", `<p><b>科研经费用于学生工资、实验和论文费用。</b>发薪前经费≥${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}时，硕士额外补贴${ADVISOR_SALARY_BONUS.master}、博士额外补贴${ADVISOR_SALARY_BONUS.phd}金币。</p>
    <p><b>实验基础花费3经费</b>，个人显卡和实习减免仅限玩家；先算共享涨价与个人减免。玩家经费不足时暂停实验，同学先用经费、不足差额自付。</p>
    <p>算力短缺持续6个月，玩家与同学每次实验费用+1。同学经费与个人金币合计不足当次实验费用时改做横向。</p>
    <p>同学自动做项目时按月初经费选择：<b>≥${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}做纵向</b>，否则做横向。</p>
    <p>“导师经费”事件抽中后，需经费<b>达到${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}</b>才会出现；未达标的机会暂存，达标后触发。</p>`),
  directPage("经费报销", `<p>“导师经费”使用实验室经费。显卡、工位、AI报销按导师好感档位以<b>40%／60%／80%／100%</b>获批。</p>
    <p>劳务费无需概率判定，四档为<b>3／5／7／9金币</b>，领取时扣同额经费。</p>
    <p>显卡、工位报销各限<b>获批当月一次</b>，购买或升级时扣实际经费；未使用月底失效，资格列在“本月效果”。</p>
    <p>AI报销<b>下月</b>生效，购买和续费时扣实际经费，本月已支付费用不退还。经费不足时暂停报销，不自动转为自费。</p>`),
  directPage("会议费用", `<p><b>录用结果确认时，每篇一作注册费1金币，由导师经费支付。</b>玩家与同学相同，3个月后不再扣注册费。</p>
    <p><b>确认录用结果后立即出现“会议名参会”，同届论文合并处理。</b>开会月固定为录用结果生成后第3个月，延后确认不顺延；可提前1～3个月完成参会决定，最迟在开会月完成。</p>
    <p>差旅在参会决定最终确认时支付，国内／亚太／欧美为2／4／6金币。自费只扣个人金币；导师报销扣同额经费，好感基础消耗1／2／3，经过抵抗。</p>
    <p>亲自参会确认后，未来待办显示“会议名活动”；到开会月才开放会场活动与论文展示。提前付款不会提前公开论文；挂arXiv或在VALSE展示海报可提前被引，宣传加成在公开后生效。原会议的Oral／Best加成仍等该会议举办后生效。</p>
    <p>请会外联系人代参加免费，不扣差旅或好感，也不进入参会活动。同学默认免费代贴，无差旅。</p>
    <p>领域年会VALSE免注册费，不论有无论文均只需差旅2；自费扣个人金币，报销扣科研经费。到场后的活动名为“VALSE活动”。</p>
    <p>经费为0仍可继续，低于0才破产。危险选择的标记见“事件提示”。</p>`),
  directPage("期刊版面费", `<p>PAMI／NMI／Nature的OA版面费分别5／10／20，不等待3个月。玩家一作发表后进入<b>期刊中稿→缴费方式→缴费确认</b>三幕事件。</p>
    <p>可选自费或导师经费，最终确认时才扣款；选定后不能返回重选。余额不足也可选择，请留意按钮的危险标记。</p>
    <p>同学一作期刊仍在发表时自动扣科研经费，不扣同学钱包；同学离校后已有论文责任保留。经费为0仍可继续，低于0则破产。</p>`),
  directPage("基金申请", `<p>每年3月不限项即申请：优先稳获批的最高新项目，否则申请下一档。<b>申请不扣积累</b>，8月公布。</p>
    <table class="panel-tip-table advisor-project-table"><thead><tr><th>基金</th><th>积累</th><th>经费</th><th>周期</th></tr></thead><tbody>${ADVISOR_GRANTS.filter((grant) => grant.id !== "academician").map((grant) => `<tr><th>${grant.name}</th><td>${grant.threshold}</td><td>+${grant.funding}</td><td>${grant.durationYears}年</td></tr>`).join("")}</tbody></table>
    <p>表中积累为稳获批值。申请时积累≤该值80%，成功率0%；从80%到100%线性升至必过。失败次年可再申请。</p>
    <p>院士需先获得杰青，稳获批积累1000，沿用上述概率；当选时一次性经费+600。</p>`),
  SALARY_HELP_PAGE,
  detailPage("导师职称", `<p>职称提升会增加横向结项收入。你和结项时的在组同学各领收入的5%。</p>`,
    `<table class="panel-tip-table advisor-salary-table"><thead><tr><th>获批</th><th>职称</th><th>横向经费</th><th>每人劳务</th></tr></thead><tbody>
    <tr><th>—</th><td>讲师</td><td>50</td><td>2.5</td></tr>
    <tr><th>青基</th><td>副教授</td><td>60</td><td>3</td></tr><tr><th>面上</th><td>四级教授</td><td>70</td><td>3.5</td></tr><tr><th>优青</th><td>三级教授</td><td>80</td><td>4</td></tr><tr><th>杰青</th><td>二级教授</td><td>90</td><td>4.5</td></tr><tr><th>院士</th><td>一级教授</td><td>100</td><td>5</td></tr>
    </tbody></table><p>讲师限1项，晋升后限2项；项目到期释放名额，职称与已获项目保留。</p>`),
  directPage("同学协作", `<p>每位同学每月可主动协作一次，师兄／师姐、同门、师弟／师妹基础SAN消耗为4、3、2；审稿时也可协作。</p>
    <p><b>主动推进</b>=⌊你的实际科研+随机0～5⌋，最终向下取整；<b>每月自动推进</b>=默契，长期合作每月推进2次。</p>
    <p>自动协作使用实际默契，保留小数。例如默契6.75，普通合作每月推进6.75，长期合作推进13.5。</p>
    <p><b>满100互助：</b>你帮同学论文最低项；同学帮你的方向见表，加分为帮助者科研向下取整。</p>
    <table class="panel-tip-table rel-help-table"><thead><tr><th>同学</th><th>帮助方式</th></tr></thead><tbody>
    <tr><th>师兄／师姐</th><td>随机一篇的idea</td></tr><tr><th>同门</th><td>随机一篇的一项</td></tr><tr><th>师弟／师妹</th><td>随机一篇的实验</td></tr>
    </tbody></table><p>每次只帮一篇的一项，双方分别结算；没有可修改论文时各保留一次。</p>`),
  detailPage("同学论文", `<p>加入时开新稿，次月开始科研；<b>成功科研后，下月做项目</b>，两者交替。</p>
    <p><b>审稿3个月，等待时每月做项目</b>；中稿当月开始新稿，退稿当月继续修改。</p>
    <p>你帮论文加过分才会署名，成果与引用计入玩家，科研分不计。共同发表<b>默契原始+1，经过档位抵抗，上限20</b>；双方主导的合作论文均可触发。</p>`,
    `<p>先补齐idea、实验、写作，再提升合计分最低项，并列按idea→实验→写作。科研后达到当月参考分即投稿，优先A，其次B、C；未达标继续修改。</p>
    <p>经费与同学金币合计不足时改做横向，下月重新判断最低项并尝试科研。姓名后显示钱包和当月AI，卡片底部记录本月行动。</p>`),
  ANNUAL_RESEARCH_HELP_PAGE,
  directPage("同学学业", `<p>同学按入学年份升年级，同门与你同届；师弟师妹加入时为硕士，毕设辅导固定入学前，指导新生固定第一年。</p>
    <p>初始科研原始增量=年级×2+独立随机0～3，从0逐点抵抗，上限20。</p>
    <p>7、8月不再新增第三年硕士或第六年博士；无合适同届或高年级同学时，合作机会暂存。旧招募确认时对方已离校，则不新增、不扣费。</p>
    <p>每年6月结束时，第二／三年硕士科研分达到2／3先转博，再判定离校。第三年仍为硕士需1分，第六年博士需7分；达标毕业，未达标退学，不设延毕，均移出人际栏，无额外惩罚。</p>
    <p>离开后不再推进新科研或协作，已经投稿的审稿和已产生的论文费用责任保留。第六年不再出现师兄师姐指导。</p>`),
  directPage("同学钱包与AI", `<p>同学初始金币为0，工资与横向结项时所有在组同学均可领取的5%劳务费进入个人钱包。每月生活费1与工资合并结算，加入当月不额外扣费。姓名后显示金币及当月AI，每人每月只订阅一种。</p>
    <p>扣除生活费后，同学钱包用于实验经费不足的差额和购买AI，不承担论文费用。预留1金币生活费和一次实验费用，再用剩余个人金币从GPT、DeepSeek、豆包、Claude中择优订阅，模型按当学年选择。</p>
    <p>AI仅影响同学自己的论文，不改变协作。毕业、退学或停止合作后保留钱包与已有论文费用责任，不再发工资或购买AI。</p>`),
  directPage("长期合作", `<p>同门合作需社交≥6，师兄／师姐指导需科研≥6，指导师弟／师妹需发表过一作论文；抽中但未达标时暂存机会。</p>
    <p>尝试合作／认真指导基础SAN-5；长期合作从次月起<b>每月SAN-1</b>。新增同学受人际容量限制，不额外增加属性或默契。</p>
    <p>⭐标识长期合作，每月协作额外推进1次，每次为实际默契；两次进度合并结算条满互助。不能单独取消，停止合作移除同学时终止。</p>
    <p>人际栏满时，可在点“确定”前关闭事件，去人际栏停止合作腾出位置，再回来确认；结果随空位更新。仍满时招募暂缓，确认不扣费、不新增同学。</p>
    <p>学术交流：同门下次idea+5，师兄／师姐下次idea+8；请师弟／师妹吃饭金币-2、社交+1。合作论文来自实际贡献后的录用。</p>`),
  directPage("恋人初始属性", `<p>恋人有<b>活泼</b>和<b>聪慧</b>两种类型，姓名旁的特质标签显示初始加成；玩耍、学习标签显示当前每月推进值。</p>
    <p>恋人与你同届，初始科研基础=年级×2+独立随机0～3；聪慧额外+3，合并后从0逐点抵抗，上限20。</p>
    <p>初始亲密原始增量=3+独立随机0～3，活泼额外+3；合并后从0逐点抵抗。科研与亲密独立抽取，上限均为20。</p>
    <p>亲密增减经过档位抵抗，四档为初识／亲近／甜蜜／挚爱。抵抗比例与显示规则见“属性与抵抗”。</p>
    <p>恋人与你同届，年级、学位随你同步，卡片按“第X年硕士／博士”显示。每学年末科研自然成长原始+2，经过抵抗，不计入实验室传承；详见年度科研成长。</p>`),
  directPage("恋人约会", `<p>玩耍、学习、购物各有100进度，每月共用一次约会；基础消耗依次为金币-2、SAN-4、金币-3，实际见按钮。</p>
    <p><b>主动推进：</b>玩耍=⌊(亲密+你的社交)/2⌋；学习=⌊(恋人科研+你的科研)/2⌋；购物=⌊亲密/2⌋+10。</p>
    <p><b>每月自动推进：</b>恋爱次月起，玩耍、学习每次各推进⌊亲密/2⌋。活泼每月玩耍2次、学习1次；聪慧每月学习2次、玩耍1次。购物自动推进为0，只靠主动约会。</p>
    <p>每月推进按月初亲密计算。例如亲密7.5，每次推进3，擅长路线共6，另一条共3；本月新增亲密下月才影响自动推进。</p>
    <p>悬浮标签分别显示主动推进、每月自动推进和下次奖励，底部记录恋人本月推进。</p>`),
  detailPage("恋人条满奖励", `<p>玩耍和学习每次满100，亲密原始+1并按三轮循环；购物每次满100获得礼物券和亲密。亲密奖励经过档位抵抗，上限20。</p>`,
    `<p><b>玩耍：</b>①SAN+6；②SAN上限+1；③下个月SAN消耗-1，含事件与审稿等即时损失，不影响固定月耗和恢复。</p>
    <p><b>学习：</b>①论文最低项协作+⌊恋人科研⌋；②论文三项分数永久+1；③科研能力较低者+1，经过抵抗；双方相同不提升。</p>
    <p><b>购物：</b>礼物券+1、亲密原始+2，亲密经过档位抵抗。礼物券优先用于手动商店购买，没有其他可购买项目时才用于自动续费。</p>
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
