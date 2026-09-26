import type { PlayHelpPage, PlayHelpContext } from "./v2-play-help";
import { normalizeShopTab, type ShopTabId } from "./v2-render-shop-panel";
import type { PlayRenderUiState, TalentPanelTabId } from "./v2-render-types";

const RESEARCH_PAGES: readonly PlayHelpPage[] = [
  {
    title: "引用流程",
    summary: "<p><b>会议开会或挂arXiv后开始被引；期刊接收后直接开始。</b>引用按月结算，尚未公开时总引用倍率显示0。</p>",
    body: "<p>录用分保留接收时的成绩；当前分初始等于录用分，决定后续引用。当前分越高，引用增长越快，小数留到下月，累积满1才增加引用。</p><p><b>每月引用增长 = 当前分 × 0.05 × 总引用倍率。</b>例：当前分10、总倍率1，每月积累0.5，连续两个月增加1次引用。</p>",
  },
  {
    title: "引用衰减",
    summary: "<p>从接收后开始计月，<b>当前分每4个月衰减10%</b>，尚未公开也会衰减；录用分和科研分不变。</p>",
    body: "<p>每次扣分 = 当前分 × 10%，<b>向上取整</b>，扣后最低0；该月先算引用，再扣分。例：当前分101扣11分，剩90分。</p>",
    expandable: true,
  },
  {
    title: "引用倍率与推广",
    summary: "<p>热度、影响力、录用类型和推广共同决定引用速度。</p>",
    body: `<p><b>总倍率 = 热度 × 影响力 × 录用/推广倍率 × 其他引用倍率。</b>基础系数0.05不计入显示的总倍率。</p><p>会议开会前挂arXiv，录用/推广部分先按×1；热度、影响力和其他倍率照常计入。开会后才启用录用与推广加成。</p><table class="panel-tip-table citation-factor-table">
      <thead><tr><th scope="col">录用类型</th><th scope="col">基础倍率</th></tr></thead>
      <tbody>
        <tr><th scope="row">Poster / Spotlight</th><td>×1</td></tr>
        <tr><th scope="row">Oral</th><td>×1.5</td></tr>
        <tr><th scope="row">Best Paper / Candidate</th><td>×5</td></tr>
        <tr><th scope="row">期刊</th><td>×1</td></tr>
      </tbody>
    </table><p>每篇一作论文各可推广一次：<b>arXiv提前被引，GitHub提高当前分，小红书和量子位提高倍率。</b>量子位仅用于期刊论文，金币-5，引用倍率+0.25；GitHub增加当前分的25%（增加量向下取整），录用分不变；小红书和量子位均使录用/推广倍率+0.25，如Oral从×1.5变为×1.75。</p>`,
    expandable: true,
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
    body: "<p><b>订购仅在当月生效</b>，可开启月初自动续费。</p><p>AI模型按学年更新，价格与效果随之变化；<b>更新后需要重新开启自动续费</b>。</p><p>GPT-7和GPT-8均为每月5金币，想idea、做实验、写论文的基础分×1.25，再加固定分。固定加分分别为+7、+8。</p>",
  }],
  rest: [{
    title: "休息设备",
    summary: "",
    body: "<p>办公椅可升级为不同休息路线，<b>选定后不能直接换路线</b>；出售并重新购买后可重新选择。</p><p>吊床将休息收益从<b>SAN+2提升为SAN+5</b>。</p>",
  }],
  coffee: [{
    title: "咖啡与续费",
    summary: "",
    body: "<p>冰美式可直接购买，<b>SAN+2</b>；购入咖啡机后提升为<b>SAN+3</b>。<b>无需咖啡机即可开启月初自动续费</b>。</p><p>SAN已满时，自动续费当月跳过。金币不足且没有可用于续费的礼物券时，当月暂停续费。</p><p>礼物券优先用于手动购买；没有装备、新购或升级可买时，可用于自动续费。</p>",
  }],
  gear: [{
    title: "装备与季节",
    summary: "",
    body: "<p>显卡和自行车可逐档升级，提升效果。</p><p><b>春季（公历3–5月）：</b>SAN消耗-1；<b>夏季（公历6–8月）：</b>SAN消耗+1，遮阳伞可免除。</p><p>季节、疾病与恋人玩耍减耗影响所有即时SAN损失，含事件和审稿人影响；最低0，不影响固定月耗和恢复。</p><p><b>冬季（公历12–2月）：</b>每月SAN-1，羽绒服可免除。</p>",
  }],
};

const TALENT_PAGES: Record<TalentPanelTabId, readonly PlayHelpPage[]> = {
  character: [],
  relation: [],
  equip: [],
  growth: [],
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
    body: "<p>从<b>待办事件</b>打开事项，选择后查看结果；到期的阻塞事件须处理完才能进入下一月。</p><p>多幕事件按页面提示了解情况、作出选择，再查看最终结果。</p><p>已完成事件可从日志回看。点击待办事件右上角的⏸️或▶️切换无分支事件阻塞；不阻塞时，下一月自动结算到期的无分支事件。</p>",
  },
  {
    title: "事件自动推进",
    summary: "",
    body: "<p>标有<b>⏩</b>的事件可自动处理。有分支的事件排在前面，<b>先处理完到期的阻塞事件</b>，才能点击下一月。</p><p>自动处理按到期顺序推进，<b>优先完成当前事件的后续情节</b>；遇到需要你选择的阻塞事件时暂停。</p><p>论文结果自动处理后，可在日志回看审稿意见、录用决定与天赋奖励。</p>",
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
