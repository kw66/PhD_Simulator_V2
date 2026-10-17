import type { PlayHelpPage, PlayHelpContext } from "./v2-play-help";
import { normalizeShopTab, type ShopTabId } from "./v2-render-shop-panel";
import type { PlayRenderUiState, TalentPanelTabId } from "./v2-render-types";
import { ADVISOR_SALARY, ADVISOR_SALARY_BONUS, MONTHLY_LIVING_COST } from "../core/v2-content";
import { LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD } from "../core/v2-lab-projects";
import { ADVISOR_GRANTS } from "../core/v2-advisor-progress";

export const ATTRIBUTE_RESISTANCE_HELP_PAGE: PlayHelpPage = {
  title: "属性与抵抗",
  summary: "",
  body: `<p>科研、社交、导师好感、同学默契和恋人亲密的增减都受档位抵抗。</p>
    <p>0／6／12／18档位分别抵抗<b>0%／20%／40%／60%</b>。每1点原始变化先按当前档位减免，再处理下一点；不足1点也按比例计算。</p>
    <p>例：科研5增加2点，先到6，再增加0.8，实际到6.8。</p>
    <p>属性显示至多两位小数，计算使用实际数值；SAN和金币没有档位抵抗。</p>`,
};

export const SALARY_HELP_PAGE: PlayHelpPage = {
  title: "工资与生活费",
  summary: "",
  body: `<p>基本工资：硕士每月<b>${ADVISOR_SALARY.master}</b>金币，博士每月<b>${ADVISOR_SALARY.phd}</b>金币，不随导师职称增加。</p>
    <p>发薪前科研经费≥${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}时，硕士额外+${ADVISOR_SALARY_BONUS.master}、博士额外+${ADVISOR_SALARY_BONUS.phd}；所有人按发薪前经费判断。</p>
    <p>你和在组同学每月生活费各${MONTHLY_LIVING_COST}金币，工资与生活费合并结算后再检查余额。</p>
    <p>大四不领工资，每月家里给${MONTHLY_LIVING_COST}金币，正好抵生活费，不扣经费。同学加入次月起结算。</p>`,
};

export const ANNUAL_RESEARCH_HELP_PAGE: PlayHelpPage = {
  title: "年度科研成长",
  summary: "",
  body: `<p>每学年<b>8月底</b>结算，第一学年就有。</p>
    <p>传承原始奖励为科研+⌊n/2⌋。n是科研比自己高的其他实验室成员人数，导师计1人，恋人不计。</p>
    <p>同批按成长前的科研比较，避免先后顺序影响结果。</p>
    <p>同学另有自然成长+2，与传承合并后逐点抵抗，上限20。玩家只获传承，受自身科研上限限制。</p>
    <p>恋人科研自然成长原始+2，经过抵抗，上限20，不参与传承。</p>
    <p>每学年8月底还按你的社交档位给每位在组同学默契原始+0/1/2/3；你按在组同学人数获得社交原始+⌊人数/2⌋。两项分别按获得者的当前属性档位抵抗，上限20。</p>`,
};

const RESEARCH_PAGES: readonly PlayHelpPage[] = [
  {
    title: "引用流程",
    summary: "<p>会议论文在开会、挂arXiv或VALSE展示海报后开始被引；期刊接收后直接开始。未公开时引用倍率为0。</p>",
    body: "<p>每月引用增长 = 当前分 × 0.05 × 总引用倍率，小数累积满1才增加引用。总倍率由热度、影响力、录用类型和推广等相乘得到，0.05不计入面板倍率。</p><p>接收后当前分每4个月衰减10%，未公开也衰减；先算引用再扣分，扣分向上取整，最低0。录用分和科研分不变。</p>",
  },
  {
    title: "论文推广",
    summary: "<p>推广尚未公开的会议论文时，加成先保留；论文公开后才开始被引。</p>",
    body: "<p>GitHub增加的是当前分，录用分不变。VALSE海报自动选择已录用的一作A类论文中当前分最高的一篇。</p><p>原会议的Oral／Best加成仍等该会议举办后生效。</p>",
  },
  {
    title: "科研分与统计",
    summary: "<p>科研分只计一作，按录用等级累加；发表后当前分衰减不会扣回科研分。</p>",
    body: "<p>合作论文仍计入发表数与引用，也可触发合作发表奖励。h指数和i10指数均包含一作与非一作。</p>",
    expandable: true,
  },
  {
    title: "ESI高被引",
    summary: "",
    body: "<p>发表满12个月后，引用达到发表时热度×200可获得ESI高被引；后续热度变化不会改变门槛。发表奖励条件见天赋→发表。</p>",
  },
];

const SHOP_PAGES: Record<ShopTabId, readonly PlayHelpPage[]> = {
  ai: [{
    title: "AI订阅",
    summary: "",
    body: "<p>单次购买只覆盖当月；开启自动续费后会逐月续订。模型按学年更新时，原有自动续费不会沿用，需要重新开启。</p>",
  }],
  rest: [{
    title: "休息用品",
    summary: "",
    body: "<p>办公椅的升级路线选定后不能直接改选；出售并重新购买后可重新选择。</p>",
  }],
  life: [{
    title: "生活用品",
    summary: "",
    body: "<p>季节、疾病与恋人玩耍的减耗共同作用于即时SAN损失，事件和审稿人影响也包括在内；最低为0，不影响固定月耗或恢复。</p>",
  }],
  coffee: [{
    title: "咖啡与续费",
    summary: "",
    body: "<p>无需咖啡机也能自动续费。SAN已满时当月跳过；金币不足且没有可用礼物券时，当月暂停。</p><p>礼物券优先用于手动购买；没有装备或升级可买时，才可用于自动续费。</p>",
  }],
  gear: [{
    title: "科研设备",
    summary: "",
    body: "<p>显卡只为你的实验减费，<b>不替同学减费</b>；实习减免可以与显卡叠加。详细结算见科研提示。</p>",
  }],
};

const TALENT_PAGES: Record<TalentPanelTabId, readonly PlayHelpPage[]> = {
  character: [],
  relation: [
    {
      title: "导师晋升",
      summary: "",
      body: "<p>横向结项时，你和当时在组的同学各领结项经费5%的劳务费，由科研经费支出。</p><p>组会与团建的导师到场率初始60%，每次晋升下降10个百分点。</p>",
    },
    {
      title: "基金申请",
      summary: "<p>有名额时优先申请稳获批的最高新项目，否则申请下一档。</p>",
      body: `<p class="play-help-grant-thresholds"><span class="play-help-grant-thresholds-label">申请门槛（科研积累）</span>
          ${ADVISOR_GRANTS.filter(grant => grant.id !== "academician").map(grant => `<span>${grant.name} <b>${grant.threshold}</b></span>`).join("")}</p>
        <p>科研积累不超过申请门槛80%时获批率为0，之后线性升至门槛时100%；申请不扣积累。</p>
        <p>讲师限1项，晋升后2项，到期释放名额。</p>
        <p>院士需先获杰青，积累1000稳获批，沿用上述概率。</p>`,
    },
    {
      title: "关系天赋",
      summary: "",
      body: "<p>论文合作按参与人次计数，一篇带两位同学记2人次。实验室传承统计的是目前在组同学的年度实际提升。</p><p>属性抵抗与年度成长规则见人际提示。</p>",
    },
    {
      title: "大厂实习",
      summary: "",
      body: "<p>公司与大致方向在邀请第二幕确定，具体岗位和待遇在第三幕确定；公司名称不决定工资。月薪每月按当时已发表的一作A类论文篇数重新计算，最高6金币。</p><p>邀请条件见人际提示。</p>",
    },
    {
      title: "远程实习",
      summary: "",
      body: "<p>获准后从次月起持续3个月。每月固定SAN消耗与即时行动消耗分开结算。</p>",
    },
    {
      title: "大牛联培",
      summary: "",
      body: "<p>联培增益在第三幕按具体团队的投入程度确定；科研上限加成使用邀请时的总引用计算，接受时不重算。想idea和写论文获得同一档位的永久加分。</p><p>奖励在结果页确认后发放一次。邀请条件见人际提示。</p>",
    },
  ],
  equip: [],
  growth: [
    {
      title: "游戏熟练",
      summary: "",
      body: "<p>三个游戏的熟练度分别累计，完成第三幕后提升，下次游玩才生效。</p><p>洛克王国没抓到异色也会积累经验；游戏的基础SAN消耗为0时，季节和疾病不会重新加收。</p>",
    },
    {
      title: "论文熟手",
      summary: "",
      body: "<p>每发表一篇玩家一作论文，依次获得永久想idea、做实验、写论文+1分，三项循环累加。会议、期刊和赠送的一作论文均计入，非一作不计入，同一篇只奖励一次。</p><p>增加的是之后科研操作的分数，不直接修改已有论文。成长卡显示本局累计加成与下一篇的奖励。</p>",
    },
  ],
  publication: [
    {
      title: "发表奖励",
      summary: "",
      body: "<p>每项奖励每局只结算一次；同一篇论文可以同时满足多项条件。</p><p>累计引用包含一作和合作论文，具体达成条件与奖励见卡片。</p>",
    },
  ],
};

const EVENT_PAGES: readonly PlayHelpPage[] = [
  {
    title: "处理事件",
    summary: "<p>自动处理按到期顺序推进，会先完成当前事件的后续情节。</p>",
    body: "<p>遇到需要玩家选择的阻塞事件时会暂停；危险事件无论是否开启自动处理，都必须手动确认。</p><p>论文结果自动处理后，审稿意见与奖励仍保留在日志中。</p>",
    expandable: true,
  },
  {
    title: "危险选择",
    summary: "<p>危险预警只检查本次结算，不预测下月支出。</p>",
    body: "<p>余额不足的危险选项仍可选择；缺少目标、前置条件未满足或次数用尽的选项则会禁用。</p>",
    expandable: true,
  },
  {
    title: "毕业时间",
    summary: "<p>毕业学年6月仍可行动；处理完到期事件后，下一月才检查毕业条件。</p>",
    body: "<p>毕业检查要求科研分与盲审同时达标；6月的“下一月”会结算毕业，不额外推进月份。</p>",
    expandable: true,
  },
  {
    title: "转博与毕业准备",
    summary: "<p>转博确认后清除硕士阶段的毕业论文、找工作进度、已获 offer 和盲审结果。</p>",
    body: "<p>即使硕士盲审未通过，5月仍可申请转博；确认后从6月起按博士标准发工资。</p>",
    expandable: true,
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
