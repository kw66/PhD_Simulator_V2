import type { PlayHelpPage, PlayHelpContext } from "./v2-play-help";
import { normalizeShopTab, type ShopTabId } from "./v2-render-shop-panel";
import type { PlayRenderUiState, TalentPanelTabId } from "./v2-render-types";
import { ADVISOR_SALARY, ADVISOR_SALARY_BONUS, MONTHLY_LIVING_COST } from "../core/v2-content";
import { LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD } from "../core/v2-lab-projects";

export const ATTRIBUTE_RESISTANCE_HELP_PAGE: PlayHelpPage = {
  title: "属性与抵抗",
  summary: "",
  body: `<p>科研、社交、导师好感、同学默契和恋人亲密的增减都受档位抵抗。</p>
    <p><b>0／6／12／18档位，抵抗0%／25%／50%／75%。</b>每1点原始变化先按当前档位减免，再处理下一点；不足1点也按比例计算。</p>
    <p>例：科研5增加2点，先到6，再增加0.75，实际到6.75。</p>
    <p><b>界面向下取整数显示，内部保留小数。</b>玩家科研、社交、好感和人际科研、默契、亲密都如此。达到6／12／18才换档，显示为6不代表小数消失。</p>
    <p>默契：生疏／熟悉／合拍／无间。亲密：初识／亲近／甜蜜／挚爱。</p>
    <p>SAN和金币没有档位抵抗。详情中的“原始+1”表示抵抗前的奖励。</p>`,
};

export const SALARY_HELP_PAGE: PlayHelpPage = {
  title: "工资与生活费",
  summary: "",
  body: `<p><b>基本工资：硕士每月${ADVISOR_SALARY.master}金币，博士每月${ADVISOR_SALARY.phd}金币</b>，不随导师职称增加。</p>
    <p>发薪前科研经费≥${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}时，硕士额外+${ADVISOR_SALARY_BONUS.master}、博士额外+${ADVISOR_SALARY_BONUS.phd}。所有人统一按发薪前经费判断，工资由科研经费支付。</p>
    <p>你和在组同学每月生活费各${MONTHLY_LIVING_COST}金币。工资与生活费合并结算后再检查余额，余额为0可继续。</p>
    <p>研0每月家里给${MONTHLY_LIVING_COST}金币、生活费-${MONTHLY_LIVING_COST}，家庭给钱不扣实验室经费；入学后改领工资。同学加入次月起结算，加入当月不额外扣生活费。</p>
    <p>导师卡“学生工资”显示下月预计总支出，悬浮可看各人金额。</p>`,
};

export const ANNUAL_RESEARCH_HELP_PAGE: PlayHelpPage = {
  title: "年度科研成长",
  summary: "",
  body: `<p><b>每学年8月底结算，第一学年就有。</b></p>
    <p>传承原始奖励为科研+⌊n/2⌋。n是科研比自己高的其他实验室成员人数，导师计1人，恋人不计。</p>
    <p>同批按成长前的科研比较，避免先后顺序影响结果。</p>
    <p>同学另有自然成长+2，与传承合并后逐点抵抗，上限20。玩家只获传承，受自身科研上限限制。</p>
    <p>恋人科研自然成长原始+2，经过抵抗，上限20，不参与传承。</p>
    <p>“当前同学累计”只统计目前在组同学的年度实际提升。“本月”栏可回看最近一次年度结果。</p>`,
};

const RESEARCH_PAGES: readonly PlayHelpPage[] = [
  {
    title: "引用流程",
    summary: "<p><b>会议开会或挂arXiv后开始被引；期刊接收后直接开始。</b>引用按月结算，尚未公开时总引用倍率显示0。</p>",
    body: "<p>录用分保留接收时的成绩；当前分决定后续引用。<b>每月引用增长 = 当前分 × 0.05 × 总引用倍率。</b>小数累积满1才增加引用。</p><p>例：当前分10、总倍率1，连续两个月增加1次引用。</p><p>从接收后开始计月，<b>当前分每4个月衰减10%</b>，尚未公开也会衰减；录用分和科研分不变。扣分向上取整，最低0；该月先算引用，再扣分。</p><p>会议录用结果确认时，导师支付每篇一作注册费1金币。3个月后只处理差旅，同学免费代贴。玩家期刊可选自费或导师支付，选定后不能返回重选。费用详情见人际提示。</p>",
  },
  {
    title: "论文推广",
    summary: "<p>每篇一作论文各可推广一次：<b>arXiv提前被引，GitHub提高当前分，小红书和量子位提高倍率。</b></p>",
    body: "<p><b>GitHub：</b>增加当前分的25%（增加量向下取整），录用分不变。</p><p><b>小红书、量子位：</b>录用/推广倍率+0.25，如Oral从×1.5变为×1.75。量子位仅用于期刊论文，金币-5，引用倍率+0.25。</p><p>会议开会前挂arXiv，录用/推广部分先按×1；热度、影响力和其他倍率照常计入。开会后才启用录用与推广加成。</p>",
  },
  {
    title: "引用倍率",
    summary: "<p>热度、影响力、录用类型和推广共同决定引用速度。</p>",
    body: `<p><b>总倍率 = 热度 × 影响力 × 录用/推广倍率 × 其他引用倍率。</b>基础系数0.05不计入显示的总倍率。</p><table class="panel-tip-table citation-factor-table">
      <thead><tr><th scope="col">录用类型</th><th scope="col">基础倍率</th></tr></thead>
      <tbody>
        <tr><th scope="row">Poster / Spotlight</th><td>×1</td></tr>
        <tr><th scope="row">Oral</th><td>×1.5</td></tr>
        <tr><th scope="row">Best Paper / Candidate</th><td>×5</td></tr>
        <tr><th scope="row">期刊</th><td>×1</td></tr>
      </tbody>
    </table>`,
  },
  {
    title: "科研分与统计",
    summary: "<p><b>科研分只算一作</b>，按论文等级累计；当前分衰减不影响科研分。</p>",
    body: "<p>合作论文计入发表数量和引用，可触发合作发表奖励；发表奖励条件见<b>天赋→发表</b>。</p><p>引用、h指数和i10指数均包含一作与非一作成果。h指数是至少h篇论文各被引至少h次的最大h；i10指数是被引至少10次的论文数。年份柱状图显示每年新增引用。</p>",
    expandable: true,
  },
  {
    title: "高被引与发表奖励",
    summary: "<p>发表满12个月后，引用达到<b>发表时热度 × 200</b>可获得🏆ESI高被引标签，显示在题目后。</p>",
    body: "<p>例：发表时热度×0.75需150次引用，×1.50需300次。“同行瞩目”只奖励首篇一作高被引。</p><p>发表天赋每项每局奖励一次；一篇论文可同时完成高被引、发表等级和引用里程碑。首发、高被引、越挫越勇限一作，合作奖励限非一作。</p>",
    expandable: true,
  },
];

const SHOP_PAGES: Record<ShopTabId, readonly PlayHelpPage[]> = {
  ai: [{
    title: "AI订阅",
    summary: "",
    body: "<p><b>订购仅在当月生效</b>，可开启月初自动续费。</p><p>AI模型按学年更新，价格与效果随之变化；<b>更新后需要重新开启自动续费</b>。</p><p>GPT-7和GPT-8均为每月5金币，想idea、做实验、写论文时科研分×1.25，再加固定分。固定加分分别为+7、+8。</p>",
  }],
  rest: [{
    title: "休息设备",
    summary: "",
    body: "<p>办公椅可升级为不同休息路线，<b>选定后不能直接换路线</b>；出售并重新购买后可重新选择。</p><p>吊床使休息效果<b>+3</b>，即休息时恢复SAN+5。</p>",
  }],
  coffee: [{
    title: "咖啡与续费",
    summary: "",
    body: "<p>冰美式可直接购买，<b>SAN+2</b>；购入咖啡机后提升为<b>SAN+3</b>。<b>无需咖啡机即可开启月初自动续费</b>。</p><p>SAN已满时，自动续费当月跳过。金币不足且没有可用于续费的礼物券时，当月暂停续费。</p><p>礼物券优先用于手动购买；没有装备、新购或升级可买时，可用于自动续费。</p>",
  }],
  gear: [{
    title: "装备与季节",
    summary: "",
    body: "<p>显卡和自行车可逐档升级，提升效果。个人显卡与实习的实验减免仅限玩家，不影响同学；算力短缺则使双方实验费用上涨。</p><p>“实验费用”表示每次实验的花费变化，不是个人金币余额变化。</p><p><b>春季（公历3–5月）：</b>SAN消耗-1；<b>夏季（公历6–8月）：</b>SAN消耗+1，遮阳伞可免除。</p><p>季节、疾病与恋人玩耍减耗影响所有即时SAN损失，含事件和审稿人影响；最低0，不影响固定月耗和恢复。</p><p><b>冬季（公历12–2月）：</b>每月SAN-1，羽绒服可免除。</p>",
  }],
};

const TALENT_PAGES: Record<TalentPanelTabId, readonly PlayHelpPage[]> = {
  character: [],
  relation: [
    ATTRIBUTE_RESISTANCE_HELP_PAGE,
    {
      title: "导师晋升与论文合作",
      summary: "<p>天赋结算会记录在<b>事件日志</b>，可回看谁获得了提升。</p>",
      body: "<p><b>导师晋升：</b>3月不限项即申请，按当时科研积累判定：≤目标值80%为0%，线性增至目标值时100%。8月结果确认后，获批经费一次性到账。横向结项经费随职称为50／60／70／80／90／100；再从经费支付玩家和结项时每位在组同学各占总奖励5%的劳务费，无需参与，已离校不领取。</p><p><b>论文合作：</b>一篇论文带两位同学，记2人次合作。每篇合作论文，参与同学默契原始+1，经过档位抵抗，上限20，双方主导均可触发。</p>",
    },
    ANNUAL_RESEARCH_HELP_PAGE,
    SALARY_HELP_PAGE,
    {
      title: "恋人与实习",
      summary: "<p>卡片右上角可切换<b>恋人奖励</b>和<b>实习类型</b>，加深背景标记下一轮奖励。</p>",
      body: "<p><b>恋人：</b>年级、学位随玩家同步，聪慧初始科研额外原始+3。玩耍、学习的三种奖励依次循环；两者条满亲密原始+1，购物条满获得免单券与亲密原始+2，亲密均经过档位抵抗。学习的论文帮助作用于最低项，无合适论文时暂存一次。</p><p><b>每月自动推进：</b>玩耍、学习每次推进⌊亲密/2⌋；活泼每月玩耍2次、学习1次，聪慧反之，购物自动推进为0。按月初亲密计算，本月新增亲密下月才影响自动推进。主动约会另计，公式见人际提示。</p><p><b>免单券：</b>手动购买或升级时自动使用；只有没有装备、新购或升级可买时，才用于自动续费。</p><p><b>大厂实习：</b>线上实习由导师约谈获准，次月起持续3个月；线下实习由论文参会获得邀请，持续6个月。</p>",
    },
    {
      title: "联培与实习收益",
      summary: "<p><b>大牛联培</b>永久提升想idea、写论文分数与科研能力上限；<b>线下实习工资</b>随一作A类论文数量增长。</p>",
      body: "<p><b>联培邀请：</b>社交≥6时，在A/B类论文参会事件中争取大牛合作；科研≥12后累计两次深入合作，可收到邀请。接受后想idea、写论文永久各+5分。</p><p><b>科研上限：</b>保底+1，邀请生成时总引用每满300再+1，合计最多+5。卡片在激活前显示按当前引用估算的奖励，激活后显示已获得的奖励。</p><p><b>线下实习每月工资 = min（1 + 一作A类论文数，6）金币。</b>每月按当前成果重算；0篇时1金币，5篇及以上时6金币。线上实习每月固定1金币。</p>",
    },
  ],
  equip: [],
  growth: [
    {
      title: "游戏熟练",
      summary: "",
      body: "<p>卡片右上角切换三个游戏，次数独立累计，完成第三幕后提升熟练度，下次游玩生效。</p><p><b>泰拉瑞亚／魔塔：</b>基础SAN消耗从4／6开始，每次减少1，最低0；实际消耗还受季节和疾病等影响，基础为0时免消耗。</p><p><b>洛克王国：</b>异色概率从50%开始，每次增加10个百分点，最高100%，没抓到也积累经验。研究生模拟器两版本各50%，分别回复SAN2／3。</p>",
    },
    {
      title: "跑腿熟手",
      summary: "",
      body: "<p>教师节选择发祝福，且导师好感&lt;6时，按卡片概率触发报销跑腿。初始40%，每完成一次增加10个百分点，最高100%。</p><p>普通回复、送礼不增加次数。导师好感≥6时改为50%分享想法、50%普通回复；原有跑腿次数保留。</p>",
    },
  ],
  publication: [
    {
      title: "发表奖励",
      summary: "",
      body: "<p><b>每项每局奖励一次，满足条件自动结算</b>。卡片列出达成条件、奖励和完成状态。</p><p>首发、高被引、越挫越勇限一作；合作奖励限非一作，累计引用包含两者。</p><p>一篇论文可同时完成首发、等级及其他符合条件的天赋。</p>",
    },
  ],
};

const EVENT_PAGES: readonly PlayHelpPage[] = [
  {
    title: "处理事件",
    summary: "",
    body: "<p>从<b>待办事件</b>打开事项，选择后查看结果；到期的阻塞事件须处理完才能进入下一月。</p><p>点击待办事件右上角的⏸️或▶️切换无分支事件阻塞。标有<b>⏩</b>的事件，在下一月自动结算。<b>危险事件不会自动结算，需手动确认。</b></p><p>自动处理按到期顺序推进，<b>优先完成当前事件的后续情节</b>；遇到需要你选择的阻塞事件时暂停。</p><p>已完成事件可从日志回看；论文结果自动处理后，可在日志回看审稿意见、录用决定与天赋奖励。</p>",
  },
  {
    title: "危险选择",
    summary: "",
    body: "<p><b>余额不足的危险事件仍可选择。</b>请先看按钮上的标记。</p><p><b>！</b>：悬浮显示“会暴毙”。<b>？</b>：悬浮显示“可能会暴毙”。危险事件需手动确认，不会自动结算。</p><p>缺少目标、前置条件未满足或本月次数用尽等限制，仍会禁用选项。危险标记不代表这些条件已满足。</p>",
  },
  {
    title: "毕业时间",
    summary: "",
    body: "<p>硕士培养期34个月（第三年6月），博士70个月（第六年6月）；6月可完整操作。</p><p>玩家转博抉择在硕士第二、三年5月出现，申请分别需科研分2／3；与领域年会同月，须分别处理。5月确认转博后，6月起按博士标准发工资。</p><p>未转博仍可完整进行6月；处理完到期事件（含非阻塞结果）后，点击<b>下一月</b>才结算毕业。仍为硕士需科研分≥1，博士需≥7；未达标为延毕。转博成功则继续博士学业，毕业结算不额外推进月份。</p>",
  },
  {
    title: "人际行动记录",
    summary: "",
    body: "<p>关系自动行动按月汇总日志，共同事项集中回看；个人科研、项目、协作和帮助在对应人物卡片查看。条满奖励、论文帮助等里程碑日志仍保留。</p><p>工资、生活费和补贴见人际提示“工资与生活费”。</p><p><b>本月：</b>悬浮查看本月行动、论文帮助及最近一次年度科研的实际变化；成长公式见“年度科研成长”。</p><p>新月份的行动不会覆盖年度成长；同学转博、毕业或退学后，学业记录仍可在日志回看。</p>",
  },
];

export function getSecondaryPlayHelpContext(uiState: PlayRenderUiState): PlayHelpContext {
  switch (uiState.activePlayTab ?? "events") {
    case "research":
      return { key: "research", label: "成果提示", pages: RESEARCH_PAGES };
    case "shop": {
      const tab = normalizeShopTab(uiState.activeShopTab);
      return { key: `shop:${tab}`, label: "商店提示", pages: SHOP_PAGES[tab] };
    }
    case "talent": {
      const tab = uiState.activeTalentTab ?? "character";
      return { key: `talent:${tab}`, label: "天赋提示", pages: TALENT_PAGES[tab] ?? TALENT_PAGES.character };
    }
    case "settings":
      return { key: "settings", label: "设置提示", pages: [] };
    default:
      return { key: "events", label: "事件提示", pages: EVENT_PAGES };
  }
}
