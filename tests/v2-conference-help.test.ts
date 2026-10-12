import { describe, expect, it } from "vitest";
import { getPlayHelpContext, renderPlayHelpPanel, type PlayHelpPage } from "../src/app/v2-play-help";
import { ANNUAL_RESEARCH_HELP_PAGE, ATTRIBUTE_RESISTANCE_HELP_PAGE } from "../src/app/v2-play-help-secondary";

const relationshipHelp = getPlayHelpContext({ activePlayTab: "relationship" });
const talentHelp = getPlayHelpContext({ activePlayTab: "talent", activeTalentTab: "relation" });

function pageText(pages: readonly PlayHelpPage[], title: string): string {
  const page = pages.find((candidate) => candidate.title === title);
  expect(page, title).toBeDefined();
  return `${page!.summary}${page!.body}`.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<");
}

describe("conference and invitation help", () => {
  it("orders short invitation pages after conference attendance and keeps rewards in talent help", () => {
    const titles = relationshipHelp.pages.map((page) => page.title);
    const start = titles.indexOf("会议费用");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(titles.slice(start, start + 6)).toEqual([
      "会议费用", "会场活动", "大牛合作与邀请", "企业交流与邀请", "会场搭讪", "恋人邀请",
    ]);
    const rewardTitles = ["大厂实习", "远程实习", "大牛联培"];
    expect(talentHelp.pages.map((page) => page.title).slice(-3)).toEqual(rewardTitles);
    expect(titles).not.toEqual(expect.arrayContaining(rewardTitles));
    expect(pageText(talentHelp.pages, "大牛联培")).not.toMatch(/第[23]次|科研≥12|无限拒绝/);
    expect(pageText(talentHelp.pages, "大厂实习")).not.toMatch(/第2次|当前参加的是A类|无限拒绝/);
    expect(pageText(relationshipHelp.pages, "大牛合作与邀请")).not.toMatch(/4～6|\/200/);
    expect(pageText(relationshipHelp.pages, "企业交流与邀请")).not.toMatch(/4～6|×1\.25/);
  });

  it("states activity pools without promising an advanced option", () => {
    const text = pageText(relationshipHelp.pages, "会场活动");
    expect(text).toContain("高级活动需社交≥6");
    expect(text).toContain("C类只从低级活动中抽取3个选项");
    expect(text).toContain("B类从高低级混合池抽4个，A类抽5个");
    expect(text).toContain("A／B类不保底高级活动");
  });

  it("explains repeated big-bull invitations and reset on refusal", () => {
    const text = pageText(relationshipHelp.pages, "大牛合作与邀请");
    expect(text).toContain("第2次起与当前大牛合作，社交原始+1，经过抵抗");
    expect(text).toContain("第3次及以后合作时，科研≥12");
    expect(text).toContain("拒绝后换一位大牛，合作计数归0");
    expect(text).toContain("可无限拒绝");
  });

  it("keeps enterprise counts and checks published conference papers or internship experience", () => {
    const text = pageText(relationshipHelp.pages, "企业交流与邀请");
    expect(text).toContain("企业交流第2次起");
    expect(text).toContain("已有A类会议论文，或有实习经历");
    expect(text).toContain("当前没有进行中的实习");
    expect(text).toContain("可无限拒绝，拒绝不清空企业交流计数");
  });

  it("distinguishes extra executions from action point costs and covers lover consequences", () => {
    const text = pageText(relationshipHelp.pages, "会场搭讪");
    expect(text).toContain("选择“异性学者”后，活泼／聪慧各50%");
    expect(text).toContain("活泼：SAN+5");
    expect(text).toContain("聪慧：下次想idea+2分、额外执行2次");
    expect(text).toContain("不额外消耗行动点");
    expect(text).toContain("与同一人第2次搭讪起，社交原始+1，经过抵抗");
    expect(text).toContain("两位学者分别计数");
    const invitation = pageText(relationshipHelp.pages, "恋人邀请");
    expect(invitation).toContain("与同一人搭讪≥3次（含本次），社交≥12且没有恋人时，对方会约你单独见面");
    expect(invitation).toContain("接受活泼恋人：SAN上限+3");
    expect(invitation).toContain("接受聪慧恋人：科研原始+1，经过抵抗");
    expect(invitation).toContain("接受或拒绝后，同类型会场联系人换新、计数归0");
    expect(invitation).toContain("当前恋人亲密原始-6，经过抵抗");
    expect(invitation).toContain("结算后亲密<0则分手");
  });

  it("separates random enterprise offers from the unchanged remote internship", () => {
    const enterprise = pageText(talentHelp.pages, "大厂实习");
    expect(enterprise).toContain("公司与大致方向在邀请第二幕确定，具体岗位和待遇在第三幕确定");
    expect(enterprise).toContain("每月按当时已发表的一作A类论文篇数重新计算");
    expect(enterprise).not.toContain("先乘倍率，再加固定分");
    expect(pageText(getPlayHelpContext({ activePlayTab: "workstation" }).pages, "科研分数计算"))
      .toContain("先合并倍率，再加固定分");
    expect(enterprise).toContain("公司名称不决定工资");
    expect(enterprise).not.toContain("每月SAN消耗4～6");
    const remote = pageText(talentHelp.pages, "远程实习");
    expect(remote).toContain("获准后从次月起持续3个月");
    expect(remote).toContain("固定SAN消耗与即时行动消耗分开结算");
  });

  it("uses one training level and invitation-time citations with a saved one-time reward", () => {
    const text = pageText(talentHelp.pages, "大牛联培");
    expect(text).toContain("使用邀请时的总引用计算，接受时不重算");
    expect(text).toContain("第三幕按具体团队的投入程度确定");
    expect(text).toContain("想idea和写论文获得同一档位的永久加分");
    expect(text).toContain("结果页确认后发放一次");
    const related = [...relationshipHelp.pages, ...talentHelp.pages]
      .map((page) => `${page.summary}${page.body}`).join("\n");
    expect(related).not.toMatch(/两次深入合作|两次深合作|永久关闭|机会剩余|永久各\+5|每满300|保底\+1|最多\+5|预计奖励|min（1\+一作A/);
  });

  it("renders all new rules in short help bodies without tooltip or footer rules", () => {
    for (const context of [relationshipHelp, talentHelp]) {
      const titles = context === relationshipHelp
        ? ["会场活动", "大牛合作与邀请", "企业交流与邀请", "会场搭讪", "恋人邀请"]
        : ["大厂实习", "远程实习", "大牛联培"];
      for (const title of titles) {
        const index = context.pages.findIndex((page) => page.title === title);
        const page = context.pages[index]!;
        expect(page.expandable).not.toBe(true);
        expect((page.body.match(/<p>/g) ?? []).length).toBeLessThanOrEqual(4);
        const html = renderPlayHelpPanel({
          activePlayTab: context === relationshipHelp ? "relationship" : "talent",
          activeTalentTab: "relation",
          isHelpOpen: true,
          helpPageByContext: { [context.key]: index },
        });
        expect(html).toContain(`<div class="play-help-content">${page.body}</div>`);
        expect(html).not.toMatch(/<footer|role="tooltip"|\s(?:title|data-tooltip)=|<details/);
      }
    }
  });

  it("retains the existing pointwise resistance and annual growth pages", () => {
    expect(relationshipHelp.pages).toContain(ATTRIBUTE_RESISTANCE_HELP_PAGE);
    expect(relationshipHelp.pages).toContain(ANNUAL_RESEARCH_HELP_PAGE);
    const resistance = pageText(relationshipHelp.pages, "属性与抵抗");
    expect(resistance).toContain("每1点原始变化先按当前档位减免，再处理下一点");
    expect(resistance).toContain("SAN和金币没有档位抵抗");
    const annual = pageText(relationshipHelp.pages, "年度科研成长");
    expect(annual).toContain("每学年8月底结算，第一学年就有");
    expect(annual).toContain("同学另有自然成长+2，与传承合并后逐点抵抗");
    expect(annual).toContain("默契原始+0/1/2/3");
    expect(annual).toContain("社交原始+⌊人数/2⌋");
  });
});
