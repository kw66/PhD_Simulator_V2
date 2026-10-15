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
    .replace(/<[^>]*>/g, "").replace(/\s+/g, "").replace(/／/g, "/").replace(/&lt;/g, "<");
}

function getHelpPageText(uiState: PlayRenderUiState, title: string): string {
  const page = getPlayHelpContext(uiState).pages.find((entry) => entry.title === title);
  expect(page, title).toBeDefined();
  return (page!.summary + page!.body).replace(/<[^>]*>/g, "").replace(/\s+/g, "").replace(/／/g, "/").replace(/&lt;/g, "<");
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
  it("gives resistance, annual growth and wages separate concise relationship pages", () => {
    const uiState = { activePlayTab: "relationship" } as const;
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

  it("keeps grant and talent guidance pages separate from the relationship rule pages", () => {
    const relationship = getPlayHelpContext({ activePlayTab: "relationship" });
    const uiState = { activePlayTab: "talent", activeTalentTab: "relation" } as const;
    const talent = getPlayHelpContext(uiState);
    expect(talent.pages.map((page) => page.title)).toEqual([
      "导师晋升", "基金申请", "关系天赋", "大厂实习", "远程实习", "大牛联培",
    ]);
    expect(new Set(relationship.pages.map((page) => page.title)).size).toBe(relationship.pages.length);
    expect(relationship.pages.filter((page) => page.title === "导师项目")).toHaveLength(1);
    expect(relationship.pages.some((page) => page.title === "基金申请")).toBe(false);
    for (const title of ["属性与抵抗", "年度科研成长", "工资与生活费"]) {
      const source = relationship.pages.filter((page) => page.title === title);
      expect(source).toHaveLength(1);
      expect(talent.pages.some((page) => page.title === title || page.body === source[0]!.body)).toBe(false);
    }
    const guidance = getHelpPageText(uiState, "关系天赋");
    expect(guidance).toContain("目前在组同学的年度实际提升");
    expect(guidance).toContain("一篇带两位同学记2人次");
    expect(guidance).toContain("属性抵抗与年度成长规则见人际提示");
    expect(guidance).not.toContain("卡片右上角翻页");
  });

  it("explains fatal and risky choices without treating missing prerequisites as affordable risks", () => {
    const events = { activePlayTab: "events" } as const;
    const help = getHelpPageText(events, "危险选择");
    expect(help).toContain("余额不足的危险选项仍可选择");
    expect(help).toContain("危险预警只检查本次结算，不预测下月支出");
    expect(help).not.toMatch(/确定死|可能死/);
    expect(help).toContain("前置条件未满足或次数用尽的选项则会禁用");
    expect(getHelpPageText(events, "处理事件")).toContain("必须手动确认");
    expect(help).not.toContain("悬浮或聚焦按钮");
  });

  it("points players to current lover reward controls and the shop gift notice", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("礼物券的使用顺序见商店提示");
    expect(help).not.toContain("卡片标签显示");
  });

  it("describes active publication and event mechanics without development history or repeated reward exclusions", () => {
    const publication = getHelpText({ activePlayTab: "talent", activeTalentTab: "publication" });
    expect(publication).toContain("每项奖励每局只结算一次");
    expect(publication).toContain("同一篇论文可以同时满足多项条件");
    expect(publication).toContain("累计引用包含一作和合作论文");
    expect(publication).not.toMatch(/不重复发奖|重复发表不额外奖励SAN或好感/);
    const events = getHelpText({ activePlayTab: "events" });
    expect(events).toContain("会先完成当前事件的后续情节");
    expect(events).toContain("遇到需要玩家选择的阻塞事件时会暂停");
    expect(events).toContain("论文结果自动处理后，审稿意见与奖励仍保留在日志中");
    expect(events).not.toContain("点击待办事件右上角");
    const contexts: PlayRenderUiState[] = [
      { activePlayTab: "workstation" }, { activePlayTab: "relationship" }, { activePlayTab: "research" },
      { activePlayTab: "events" }, { activePlayTab: "settings" },
      ...(["ai", "coffee", "gear", "life", "rest"] as const).map((activeShopTab) => ({ activePlayTab: "shop" as const, activeShopTab })),
      ...(["character", "relation", "equip", "growth", "publication"] as const).map((activeTalentTab) => ({ activePlayTab: "talent" as const, activeTalentTab })),
    ];
    for (const context of contexts) {
      expect(getHelpText(context)).not.toMatch(/旧版|新版|实现细节|走同一事件流程|仅同学自主科研间隔|三项合计分快照/);
    }
  });

  it("keeps help emphasis short and titles free of a repeated suffix", () => {
    const contexts: PlayRenderUiState[] = [
      { activePlayTab: "workstation" }, { activePlayTab: "relationship" }, { activePlayTab: "research" },
      { activePlayTab: "events" },
      ...(["ai", "coffee", "gear", "life", "rest"] as const).map((activeShopTab) => ({ activePlayTab: "shop" as const, activeShopTab })),
      ...(["relation", "growth", "publication"] as const).map((activeTalentTab) => ({ activePlayTab: "talent" as const, activeTalentTab })),
    ];
    for (const uiState of contexts) {
      const context = getPlayHelpContext(uiState);
      for (const [index, page] of context.pages.entries()) {
        for (const [, bold] of (page.summary + page.body).matchAll(/<b>(.*?)<\/b>/g)) {
          expect(bold!.length, `${context.key}: ${page.title}`).toBeLessThanOrEqual(24);
        }
        const panel = renderPlayHelpPanel({ ...uiState, helpPageByContext: { [context.key]: index } });
        expect(panel).toContain(`<strong class="play-help-topic">💡 ${page.title}</strong>`);
      }
    }
    expect(getHelpText({ activePlayTab: "shop", activeShopTab: "ai" })).not.toContain("先算倍率，再加固定分");
    expect(getHelpPageText({ activePlayTab: "workstation" }, "科研分数计算"))
      .toContain("先合并倍率，再加固定分");
  });

  it("documents lover route formulas, passive gains and the shared monthly date limit", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("三条约会路线共用每月一次的主动机会");
    expect(help).not.toContain("消耗金币-2、SAN-4、金币-3");
    expect(help).toContain("玩耍=⌊(亲密+你的社交)/2⌋");
    expect(help).toContain("学习=⌊(恋人科研+你的科研)/2⌋");
    expect(help).toContain("购物=⌊亲密/2⌋+10");
    expect(help).toContain("自动推进从次月开始，每次⌊月初亲密/2⌋");
    expect(help).toContain("活泼每月玩耍2次、学习1次，聪慧相反");
    expect(help).toContain("购物不自动推进");
    expect(help).toContain("自动推进从次月开始");
    expect(help).toContain("科研基础=年级×2+随机0～3；聪慧额外+3");
    expect(help).toContain("亲密基础=3+随机0～3；活泼额外+3");
    expect(getHelpPageText({ activePlayTab: "relationship" }, "年度科研成长"))
      .toContain("恋人科研自然成长原始+2，经过抵抗，上限20，不参与传承");
    expect(help).not.toMatch(/科研3～6|科研9～12|亲密9～12/);
    expect(help).not.toMatch(/没有一次性奖励|不再每月自动扣费|固定每月金币奖励/);
  });

  it("explains separate three-cycle lover rewards and gift purchase priority", () => {
    const context = getPlayHelpContext({ activePlayTab: "relationship" });
    const pages = context.pages.filter((page) => page.title.startsWith("恋人"));
    expect(pages.map((page) => page.title)).toEqual(["恋人邀请", "恋人初始属性", "恋人约会", "恋人条满奖励"]);
    const help = getHelpPageText({ activePlayTab: "relationship" }, "恋人条满奖励");
    expect(help).toContain("学习路线第三轮只提升双方科研较低者，相同时不加");
    expect(help).toContain("亲密原始+1并循环三轮");
    expect(help).toContain("亲密奖励经过档位抵抗");
    expect(help).toContain("礼物券的使用顺序见商店提示");
    expect(help).toContain("没有可帮助的论文时，论文协作奖励会暂存");
    expect(help).not.toContain("玩耍：SAN+6");
  });

  it("explains alternating fellow research, monthly review work and experiment retries", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("次月开始科研；科研成功后，下月做项目");
    expect(help).toContain("审稿3个月，等待时继续做项目");
    expect(help).toContain("中稿当月开新稿，退稿当月继续修改");
    expect(getHelpPageText({ activePlayTab: "relationship" }, "科研经费"))
      .toContain("同学做项目时，月初经费<60选横向，否则选纵向");
    expect(help).toContain("同学实验先用经费，不足差额用钱包；两者都不足则改做横向");
    expect(help).not.toContain("按卡片顺序扣经费");
    expect(help).toContain("审稿3个月");
    expect(help).not.toContain("仅同学自主科研间隔2个月");
    expect(help).toContain("审稿中的论文仍可协作");
    expect(help).toContain("自动推进使用实际默契，长期合作每月额外推进1次");
    expect(help).toContain("每学年8月底结算，第一学年就有");
    expect(help).toContain("同学另有自然成长+2，与传承合并后逐点抵抗，上限20");
    expect(help).toContain("玩家只获传承，受自身科研上限限制");
    expect(help).toContain("初始科研=年级×2+随机0～3，从0逐点抵抗，上限20");
    expect(help).not.toMatch(/发表积累|累计一作|每学年9月/);
    expect(help).toContain("双方主导均可触发");
    expect(help).not.toContain("每位同学每月可主动协作一次");
    expect(help).toContain("你帮同学最低项");
    expect(help).toContain("满100互助，加分为⌊帮助者科研⌋");
    expect(help).toContain("无可修改论文时，双方各暂存一次帮助");
    expect(help).toContain("达到参考分后优先投A，其次B、C");
    expect(help).toContain("你实际帮助过才会署名；成果与引用计入玩家，科研分不计");
    expect(help).not.toMatch(/自动推进=⌊默契⌋|每次为⌊默契⌋/);
  });

  it("preserves the complete August settlement rules in relationship help", () => {
    const help = getHelpPageText({ activePlayTab: "relationship" }, "年度科研成长");
    expect(help).toContain("每学年8月底结算，第一学年就有");
    expect(help).toContain("传承原始奖励为科研+⌊n/2⌋");
    expect(help).toContain("n是科研比自己高的其他实验室成员人数，导师计1人，恋人不计");
    expect(help).toContain("同批按成长前的科研比较，避免先后顺序影响结果");
    expect(help).toContain("同学另有自然成长+2，与传承合并后逐点抵抗，上限20");
    expect(help).toContain("玩家只获传承，受自身科研上限限制");
    expect(help).toContain("恋人科研自然成长原始+2，经过抵抗，上限20，不参与传承");
    expect(help).not.toContain("日志记录群体结算；卡片记录个人变化");
    expect(help).not.toMatch(/发薪|快照|每学年9月/);
  });

  it("explains playable June and player graduation after events and transfer decisions", () => {
    const help = getHelpText({ activePlayTab: "events" });
    expect(help).toContain("毕业学年6月仍可行动");
    expect(help).not.toContain("内部第9月");
    expect(help).toContain("确认后从6月起按博士标准发工资");
    expect(help).toContain("不额外推进月份");
    expect(help).toContain("即使硕士盲审未通过，5月仍可申请转博");
    const fellows = getHelpPageText({ activePlayTab: "relationship" }, "同学学业");
    expect(fellows).toContain("6月底：第2/3年硕士科研分达到2/3先转博");
    expect(fellows).toContain("第3年仍为硕士需科研分1、第6年博士需科研分7才毕业");
    expect(fellows).toContain("未达标退学并结束合作");
    expect(fellows).toContain("已投稿论文及费用责任保留");
  });

  it("explains the player's three-stage journal payment and automatic fellow OA funding", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("PAMI/NMI/Nature的OA版面费为5/10/20");
    expect(help).toContain("玩家一作发表后进入“期刊中稿→缴费方式→缴费确认”");
    expect(help).toContain("可选自费或导师经费，最终确认时扣款");
    expect(help).toContain("不能返回重选");
    expect(help).toContain("不足时按钮显示失败预警");
    expect(help).toContain("同学一作发表时自动扣科研经费，不扣同学钱包");
    expect(help).not.toMatch(/不生成期刊缴费待办|玩家与同学一作均在发表时立即自动扣/);
    const workstation = getHelpText({ activePlayTab: "workstation" });
    expect(workstation).toContain("版面费在缴费事件最后确认时才扣除");
    expect(workstation).not.toContain("PAMI/NMI/Nature的OA版面费分别");
  });

  it("separates early attendance payment from meeting-month activities and citation boosts", () => {
    const help = getHelpPageText({ activePlayTab: "relationship" }, "会议费用");
    expect(help).toContain("一作注册费由导师支付");
    expect(help).toContain("同一会议的多篇论文只结算一次差旅");
    expect(help).toContain("到开会月才开放会场活动");
    expect(help).toContain("找人代贴不参加活动");
    expect(help).toContain("VALSE免注册费，差旅2");
    expect(help).not.toContain("VALSE参会");
    expect(help).not.toMatch(/同学中同一届会议则免费|否则个人金币-1|只收一次差旅|全部自费/);
    const research = getHelpText({ activePlayTab: "research" });
    expect(research).toContain("原会议的Oral/Best加成仍等该会议举办后生效");
  });

  it("explains deterministic fractional resistance in relationship help", () => {
    const help = getHelpPageText({ activePlayTab: "relationship" }, "属性与抵抗");
    expect(help).toContain("科研、社交、导师好感、同学默契和恋人亲密的增减都受档位抵抗");
    expect(help).toContain("0/6/12/18档位分别抵抗0%/20%/40%/60%");
    expect(help).toContain("每1点原始变化先按当前档位减免，再处理下一点");
    expect(help).toContain("不足1点也按比例计算");
    expect(help).toContain("科研5增加2点，先到6，再增加0.8，实际到6.8");
    expect(help).toContain("属性显示至多两位小数，计算使用实际数值");
    expect(help).not.toContain("结果括号显示抵抗值");
    expect(help).toContain("SAN和金币没有档位抵抗");
    expect(help).not.toMatch(/概率无效|快照|科研.*随机失效/);
  });

  it("explains actual wages, fellow AI reserves and zero-funding survival", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("基本工资：硕士每月1金币，博士每月2.5金币");
    expect(help).toContain("发薪前科研经费≥60时，硕士额外+0.5、博士额外+1");
    expect(help).toContain("所有人按发薪前经费判断");
    expect(help).toContain("不随导师职称增加");
    expect(help).toContain("工资与生活费合并结算后再检查余额");
    expect(help).toContain("同学加入次月起结算");
    expect(help).toContain("大四不领工资，每月家里给1金币，正好抵生活费，不扣经费");
    expect(help).toContain("你和在组同学每月生活费各1金币");
    expect(getHelpPageText({ activePlayTab: "relationship" }, "科研经费")).toContain("低于0时实验室破产");
    expect(help).toContain("钱包只补实验差额和订阅AI，不付论文费用");
    expect(help).toContain("离校后保留钱包与论文责任");
    expect(help).toContain("预留生活费与一次实验费用后");
    expect(help).toContain("择优订阅AI，每月一种");
    expect(help).toContain("AI只作用于自己的论文，不影响协作");
    expect(help).toContain("不再发工资或购买AI");
    expect(help).not.toMatch(/报销预留|小数累计|经费净增55|经费≤0|下月加薪|每级\+|金额四舍五入/);
  });

  it("keeps event help focused on event handling", () => {
    const events = getHelpText({ activePlayTab: "events" });
    expect(events).toContain("自动处理按到期顺序推进");
    expect(events).toContain("论文结果自动处理后，审稿意见与奖励仍保留在日志中");
    expect(events).not.toContain("关系自动行动");
    expect(events).not.toContain("基本工资硕士");
    expect(getHelpPageText({ activePlayTab: "talent", activeTalentTab: "relation" }, "关系天赋"))
      .toContain("目前在组同学的年度实际提升");
  });

  it("documents mentor project limits, paper contributions and completion rewards", () => {
    const help = getHelpPageText({ activePlayTab: "relationship" }, "导师项目");
    expect(help).toContain("你和同学发表论文时，按获得的科研分提升导师科研积累");
    expect(help).toContain("同学也会自动推进项目");
    expect(help).toContain("若没有可修改论文，写作协作奖励会各暂存一次");
    expect(help).not.toContain("横向基础SAN-5");
    const funding = getHelpPageText({ activePlayTab: "relationship" }, "科研经费");
    expect(funding).toContain("科研经费低于0时实验室破产");
    expect(funding).toContain("同学做项目时，月初经费<60选横向，否则选纵向");
  });

  it("documents approval, validity and actual funding costs for reimbursements", () => {
    const help = getHelpPageText({ activePlayTab: "relationship" }, "经费报销");
    expect(help).toContain("按购买时的实际费用扣科研经费，已支付的费用不退");
    expect(help).toContain("经费不足时暂停报销，不自动改为自费");
    expect(help).toContain("AI报销可留待后续购买或续费");
    expect(help).not.toContain("四档好感对应报销率");
  });

  it("preserves grant thresholds, funding, durations and promotion rules in talent help", () => {
    const uiState = { activePlayTab: "talent", activeTalentTab: "relation" } as const;
    const grantPage = getPlayHelpContext(uiState).pages.find((page) => page.title === "基金申请");
    expect(grantPage).toBeDefined();
    expect(grantPage!.body).not.toContain("<table");
    const help = getHelpPageText(uiState, "基金申请");
    expect(help).toContain("有名额时优先申请稳获批的最高新项目，否则申请下一档");
    expect(help).toContain("不超过申请门槛80%时获批率为0，之后线性升至门槛时100%；申请不扣积累");
    expect(help).toContain("讲师限1项，晋升后2项，到期释放名额");
    expect(help).toContain("院士需先获杰青，积累1000稳获批，沿用上述概率");
    expect(help).not.toContain("当选时一次性经费+600");
    const promotion = getHelpPageText(uiState, "导师晋升");
    expect(promotion).toContain("当时在组的同学各领结项经费5%的劳务费");
    expect(promotion).toContain("导师到场率初始60%，每次晋升下降10个百分点");
    expect(promotion).not.toContain("横向结项经费随职称为");
  });

  it("retains score formulas and review rules across workstation help pages", () => {
    const html = renderApp(createResearchState(), createDefaultAccountProfile(), { activePlayTab: "workstation" });
    const help = getHelpText({ activePlayTab: "workstation" });

    expect(help).toContain("基础分=实际科研能力×随机倍率（0.5～1.5）+随机加分（0～5），科研小数不提前取整");
    expect(help).toContain("本次分=基础分×总倍率+固定分，结果四舍五入");
    expect(help).toContain("更新自身分：原自身+1与本次分，取较大值");
    expect(help).toContain("先合并倍率，再加固定分");
    expect(help).toContain("大厂9月至次年3月、央国企10月至次年4月、公务员11月至次年5月、教职12月至次年6月");
    expect(help).toContain("已有offer仍可应聘");
    expect(help).toContain("×1.5算+0.5，×0.8算−0.2");
    expect(help).toContain("两个×1.5合并为×2");
    expect(help).toContain("不另扣行动点或SAN");
    expect(help).toContain("不足的差额由你自付金币");
    expect(help).toContain("经费和金币合计不足时，本次无法做实验");
    expect(help).toContain("实验经费也只收一次");
    expect(help).toContain("先结算全组费用变动，再扣你的个人减免");
    expect(help).toContain("每遍都重新生成分数");
    expect(help).toContain("每遍与上一遍自身分+1取最大值");
    expect(help).toContain("总次数=1+⌊n⌋，n为额外次数之和，至少执行1次");
    expect(help).toContain("“仅下次”加分与倍率只用于第一遍");
    expect(help).toContain("持续Buff和装备每遍生效");
    expect(help).not.toContain("分数格上行是自身分");
    expect(help).not.toContain("实验基础费用3经费");
    expect(help).not.toContain("悬浮实验按钮查看");
    expect(help).not.toContain("大厂/央国企/公务员/教职固定消耗SAN");

    expect(help).toContain("评审使用投稿时三项自身分与协作分的合计快照");
    expect(help).toContain("审稿期间的衰减不影响本次评审");
    expect(help).toContain("草稿和会议审稿中的论文每月衰减");
    expect(help).toContain("拒稿后从衰减后的分数继续修改");
    expect(help).toContain("每项扣分=⌊s×h×10%⌋，至少扣1");
    expect(help).toContain("不同topic的热度会随时间变化，新建论文按当年热度抽取");
    expect(help).toContain("合计最低保留1");
    expect(help).toContain("3位独立抽取，类型可重复");
    expect(help).toContain("普通与LLM的三项权重随机生成，权重之和均为3");
    expect(help).toContain("有效分四舍五入");
    expect(help).toContain("SAN变化中稿或拒稿均生效");
    expect(help).toContain("实际门槛=基础门槛×会议影响力÷等级均值，四舍五入");
    expect(help).toContain("期刊送审后分数不衰减，仍可修改和接受协作");
    expect(help).toContain("达到达标分后可继续修改，再次点击该期刊按钮才发表");
    expect(help).not.toContain("PAMI75125");
    expect(help).toContain("有效分门槛");
    const reviewHelp = getHelpPageText({ activePlayTab: "workstation" }, "毕业盲审");
    expect(reviewHelp).toContain("参考刻度按各研究点同分计算");
    expect(reviewHelp).toContain("超过A参考线仍可继续提升");
    expect(getPlayHelpContext({ activePlayTab: "workstation" }).pages.some((page) => page.title === "研究点刻度")).toBe(false);
    expect(help).toContain("⌊推进前当前SAN÷2⌋＋随机0～5");
    expect(html).not.toContain('class="workstation-notes"');
    expect(html).not.toContain('data-workstation-note="review"');
    expect(html).toContain('data-help-context="workstation"');
  });

  it("shows lab funding first and lets the player pay the experiment remainder", () => {
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
      expect(button).toContain(`自付${labCost - funding}金币`);
      expect(button.replace(/<[^>]*>/g, "")).toContain(`金币-${labCost - funding}`);
      expect(button).toContain('data-action="research-paper"');
      expect(button).not.toContain('disabled aria-disabled="true"');
    }
    const broke = { ...funded, advisorProgressState: { ...funded.advisorProgressState, funding: 1 } };
    const brokeButton = renderApp(broke, createDefaultAccountProfile(), { activePlayTab: "workstation" })
      .match(/<button[^>]*workstation-paper-action-btn is-experiment[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(brokeButton).toContain("金币不足，需自付 2");
    expect(brokeButton).toContain('disabled aria-disabled="true"');
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
    const life = getHelpText({ activePlayTab: "shop", activeShopTab: "life" });
    const rest = getHelpText({ activePlayTab: "shop", activeShopTab: "rest" });

    expect(coffee).toContain("无需咖啡机也能自动续费");
    expect(coffee).toContain("SAN已满时当月跳过");
    expect(coffee).not.toContain("冰美式可直接购买，SAN+2");
    expect(gear).toContain("详细结算见科研提示");
    expect(gear).not.toContain("自行车");
    expect(life).toContain("事件和审稿人影响也包括在内");
    expect(life).not.toContain("夏季（公历6–8月）");
    expect(rest).toContain("选定后不能直接改选");
    expect(rest).toContain("出售并重新购买后可重新选择");
    expect(rest).not.toContain("休息效果+3");
  });

  it("keeps citation rules in results help and statistics in the main panel", () => {
    const html = renderApp(createResearchState(), createDefaultAccountProfile(), { activePlayTab: "research" });
    const notes = getHelpText({ activePlayTab: "research" });
    expect(getPlayHelpContext({ activePlayTab: "research" }).pages).toHaveLength(4);
    const noteIndex = html.indexOf('data-help-context="research"');
    const summary = html.match(/<div class="citation-venue-grid research-global-summary"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(summary.match(/class="citation-venue-cell"/g)).toHaveLength(7);
    expect(summary).not.toContain("<details");
    expect(html).not.toContain('class="research-mechanism-notes"');
    expect(html).not.toContain('data-research-note="citation"');
    expect(noteIndex).toBeGreaterThan(html.indexOf('class="play-right-rail'));
    expect(notes).toContain("会议论文在开会、挂arXiv或VALSE展示海报后开始被引");
    expect(notes).toContain("期刊接收后直接开始");
    expect(notes).toContain("原会议的Oral/Best加成仍等该会议举办后生效");
    expect(notes).toContain("论文公开后才开始被引");
    expect(notes).toContain("每月引用增长=当前分×0.05×总引用倍率");
    expect(notes).toContain("小数累积满1才增加引用");
    expect(notes).toContain("未公开时引用倍率为0");
    expect(notes).not.toContain("Poster/Spotlight×1");
    expect(notes).toContain("GitHub增加的是当前分，录用分不变");
    expect(notes).toContain("当前分每4个月衰减10%");
    expect(notes).toContain("未公开也衰减");
    expect(notes).toContain("向上取整，最低0");
    expect(notes).toContain("先算引用再扣分");
    expect(notes).toContain("录用分和科研分不变");
    expect(notes).toContain("发表满12个月后，引用达到发表时热度×200可获得ESI高被引");
    expect(notes).toContain("科研分只计一作");
    expect(notes).toContain("h指数和i10指数均包含一作与非一作");
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
