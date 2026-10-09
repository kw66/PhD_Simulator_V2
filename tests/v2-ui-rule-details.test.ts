import { describe, expect, it, vi } from "vitest";

import { renderApp } from "../src/app/v2-render";
import { getPlayHelpContext, renderPlayHelpPanel } from "../src/app/v2-play-help";
import type { PlayRenderUiState } from "../src/app/v2-render-types";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { applyResearchOperation, previewResearchOperation } from "../src/core/v2-research-operation";
import type { Buff, GameState, Paper } from "../src/core/v2-types";

function getHelpText(uiState: PlayRenderUiState): string {
  return getPlayHelpContext(uiState).pages.map((page) => page.summary + page.body).join("\n")
    .replace(/<[^>]*>/g, "").replace(/\s+/g, "").replace(/／/g, "/");
}

function getHelpPageText(uiState: PlayRenderUiState, title: string): string {
  const page = getPlayHelpContext(uiState).pages.find((entry) => entry.title === title);
  expect(page, title).toBeDefined();
  return (page!.summary + page!.body).replace(/<[^>]*>/g, "").replace(/\s+/g, "").replace(/／/g, "/");
}

function createResearchState(): GameState {
  const state = createStartedGameState("normal");
  const paper = createDraftPaper(1, 0, () => 0);
  return {
    ...state,
    totalMonths: 1,
    month: 1,
    eventQueue: [],
    buffs: [],
    player: { ...state.player, research: 4, san: 20 },
    papers: [paper],
    selectedPaperId: paper.id,
  };
}

function createBuff(id: string, effects: Partial<Buff>): Buff {
  return { id, name: id, source: "测试", timing: "permanent", remainingMonths: null, ...effects };
}

function renderMetrics(paper: Paper): string {
  const state = createResearchState();
  const html = renderApp({ ...state, papers: [paper] }, createDefaultAccountProfile(), { activePlayTab: "research" })
    .replace(/<span class="animated-number" data-animate-key="[^"]*" data-animate-number="[^"]*">([^<]*)<\/span>/g, "$1")
    .replace(/ data-animate-(?:key|number|bar)="[^"]*"/g, "");
  return html.split('<div class="research-metric-grid research-metric-grid-expanded">')[1]?.split('</section>')[0] ?? "";
}

describe("v2 research rule details and publication metrics", () => {
  it.each([
    { activePlayTab: "relationship" },
    { activePlayTab: "talent", activeTalentTab: "relation" },
  ] as const)("gives resistance, annual growth and wages separate concise pages in $activePlayTab", (uiState) => {
    const context = getPlayHelpContext(uiState);
    for (const title of ["属性与抵抗", "年度科研成长", "工资与生活费"]) {
      const matches = context.pages.filter((page) => page.title === title);
      expect(matches).toHaveLength(1);
      const text = getHelpPageText(uiState, title);
      expect(text.length).toBeLessThanOrEqual(360);
      expect(text).not.toMatch(/快照|state\.|profile\.|去重|结算顺序/);
      const index = context.pages.indexOf(matches[0]!);
      const panel = renderPlayHelpPanel({ ...uiState, helpPageByContext: { [context.key]: index } });
      expect(panel).toContain(`data-help-page-index="${index}"`);
      expect(panel).toContain(matches[0]!.body);
    }
    expect(getHelpPageText(uiState, "年度科研成长")).not.toMatch(/工资|0%\/25%/);
    expect(getHelpPageText(uiState, "工资与生活费")).not.toMatch(/科研\+⌊n\/2⌋|抵抗/);
  });

  it("explains fatal and risky choices without treating missing prerequisites as affordable risks", () => {
    const events = { activePlayTab: "events" } as const;
    const help = getHelpPageText(events, "危险选择");
    expect(help).toContain("余额不足的危险事件仍可选择");
    expect(help).toContain("！：本次结算必定导致失败");
    expect(help).toContain("？：部分随机结果可能导致失败");
    expect(help).toContain("不足的具体原因和预计结算值");
    expect(help).not.toMatch(/确定死|可能死/);
    expect(help).toContain("缺少目标、前置条件未满足或本月次数用尽等限制，仍会禁用选项");
    expect(getHelpPageText(events, "处理事件")).toContain("危险事件不会自动结算，需手动确认");
  });

  it("points players to current lover reward controls and the shop gift notice", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("悬浮标签分别显示主动推进、每月自动推进和下次奖励");
    expect(help).toContain("底部记录恋人本月推进");
    expect(help).toContain("礼物券优先用于手动商店购买");
  });

  it("describes active publication and event mechanics without development history or repeated reward exclusions", () => {
    const publication = getHelpText({ activePlayTab: "talent", activeTalentTab: "publication" });
    expect(publication).toContain("每项每局奖励一次，满足条件自动结算");
    expect(publication).toContain("首发、高被引、越挫越勇限一作；合作奖励限非一作，累计引用包含两者");
    expect(publication).toContain("一篇论文可同时完成首发、等级及其他符合条件的天赋");
    expect(publication).not.toMatch(/不重复发奖|重复发表不额外奖励SAN或好感/);
    const events = getHelpText({ activePlayTab: "events" });
    expect(events).toContain("到期的阻塞事件须处理完才能进入下一月");
    expect(events).toContain("点击待办事件右上角的⏸️或▶️切换无分支事件阻塞");
    expect(events).toContain("优先完成当前事件的后续情节");
    expect(events).toContain("遇到需要你选择的阻塞事件时暂停");
    expect(events).toContain("论文结果自动处理后，可在日志回看审稿意见、录用决定与天赋奖励");
    const contexts: PlayRenderUiState[] = [
      { activePlayTab: "workstation" }, { activePlayTab: "relationship" }, { activePlayTab: "research" },
      { activePlayTab: "events" }, { activePlayTab: "settings" },
      ...(["ai", "coffee", "gear", "rest"] as const).map((activeShopTab) => ({ activePlayTab: "shop" as const, activeShopTab })),
      ...(["character", "relation", "equip", "growth", "publication"] as const).map((activeTalentTab) => ({ activePlayTab: "talent" as const, activeTalentTab })),
    ];
    for (const context of contexts) {
      expect(getHelpText(context)).not.toMatch(/旧版|新版|实现细节|走同一事件流程|仅同学自主科研间隔|三项合计分快照/);
    }
  });

  it("documents lover route formulas, passive gains and the shared monthly date limit", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("玩耍、学习、购物各有100进度，每月共用一次约会");
    expect(help).toContain("基础消耗依次为金币-2、SAN-4、金币-3，实际见按钮");
    expect(help).toContain("科研与亲密独立抽取，上限均为20");
    expect(help).toContain("玩耍=⌊(亲密+你的社交)/2⌋");
    expect(help).toContain("学习=⌊(恋人科研+你的科研)/2⌋");
    expect(help).toContain("购物=⌊亲密/2⌋+10");
    expect(help).toContain("玩耍、学习每次各推进⌊亲密/2⌋");
    expect(help).toContain("活泼每月玩耍2次、学习1次；聪慧每月学习2次、玩耍1次");
    expect(help).toContain("购物自动推进为0，只靠主动约会");
    expect(help).toContain("每月推进按月初亲密计算");
    expect(help).toContain("本月新增亲密下月才影响自动推进");
    expect(help).toContain("亲密7.5，每次推进3，擅长路线共6，另一条共3");
    expect(help).toContain("恋爱次月起");
    expect(help).toContain("恋人有活泼和聪慧两种类型");
    expect(help).toContain("恋人与你同届，初始科研基础=年级×2+独立随机0～3；聪慧额外+3，合并后从0逐点抵抗，上限20");
    expect(help).toContain("初始亲密原始增量=3+独立随机0～3，活泼额外+3；合并后从0逐点抵抗");
    expect(help).toContain("亲密增减经过档位抵抗，四档为初识/亲近/甜蜜/挚爱");
    expect(help).toContain("恋人科研自然成长原始+2，经过抵抗，上限20，不参与传承");
    expect(help).toContain("年级、学位随你同步");
    expect(help).not.toMatch(/科研3～6|科研9～12|亲密9～12/);
    expect(help).not.toMatch(/没有一次性奖励|不再每月自动扣费|固定每月金币奖励/);
  });

  it("explains separate three-cycle lover rewards and gift purchase priority", () => {
    const context = getPlayHelpContext({ activePlayTab: "relationship" });
    const pages = context.pages.filter((page) => page.title.startsWith("恋人"));
    expect(pages).toHaveLength(3);
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("SAN+6");
    expect(help).toContain("论文三项分数永久+1");
    expect(help).toContain("下个月SAN消耗-1，含事件与审稿等即时损失，不影响固定月耗和恢复");
    expect(help).toContain("礼物券+1、亲密原始+2，亲密经过档位抵抗");
    expect(help).toContain("亲密原始+1并按三轮循环");
    expect(help).toContain("亲密奖励经过档位抵抗，上限20");
    expect(help).toContain("没有其他可购买项目时才用于自动续费");
  });

  it("explains alternating fellow research, monthly review work and experiment retries", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("次月开始科研；成功科研后，下月做项目");
    expect(help).toContain("等待时每月做项目");
    expect(help).toContain("中稿当月开始新稿，退稿当月继续修改");
    expect(help).toContain("不足时改做横向，下月重新判断最低项并尝试科研");
    expect(help).not.toContain("按卡片顺序扣经费");
    expect(help).toContain("审稿3个月");
    expect(help).not.toContain("仅同学自主科研间隔2个月");
    expect(help).toContain("每位同学每月可主动协作一次");
    expect(help).toContain("每月自动推进=默契，长期合作每月推进2次");
    expect(help).toContain("每学年8月底结算，第一学年就有");
    expect(help).toContain("同学另有自然成长+2，与传承合并后逐点抵抗，上限20");
    expect(help).toContain("玩家只获传承，受自身科研上限限制");
    expect(help).toContain("初始科研原始增量=年级×2+独立随机0～3，从0逐点抵抗，上限20");
    expect(help).toContain("自动协作使用实际默契，保留小数");
    expect(help).toContain("默契6.75，普通合作每月推进6.75，长期合作推进13.5");
    expect(help).toContain("导师计1人，恋人不计");
    expect(help).not.toMatch(/发表积累|累计一作|每学年9月/);
    expect(help).toContain("双方主导的合作论文均可触发");
    expect(help).toContain("主动推进=⌊你的实际科研+随机0～5⌋，最终向下取整");
    expect(help).toContain("默契：生疏/熟悉/合拍/无间");
    expect(help).toContain("你帮同学论文最低项");
    expect(help).toContain("加分为帮助者科研向下取整");
    expect(help).not.toMatch(/自动推进=⌊默契⌋|每次为⌊默契⌋/);
  });

  it("keeps talent inheritance help aligned with the shared August settlement", () => {
    const help = getHelpPageText({ activePlayTab: "talent", activeTalentTab: "relation" }, "年度科研成长");
    expect(help).toBe(getHelpPageText({ activePlayTab: "relationship" }, "年度科研成长"));
    expect(help).toContain("每学年8月底结算，第一学年就有");
    expect(help).toContain("传承原始奖励为科研+⌊n/2⌋");
    expect(help).toContain("n是科研比自己高的其他实验室成员人数，导师计1人，恋人不计");
    expect(help).toContain("同批按成长前的科研比较，避免先后顺序影响结果");
    expect(help).toContain("同学另有自然成长+2，与传承合并后逐点抵抗，上限20");
    expect(help).toContain("玩家只获传承，受自身科研上限限制");
    expect(help).toContain("恋人科研自然成长原始+2，经过抵抗，上限20，不参与传承");
    expect(help).toContain("只统计目前在组同学的年度实际提升");
    expect(help).not.toMatch(/发薪|快照|每学年9月/);
  });

  it("explains playable June and player graduation after events and transfer decisions", () => {
    const help = getHelpText({ activePlayTab: "events" });
    expect(help).toContain("硕士培养期34个月（第三年6月），博士70个月（第六年6月）");
    expect(help).toContain("6月可完整操作");
    expect(help).toContain("玩家转博抉择在硕士第二、三年5月出现，申请分别需科研分2/3");
    expect(help).not.toContain("内部第9月");
    expect(help).toContain("与领域年会同月，须分别处理");
    expect(help).toContain("5月确认转博后，6月起按博士标准发工资");
    expect(help).toContain("未转博仍可完整进行6月；处理完到期事件（含非阻塞结果）后，点击下一月才结算毕业");
    expect(help).toContain("仍为硕士需科研分≥1，博士需≥7；未达标为延毕");
    expect(help).toContain("转博成功则继续博士学业，毕业结算不额外推进月份");
    const fellows = getHelpText({ activePlayTab: "relationship" });
    expect(fellows).toContain("每年6月结束时，第二/三年硕士科研分达到2/3先转博，再判定离校");
    expect(fellows).toContain("第三年仍为硕士需1分，第六年博士需7分");
    expect(fellows).toContain("达标毕业，未达标退学，不设延毕");
  });

  it("explains the player's three-stage journal payment and automatic fellow OA funding", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("PAMI/NMI/Nature的OA版面费分别5/10/20");
    expect(help).toContain("玩家一作发表后进入期刊中稿→缴费方式→缴费确认三幕事件");
    expect(help).toContain("可选自费或导师经费，最终确认时才扣款");
    expect(help).toContain("选定后不能返回重选");
    expect(help).toContain("余额不足也可选择，请留意按钮的危险标记");
    expect(help).toContain("同学一作期刊仍在发表时自动扣科研经费，不扣同学钱包");
    expect(help).not.toMatch(/不生成期刊缴费待办|玩家与同学一作均在发表时立即自动扣/);
    const workstation = getHelpText({ activePlayTab: "workstation" });
    expect(workstation).toContain("PAMI/NMI/Nature的OA版面费分别5/10/20");
    expect(workstation).toContain("期刊中稿→缴费方式→缴费确认");
    expect(workstation).toContain("可选自费或导师经费，最终确认时扣款");
  });

  it("separates early attendance payment from meeting-month activities and citation boosts", () => {
    const help = getHelpPageText({ activePlayTab: "relationship" }, "会议费用");
    expect(help).toContain("录用结果确认时，每篇一作注册费1金币，由导师经费支付");
    expect(help).toContain("玩家与同学相同，3个月后不再扣注册费");
    expect(help).toContain("确认录用结果后立即出现“会议名参会”，同届论文合并处理");
    expect(help).toContain("开会月固定为录用结果生成后第3个月，延后确认不顺延");
    expect(help).toContain("可提前1～3个月完成参会决定，最迟在开会月完成");
    expect(help).toContain("差旅在参会决定最终确认时支付");
    expect(help).toContain("亲自参会确认后，未来待办显示“会议名活动”");
    expect(help).toContain("到开会月才开放会场活动与论文展示");
    expect(help).toContain("提前付款不会提前公开论文");
    expect(help).toContain("挂arXiv或在VALSE展示海报可提前被引");
    expect(help).toContain("国内/亚太/欧美为2/4/6金币");
    expect(help).toContain("自费只扣个人金币；导师报销扣同额经费，好感基础消耗1/2/3，经过抵抗");
    expect(help).toContain("会外联系人代参加免费，不扣差旅或好感，也不进入参会活动");
    expect(help).toContain("同学默认免费代贴，无差旅");
    expect(help).toContain("领域年会VALSE免注册费，不论有无论文均只需差旅2");
    expect(help).toContain("到场后的活动名为“VALSE活动”");
    expect(help).not.toContain("VALSE参会");
    expect(help).not.toMatch(/同学中同一届会议则免费|否则个人金币-1|只收一次差旅|全部自费/);
    const research = getHelpText({ activePlayTab: "research" });
    expect(research).toContain("会议录用结果确认时，导师支付每篇一作注册费1金币");
    expect(research).toContain("随后即可决定参会并确认支付差旅，找人代贴免费");
    expect(research).toContain("提前付款不会提前公开论文");
    expect(research).toContain("玩家期刊可选自费或导师支付，选定后不能返回重选");
  });

  it.each([
    { activePlayTab: "relationship" },
    { activePlayTab: "talent", activeTalentTab: "relation" },
  ] as const)("explains deterministic fractional resistance in $activePlayTab help", (uiState) => {
    const help = getHelpPageText(uiState, "属性与抵抗");
    expect(help).toContain("科研、社交、导师好感、同学默契和恋人亲密的增减都受档位抵抗");
    expect(help).toContain("0/6/12/18档位，抵抗0%/25%/50%/75%");
    expect(help).toContain("每1点原始变化先按当前档位减免，再处理下一点");
    expect(help).toContain("不足1点也按比例计算");
    expect(help).toContain("科研5增加2点，先到6，再增加0.75，实际到6.75");
    expect(help).toContain("属性显示至多两位小数，计算使用实际数值");
    expect(help).toContain("玩家科研、社交、好感和人际科研、默契、亲密都如此");
    expect(help).not.toMatch(/概率无效|快照|科研.*随机失效/);
  });

  it("explains actual wages, fellow AI reserves and zero-funding survival", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("基本工资：硕士每月1金币，博士每月2.5金币");
    expect(help).toContain("发薪前科研经费≥60时，硕士额外+0.5、博士额外+1");
    expect(help).toContain("所有人统一按发薪前经费判断");
    expect(help).toContain("不随导师职称增加");
    expect(help).toContain("工资与生活费合并结算后再检查余额");
    expect(help).toContain("加入当月不额外扣生活费");
    expect(help).toContain("研0每月家里给1金币、生活费-1");
    expect(help).toContain("家庭给钱不扣实验室经费；入学后改领工资");
    expect(help).toContain("经费为0仍可继续，低于0才破产");
    expect(help).toContain("导师经费”使用实验室经费");
    expect(help).toContain("领取时扣同额经费");
    expect(help).toContain("获批当月一次");
    expect(help).toContain("未使用月底失效");
    expect(help).toContain("同学初始金币为0");
    expect(help).toContain("扣除生活费后，同学钱包用于实验经费不足的差额和购买AI，不承担论文费用");
    expect(help).toContain("预留1金币生活费和一次实验费用，再用剩余个人金币");
    expect(help).toContain("工资与横向结项时所有在组同学均可领取的5%劳务费进入个人钱包");
    expect(help).toContain("毕业、退学或停止合作后保留钱包与已有论文费用责任");
    expect(help).toContain("GPT、DeepSeek、豆包、Claude中择优订阅");
    expect(help).toContain("AI仅影响同学自己的论文，不改变协作");
    expect(help).toContain("不再发工资或购买AI");
    expect(help).not.toMatch(/报销预留|小数累计|经费净增55|经费≤0|下月加薪|每级\+|金额四舍五入/);
  });

  it("points to separate monthly actions, annual results and academic logs", () => {
    const events = getHelpText({ activePlayTab: "events" });
    expect(events).toContain("关系自动行动按月汇总日志");
    expect(events).toContain("个人科研、项目、协作和帮助在对应人物卡片查看");
    expect(events).toContain("同学转博、毕业或退学后，学业记录仍可在日志回看");
    expect(events).toContain("工资、生活费和补贴见人际提示“工资与生活费”");
    expect(events).not.toContain("基本工资硕士");
    for (const ui of [{ activePlayTab: "relationship" }, { activePlayTab: "talent", activeTalentTab: "relation" }] as const) {
      const help = getHelpText(ui);
      expect(help).toContain("“本月”栏可回看最近一次年度结果");
      expect(help).toContain("“当前同学累计”只统计目前在组同学的年度实际提升");
    }
  });

  it("documents mentor funding, paper contributions and the annual grant timeline", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("你和同学发表论文，按科研分提升导师科研积累");
    expect(help).toContain("同一篇只增加一次，恋人论文不计");
    expect(help).toContain("项目进度满100才结算");
    expect(help).toContain("对应进度+100。满条奖励单独记入项目完成日志");
    expect(help).toContain("横向基础SAN-8、纵向基础SAN-6，享受科研档位减免");
    expect(help).toContain("横向按导师职称获得50/60/70/80/90/100科研经费");
    expect(help).toContain("再从经费支付你和结项时每位在组同学各占总奖励5%的劳务费");
    expect(help).toContain("无需参与，已离校不领取");
    expect(help).not.toMatch(/参与同学各5金币|已离校参与者也领取/);
    expect(help).toContain("横向不设最低经费要求");
    expect(help).toContain("纵向导师科研积累增加当前值的10%");
    expect(help).toContain("增加当前值的10%（下取整）");
    expect(help).toContain("实验基础花费3经费");
    expect(help).toContain("玩家经费不足时暂停实验，同学先用经费、不足差额自付");
    expect(help).toContain("纵向项目满100时，导师为玩家和每位同学各随机选择一篇论文，写作协作+10");
    expect(help).toContain("玩家与同学每次实验费用+1");
    expect(help).toContain("同学经费与个人金币合计不足当次实验费用时改做横向");
    expect(help).toContain("导师、同学和你共同推进卡片上的两条项目进度");
    expect(help).toContain("推进=⌊实际科研能力+随机0～5⌋，最终向下取整。同学也按自身科研计算");
    expect(help).toContain("导师每月轮流推进项目10");
    expect(help).not.toContain("每月为玩家和每位同学各提供一次论文指导");
    expect(help).toContain("每年3月不限项即申请");
    expect(help).toContain("申请时积累≤该值80%，成功率0%");
    expect(help).toContain("从80%到100%线性升至必过");
    expect(help).toContain("讲师限1项，晋升后限2项");
    expect(help).toContain("项目到期释放名额");
    expect(help).toContain("院士需先获得杰青");
    expect(help).toContain("院士");
    for (const [threshold, funding, duration] of [[25, 30, 3], [50, 60, 4], [150, 150, 3], [400, 300, 5]]) {
      expect(help).toContain(`${threshold}+${funding}${duration}年`);
    }
    expect(help).not.toMatch(/科研资源|信任度/);
  });

  it("retains score formulas and review rules across workstation help pages", () => {
    const html = renderApp(createResearchState(), createDefaultAccountProfile(), { activePlayTab: "workstation" });
    const help = getHelpText({ activePlayTab: "workstation" });

    expect(help).toContain("分数格上行是自身分，下行是协作分，右侧总分为六格之和");
    expect(help).toContain("实验需要idea有分，写作需要实验有分");
    expect(help).toContain("基础分=实际科研能力×随机倍率（0.5～1.5）+随机加分（0～5），科研小数不提前取整");
    expect(help).toContain("本次分=基础分×总倍率+固定分，结果四舍五入");
    expect(help).toContain("更新自身分：原自身+1与本次分，取较大值");
    expect(help).toContain("协作分持续累加，不会被覆盖");
    expect(help).toContain("先合并倍率，再加固定分");
    expect(help).toContain("×1.5算+0.5，×0.8算−0.2");
    expect(help).toContain("两个×1.5合并为×2");
    expect(help).toContain("不额外扣行动点或SAN");
    expect(help).toContain("实验基础费用3经费");
    expect(help).toContain("玩家费用由实验室支付，不足时暂停实验；同学不足差额由自己的钱包支付");
    expect(help).toContain("悬浮实验按钮查看实际经费消耗");
    expect(help).toContain("玩家经费不足时不会扣SAN或行动点");
    expect(help).not.toMatch(/不足部分自付|最后扣你的金币|自费租卡/);
    expect(help).toContain("算力短缺持续6个月，玩家与同学每次实验费用+1");
    expect(help).toContain("实验经费也只收一次");
    expect(help).toContain("个人显卡RTX4090起每次实验减1经费，H20起减2");
    expect(help).toContain("远程实习期间再减1，最低0");
    expect(help).toContain("减免仅限玩家，不影响同学");
    expect(help).toContain("先算共享涨价与个人减免");
    expect(help).toContain("每遍都重新生成分数");
    expect(help).toContain("每遍与上一遍自身分+1取最大值");
    expect(help).toContain("总次数=1+⌊n⌋，n为额外次数之和，至少执行1次");
    expect(help).toContain("“仅下次”加分与倍率只用于第一遍");
    expect(help).toContain("持续Buff和装备每遍生效");
    expect(help).not.toContain("期刊送审后本次分直接累加");

    expect(help).toContain("审稿3个月，期间不能修改");
    expect(help).toContain("投稿时idea、实验、写作各项的自身分与协作分之和");
    expect(help).toContain("审稿期间的衰减不影响本次评审");
    expect(help).toContain("草稿和会议审稿中的论文每月衰减");
    expect(help).toContain("拒稿后从衰减后的分数继续修改");
    expect(help).toContain("保留衰减后的分数，再将审稿反馈加到自身分，协作分不变");
    expect(help).toContain("每项扣分=⌊s×h×10%⌋，至少扣1");
    expect(help).toContain("s为该项自身与协作合计分，h为热度");
    expect(help).toContain("热度会影响引用倍率");
    expect(help).toContain("不同topic的热度会随时间变化，新建论文按当年热度抽取");
    expect(help).toContain("合计最低保留1");
    expect(help).toContain("原本0或1分不扣");
    expect(help).toContain("先算合计扣分，再按自身/协作比例分摊");
    expect(help).toContain("3位独立抽取，类型可重复");
    expect(help).toContain("y=投稿学年−1，首年y=0");
    expect(help).toContain("普通与LLM的三项权重随机生成，权重之和均为3");
    expect(help).toContain("有效分四舍五入");
    expect(help).toContain("最高/最低按投稿时的各项合计分选取");
    expect(help).toContain("拒稿：最低两项各+3");
    expect(help).toContain("SAN变化无论中稿或拒稿都生效");
    expect(help).toContain("总评≥+2为Accept，≤−2为Reject");
    expect(help).toContain("实际门槛=基础门槛×会议影响力÷等级均值，四舍五入");

    expect(help).toContain("期刊送审后不衰减，可继续修改、接受协作");
    expect(help).toContain("达到录用线即发表并开始被引");
    expect(help).toContain("期刊分=idea+实验+写作");
    expect(help).toContain("自身与协作分均计入");
    expect(help).toContain("送审后继续按当前总分判断");
    for (const [journal, submission, acceptance] of [["PAMI", 75, 125], ["NMI", 100, 250], ["Nature", 150, 500]]) {
      expect(help).toContain(`${journal}${submission}${acceptance}`);
    }
    expect(html).not.toContain('class="workstation-notes"');
    expect(html).not.toContain('data-workstation-note="review"');
    expect(html).toContain('data-help-context="workstation"');
  });

  it("shows full lab experiment costs and blocks insufficient funding regardless of personal money", () => {
    const funded = createResearchState();
    funded.papers[0] = { ...funded.papers[0]!, idea: 1 };
    funded.advisorProgressState.funding = 3;
    funded.player.money = 0;
    const fundedHtml = renderApp(funded, createDefaultAccountProfile(), { activePlayTab: "workstation" });
    const fundedButton = fundedHtml.match(/<button[^>]*data-paper-action-type="experiment"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(fundedButton.replace(/<[^>]*>/g, "")).toContain("SAN-3");
    expect(fundedButton.replace(/<[^>]*>/g, "")).not.toContain("金币-");
    expect(fundedButton).toContain('data-card-tooltip data-tooltip="消耗3导师经费"');
    expect(fundedButton).not.toContain("经费-");
    expect(fundedButton).toContain('data-animate-number="3"');
    expect(fundedButton).toContain('data-action="research-paper"');
    expect(fundedButton).not.toContain("disabled");

    for (const [funding, gpuLevel, labCost] of [[2, 0, 3], [1, 4, 2], [0, 8, 1]] as const) {
      const partial = {
        ...funded,
        advisorProgressState: { ...funded.advisorProgressState, funding },
        shopState: { ...funded.shopState, gpuLevel },
        player: { ...funded.player, money: 100 },
      };
      const html = renderApp(partial, createDefaultAccountProfile(), { activePlayTab: "workstation" });
      const button = html.match(/<button[^>]*workstation-paper-action-btn is-experiment[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
      expect(button.replace(/<[^>]*>/g, "")).toContain("SAN-3");
      expect(button).toContain(`科研经费不足，需要 ${labCost}`);
      expect(button).toContain(`消耗${labCost}导师经费`);
      expect(button).not.toMatch(/金币-|自费租卡/);
      expect(button).not.toContain('data-action="research-paper"');
      expect(button).toContain('disabled aria-disabled="true"');
    }
  });

  it.each([[4, 2], [8, 1]])("uses the actual funding cost after GPU upgrade %s", (gpuLevel, cost) => {
    const state = createResearchState();
    state.shopState.gpuLevel = gpuLevel;
    state.advisorProgressState.funding = 10;
    const html = renderApp(state);
    const button = html.match(/<button[^>]*workstation-paper-action-btn is-experiment[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(button).toContain(`消耗${cost}导师经费`);
    expect(button.replace(/<[^>]*>/g, "")).toContain("SAN-3");
    expect(button.replace(/<[^>]*>/g, "")).not.toContain("金币-");
  });

  it.each([[0, 8], [50, 51]])("matches the documented score formula for current score %s", (currentScore, expectedScore) => {
    const state = createResearchState();
    state.player.research = 5;
    state.papers[0]!.idea = currentScore;
    state.buffs = [
      createBuff("first", { actionEffects: { idea: { multiplier: 1.5, bonus: 1 } } }),
      createBuff("second", { actionEffects: { idea: { multiplier: 1.5, bonus: 2 } } }),
    ];

    const nextState = applyResearchOperation(state, state.papers[0]!.id, "idea", () => 0);

    expect(nextState.papers[0]?.idea).toBe(expectedScore);
    expect(nextState.player.san).toBe(18);
    expect(nextState.actionState.used).toBe(1);
  });

  it("applies next-action score buffs only on the first internal execution and charges once", () => {
    const state = createResearchState();
    state.papers[0]!.idea = 1;
    state.shopState.gpuLevel = 1;
    state.buffs = [
      createBuff("ongoing", { actionEffects: { experiment: { bonus: 2 } } }),
      createBuff("once", { timing: "next-action", actionEffects: { experiment: { bonus: 10 } } }),
    ];
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(0.999);

    const nextState = applyResearchOperation(state, state.papers[0]!.id, "experiment", random);

    expect(nextState.papers[0]?.experiment).toBe(16);
    expect(random).toHaveBeenCalledTimes(4);
    expect(nextState.buffs.map((buff) => buff.id)).toEqual(["ongoing"]);
    expect(nextState.player.san).toBe(17);
    expect(nextState.actionState.used).toBe(1);
  });

  it("rounds the combined SAN multiplier before equipment and seasonal adjustments", () => {
    const state = createResearchState();
    state.shopState.keyboardOwned = true;
    state.buffs = [
      createBuff("first", { activeOperationSanMultiplier: 1.1, actionEffects: { writing: { sanDelta: 1 } } }),
      createBuff("second", { activeOperationSanMultiplier: 1.1 }),
    ];

    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(5);
    state.month = 7;
    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(4);
    state.month = 10;
    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(6);
    state.eventSupport.hasParasol = true;
    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(5);
    state.month = 4;
    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(5);
  });

  it("places duration fourth and the total citation multiplier last with two candidate label lines", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0, () => 0), status: "published", target: "A", conferenceHandled: true,
    }, 1, "Best Paper Candidate");
    const metrics = renderMetrics(paper);
    const labels = [...metrics.matchAll(/<div class="research-metric-item[^"]*">\s*<span[^>]*>([\s\S]*?)<\/span>/g)]
      .map((match) => match[1]!.replace(/<[^>]*>/g, ""));

    expect(labels).toEqual(["引用", "录用分", "当前分", "历时", "Best Paper", "热度", "影响力", "总引用倍率"]);
    expect(metrics).toContain('<span class="research-publication-label play-tooltip" tabindex="0" data-tooltip="最佳论文候选"><span>Best Paper</span><span>Candidate</span></span><strong>×5</strong>');
  });

  it("retains the zero multiplier before exposure and replaces arXiv with the conference award", () => {
    const paper = attachPaperPublication({ ...createDraftPaper(1, 0, () => 0), status: "published", target: "A" }, 1, "Oral");
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">未开会</span><strong>×0</strong>');
    expect(renderMetrics(paper)).toContain('<span>总引用倍率</span><strong>0</strong>');
    paper.publication!.preprintExposed = true;
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">arXiv</span><strong>×1</strong>');
    paper.conferenceHandled = true;
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label play-tooltip" tabindex="0" data-tooltip="口头报告">Oral</span><strong>×1.5</strong>');
  });

  it("shows live publicity for arXiv and poster exposure before the original conference", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0, () => 0), status: "published", target: "A", conferenceHandled: false, heatMultiplier: 1.35,
    }, 1, "Oral");
    paper.publication!.influence = 1;
    paper.publication!.promotions = { arxiv: true, github: false, xiaohongshu: true, quantum: false };
    expect(renderMetrics(paper)).toContain('<span>总引用倍率</span><strong>0</strong>');
    paper.publication!.preprintExposed = true;
    expect(renderMetrics(paper)).toContain('<span>总引用倍率</span><strong>×1.69</strong>');
    paper.publication!.preprintExposed = false;
    paper.publication!.promotions.arxiv = false;
    paper.publication!.posterExposed = true;
    paper.publication!.promotionMultiplier = 1.25;
    const metrics = renderMetrics(paper);
    expect(metrics).toContain('<span class="research-publication-label">海报展示</span><strong>×1</strong>');
    expect(metrics).toContain('<span>总引用倍率</span><strong>×2.03</strong>');
    const state = { ...createResearchState(), papers: [paper] };
    const html = renderApp(state, undefined, { activePlayTab: "research" });
    expect(html).not.toContain('data-promotion-id="arxiv"');
  });

  it("shows journal publication as ×1.0 without requiring conference attendance", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0, () => 0), status: "published", target: null, journalTarget: "pami",
    });
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">期刊</span><strong>×1.0</strong>');
  });

  it("explains coffee prerequisites, subscription skips and the different seasonal penalties", () => {
    const coffee = getHelpText({ activePlayTab: "shop", activeShopTab: "coffee" });
    const gear = getHelpText({ activePlayTab: "shop", activeShopTab: "gear" });
    const rest = getHelpText({ activePlayTab: "shop", activeShopTab: "rest" });

    expect(coffee).toContain("冰美式可直接购买，SAN+2");
    expect(coffee).toContain("购入咖啡机后提升为SAN+3");
    expect(coffee).toContain("无需咖啡机即可开启月初自动续费");
    expect(coffee).toContain("SAN已满时，自动续费当月跳过");
    expect(coffee).toContain("金币不足且没有可用于续费的礼物券时，当月暂停续费");
    expect(gear).toContain("显卡和自行车可逐档升级");
    expect(gear).toMatch(/夏季（公历6–8月）.*SAN消耗\+1，遮阳伞可免除/);
    expect(gear).toContain("季节、疾病与恋人玩耍减耗影响所有即时SAN损失，含事件和审稿人影响");
    expect(gear).toContain("最低0，不影响固定月耗和恢复");
    expect(gear).toMatch(/冬季（公历12–2月）.*每月SAN-1，羽绒服可免除/);
    expect(rest).toContain("选定后不能直接换路线");
    expect(rest).toContain("出售并重新购买后可重新选择");
    expect(rest).toContain("休息效果+3");
  });

  it("keeps citation rules in results help and statistics in the main panel", () => {
    const html = renderApp(createResearchState(), createDefaultAccountProfile(), { activePlayTab: "research" });
    const notes = getHelpText({ activePlayTab: "research" });
    expect(getPlayHelpContext({ activePlayTab: "research" }).pages).toHaveLength(5);
    const noteIndex = html.indexOf('data-help-context="research"');
    const summary = html.match(/<div class="citation-venue-grid research-global-summary"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(summary.match(/class="citation-venue-cell"/g)).toHaveLength(7);
    expect(summary).not.toContain("<details");
    expect(html).not.toContain('class="research-mechanism-notes"');
    expect(html).not.toContain('data-research-note="citation"');
    expect(noteIndex).toBeGreaterThan(html.indexOf('class="play-right-rail'));
    expect(notes).toContain("会议开会、挂arXiv或在VALSE展示海报后开始被引");
    expect(notes).toContain("期刊接收后直接开始");
    expect(notes).toContain("原会议的Oral/Best加成仍等该会议举办后生效");
    expect(notes).toContain("论文公开后，宣传加成立即生效");
    expect(notes).toContain("每月引用增长=当前分×0.05×总引用倍率");
    expect(notes).toContain("小数累积满1才增加引用");
    expect(notes).toContain("尚未公开时总引用倍率显示0");
    expect(notes).toContain("Poster/Spotlight×1");
    expect(notes).toContain("Oral×1.5");
    expect(notes).toContain("BestPaper/BestPaperCandidate×5");
    expect(notes).toContain("期刊×1");
    expect(notes).toContain("GitHub：增加当前分的25%（增加量向下取整），录用分不变");
    expect(notes).toContain("录用/推广倍率+0.25");
    expect(notes).toContain("Oral从×1.5变为×1.75");
    expect(notes).toContain("当前分每4个月衰减10%");
    expect(notes).toContain("尚未公开也会衰减");
    expect(notes).toContain("向上取整，最低0");
    expect(notes).toContain("该月先算引用，再扣分");
    expect(notes).toContain("ESI高被引");
    expect(notes).toContain("发表满12个月后");
    expect(notes).toContain("发表时热度×200");
    expect(notes).toContain("热度×0.75需150次");
    expect(notes).toContain("“同行瞩目”只奖励首篇一作高被引");
    expect(notes).toContain("科研分只算一作");
    expect(notes).toContain("引用、h指数和i10指数均包含一作与非一作");
    expect(html.indexOf("科研分")).toBeLessThan(noteIndex);
    expect(html.indexOf("A（")).toBeLessThan(noteIndex);
    expect(html.indexOf("C（")).toBeLessThan(noteIndex);
  });

  it("shows both the old and new hammock rest recovery in the shop and talent panel", () => {
    const state = createResearchState();
    state.shopState.chairOwned = true;
    const shopHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "rest", selectedChairUpgradeId: "chair-hammock" });
    state.shopState.chairUpgrade = "hammock";
    const talentHtml = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "talent", activeTalentTab: "equip" });

    expect(shopHtml.replace(/<[^>]*>/g, "")).toContain("休息效果 +3");
    expect(talentHtml).toContain("休息效果 +3");
    expect(talentHtml).not.toContain("休息动作改为 SAN +5");
  });
});
