import { describe, expect, it, vi } from "vitest";

import { renderApp } from "../src/app/v2-render";
import { getPlayHelpContext } from "../src/app/v2-play-help";
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
  it("points players to current lover reward controls and the shop gift notice", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("进度条和卡片底部提示显示当前路线效果");
    expect(help).toContain("进度条和卡片底部提示显示当前路线效果");
    expect(help).toContain("礼物券优先用于手动商店购买");
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
      expect(getHelpText(context)).not.toMatch(/旧版|新版|不再|实现细节|走同一事件流程|仅同学自主科研间隔|三项合计分快照/);
    }
  });

  it("documents lover route formulas, passive gains and the shared monthly date limit", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("玩耍、学习、购物各有100进度，每月共用一次约会");
    expect(help).toContain("基础消耗依次为金币-2、SAN-4、金币-3，实际见按钮");
    expect(help).toContain("科研与亲密上限均为20");
    expect(help).toContain("玩耍=⌊(亲密+你的社交)/2⌋");
    expect(help).toContain("学习=⌊(恋人科研+你的科研)/2⌋");
    expect(help).toContain("购物=⌊亲密/2⌋+10");
    expect(help).toContain("活泼恋人玩耍+亲密、学习+⌊亲密/2⌋");
    expect(help).toContain("聪慧恋人学习+亲密、玩耍+⌊亲密/2⌋");
    expect(help).toContain("购物只靠手动约会");
    expect(help).toContain("恋爱次月起");
    expect(help).toContain("恋人有活泼和聪慧两种类型");
    expect(help).toContain("初始属性：活泼恋人科研3～6、亲密9～12；聪慧恋人科研9～12、亲密3～6");
    expect(help).not.toMatch(/没有一次性奖励|不再每月自动扣费|固定每月金币奖励/);
  });

  it("explains separate three-cycle lover rewards and gift purchase priority", () => {
    const context = getPlayHelpContext({ activePlayTab: "relationship" });
    const pages = context.pages.filter((page) => page.title.startsWith("恋人"));
    expect(pages).toHaveLength(2);
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("SAN+6");
    expect(help).toContain("论文三项分数永久+1");
    expect(help).toContain("下个月SAN消耗-1，含事件与审稿等即时损失，不影响固定月耗和恢复");
    expect(help).toContain("礼物券+1、亲密+2");
    expect(help).toContain("没有其他可购买项目时才用于自动续费");
  });

  it("distinguishes fellow research every two months from monthly cooperation and review", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("此后每2个月科研一次");
    expect(help).toContain("审稿3个月");
    expect(help).not.toContain("仅同学自主科研间隔2个月");
    expect(help).toContain("每位同学每月可主动协作一次");
    expect(help).toContain("默契也会自动推进协作进度");
  });

  it("documents mentor funding, paper contributions and the annual grant timeline", () => {
    const help = getHelpText({ activePlayTab: "relationship" });
    expect(help).toContain("科研积累从20开始");
    expect(help).toContain("经费上限20");
    expect(help).toContain("基础SAN-5、经费+1，实际消耗见按钮");
    expect(help).toContain("人际SAN减免（含Gemini3及后续型号）适用于同学、导师和恋人");
    expect(help).toContain("每月先结算导师收入，再消耗经费");
    expect(help).toContain("科研积累按5%自然增长，增长量下取整");
    expect(help).toContain("经费不足时暂停自然增长");
    expect(help).toContain("论文固定科研分会增加导师积累");
    expect(help).toMatch(/3月先增长再申请，8月公布结果/);
    expect(help).toContain("讲师限1项，晋升后限2项");
    expect(help).toContain("项目到期释放名额");
    expect(help).toContain("1000且已获杰青");
    expect(help).toContain("获选后每月经费+1");
    for (const [threshold, funding, duration] of [[25, 5, 3], [50, 10, 4], [150, 15, 3], [400, 20, 5]]) {
      expect(help).toContain(`${threshold}+${funding}${duration}年`);
    }
    expect(help).not.toMatch(/科研资源|信任度/);
  });

  it("retains score formulas and review rules across workstation help pages", () => {
    const html = renderApp(createResearchState(), createDefaultAccountProfile(), { activePlayTab: "workstation" });
    const help = getHelpText({ activePlayTab: "workstation" });

    expect(help).toContain("分数格上行是自身分，下行是协作分，右侧总分为六格之和");
    expect(help).toContain("实验需要idea有分，写作需要实验有分");
    expect(help).toContain("基础分=科研能力×随机倍率（0.5～1.5）+随机加分（0～5）");
    expect(help).toContain("本次分=基础分×总倍率+固定分，结果四舍五入");
    expect(help).toContain("更新自身分：原自身+1与本次分，取较大值");
    expect(help).toContain("协作分持续累加，不会被覆盖");
    expect(help).toContain("先合并倍率，再加固定分");
    expect(help).toContain("×1.5算+0.5，×0.8算−0.2");
    expect(help).toContain("两个×1.5合并为×2");
    expect(help).toContain("不额外扣行动点或SAN");
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
    expect(help).toContain("总评≥+2接收，≤−2拒稿");
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
    expect(metrics).toContain('<span class="research-publication-label"><span>Best Paper</span><span>Candidate</span></span><strong>×5</strong>');
  });

  it("retains the zero multiplier before exposure and replaces arXiv with the conference award", () => {
    const paper = attachPaperPublication({ ...createDraftPaper(1, 0, () => 0), status: "published", target: "A" }, 1, "Oral");
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">未开会</span><strong>×0</strong>');
    expect(renderMetrics(paper)).toContain('<span>总引用倍率</span><strong>0</strong>');
    paper.publication!.preprintExposed = true;
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">arXiv</span><strong>×1</strong>');
    paper.conferenceHandled = true;
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">Oral</span><strong>×1.5</strong>');
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
    expect(coffee).toContain("购入咖啡机后提升为SAN+3，并可开启月初自动续费");
    expect(coffee).toContain("SAN已满时，自动续费当月跳过");
    expect(coffee).toContain("金币不足且没有可用于续费的礼物券时，当月暂停续费");
    expect(gear).toContain("显卡和自行车可逐档升级");
    expect(gear).toMatch(/夏季（公历6–8月）.*SAN消耗\+1，遮阳伞可免除/);
    expect(gear).toContain("季节、疾病与恋人玩耍减耗影响所有即时SAN损失，含事件和审稿人影响");
    expect(gear).toContain("最低0，不影响固定月耗和恢复");
    expect(gear).toMatch(/冬季（公历12–2月）.*每月SAN-1，羽绒服可免除/);
    expect(rest).toContain("选定后不能直接换路线");
    expect(rest).toContain("出售并重新购买后可重新选择");
    expect(rest).toContain("SAN+2提升为SAN+5");
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
    expect(notes).toContain("会议开会或挂arXiv后开始被引");
    expect(notes).toContain("期刊接收后直接开始");
    expect(notes).toContain("开会后才启用录用与推广加成");
    expect(notes).toContain("会议开会前挂arXiv，录用/推广部分先按×1");
    expect(notes).toContain("每月引用增长=当前分×0.05×总引用倍率");
    expect(notes).toContain("小数留到下月，累积满1才增加引用");
    expect(notes).toContain("尚未公开时总引用倍率显示0");
    expect(notes).toContain("Poster/Spotlight×1");
    expect(notes).toContain("Oral×1.5");
    expect(notes).toContain("BestPaper/Candidate×5");
    expect(notes).toContain("期刊×1");
    expect(notes).toContain("GitHub增加当前分的25%（增加量向下取整），录用分不变");
    expect(notes).toContain("录用/推广倍率+0.25");
    expect(notes).toContain("Oral从×1.5变为×1.75");
    expect(notes).toContain("当前分每4个月衰减10%");
    expect(notes).toContain("尚未公开也会衰减");
    expect(notes).toContain("向上取整，扣后最低0");
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

    expect(shopHtml.replace(/<[^>]*>/g, "")).toContain("休息动作从 SAN +2 提升为 SAN +5");
    expect(talentHtml).toContain("休息动作从 SAN +2 提升为 SAN +5");
    expect(talentHtml).not.toContain("休息动作改为 SAN +5");
  });
});
