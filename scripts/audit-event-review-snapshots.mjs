import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = path.resolve(repoRoot, "..");
const reviewFiles = [
  "研究生模拟器V2_事件文案审阅.html",
  "研究生模拟器V2_事件逻辑审阅.html",
];
const deferableEventNames = [
  "毕设辅导",
  "帮忙审稿",
  "导师项目",
  "导师经费",
  "不断学习",
  "同门合作",
  "师兄/师姐指导",
  "署名风波",
  "指导师弟/师妹",
  "游戏放松",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readReport(fileName) {
  const filePath = path.join(desktopRoot, fileName);
  const html = fs.readFileSync(filePath, "utf8");
  const match = html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/);
  assert(match, `${fileName}: missing report-data`);
  return { html, data: JSON.parse(match[1]) };
}

for (const fileName of reviewFiles) {
  const { html, data } = readReport(fileName);
  const serialized = JSON.stringify(data);
  const names = data.eventGroups.map((group) => group.name);
  assert(!names.some((name) => name.includes("留言")), `${fileName}: deleted message event remains`);
  assert(!names.includes("会场活动"), `${fileName}: merged conference activity remains as a separate event`);
  assert(!names.includes("疾病来袭"), `${fileName}: old combined illness event remains`);
  for (const illnessName of ["肚子虚弱", "流感来袭", "高烧不退"]) {
    assert(names.includes(illnessName), `${fileName}: missing illness event ${illnessName}`);
  }
  const review = data.eventGroups.find((group) => group.name === "帮忙审稿");
  const reviewData = JSON.stringify(review);
  assert(reviewData.includes("额外看论文 2 次"), `${fileName}: peer review does not execute two shared reading actions`);
  assert(reviewData.includes("阅读累计 +2"), `${fileName}: peer review reading count is stale`);
  assert(reviewData.includes("不消耗本月行动点"), `${fileName}: peer review action-point rule is missing`);
  assert(reviewData.includes("不应用科研杂活减免"), `${fileName}: peer review still claims research-chore discount`);
  assert(!reviewData.includes("阅读累计 +1"), `${fileName}: stale peer-review reading count remains`);
  assert(!reviewData.includes("SAN -3"), `${fileName}: stale peer-review SAN cost remains`);
  assert(!reviewData.includes("获得审稿灵感"), `${fileName}: stale peer-review inspiration branch remains`);
  for (const eventName of ["导师约谈", "同门合作", "师兄/师姐指导", "指导师弟/师妹", "数据丢失"]) {
    const eventData = JSON.stringify(data.eventGroups.find((group) => group.name === eventName));
    assert(eventData.includes("科研杂活减免"), `${fileName}: ${eventName} research-chore rule is missing`);
  }
  if (data.mode === "logic") {
    assert(serialized.includes("科研杂活减免后最终 SAN -2 / -1 / 0 / 0"), `${fileName}: zero-cost chore tiers are stale`);
    assert(!serialized.includes("科研杂活减免后最终 SAN -2 / -1 / -1 / -1"), `${fileName}: minimum-one chore range remains`);
    const teamBuildingData = JSON.stringify(data.eventGroups.find((group) => group.name === "组内团建"));
    assert(teamBuildingData.includes("基础胜率固定为 40%"), `${fileName}: badminton base win rate is stale`);
    assert(teamBuildingData.includes("首次参加胜率 40%"), `${fileName}: poker initial win rate is stale`);
    assert(!teamBuildingData.includes("10% / 20% / 30% / 40%"), `${fileName}: stale SAN-tier badminton rates remain`);
    assert(!teamBuildingData.includes("首次参加胜率 50%"), `${fileName}: stale poker initial win rate remains`);
  }
  for (const [illnessName, multiplier] of [["肚子虚弱", "1.5"], ["流感来袭", "2"], ["高烧不退", "2.5"]]) {
    const illness = data.eventGroups.find((group) => group.name === illnessName);
    assert(
      JSON.stringify(illness).includes(`主动操作 SAN ×${multiplier}`),
      `${fileName}: ${illnessName} active-operation Buff is stale`,
    );
  }
  for (const eventName of deferableEventNames) {
    const event = data.eventGroups.find((group) => group.name === eventName);
    const eventData = JSON.stringify(event);
    assert(event?.trigger.includes("可延后一个月处理"), `${fileName}: ${eventName} deadline is stale`);
  }
  const mentorEvent = data.eventGroups.find((group) => group.name === "师兄/师姐指导");
  assert(mentorEvent?.status === "active", `${fileName}: mentor guidance status is stale`);
  assert(mentorEvent?.trigger.includes("科研 >= 6 或社交 >= 6"), `${fileName}: mentor guidance unlock condition is stale`);
  assert(mentorEvent?.trigger.includes("随后随机抽取"), `${fileName}: mentor guidance must use the normal random draw`);
  const assignedMentorEvent = data.eventGroups.find((group) => group.name === "指导师弟/师妹");
  assert(assignedMentorEvent?.status === "active", `${fileName}: junior guidance status is stale`);
  assert(assignedMentorEvent?.trigger.includes("已有已发表论文"), `${fileName}: junior guidance unlock condition is stale`);
  const dataLossEvent = data.eventGroups.find((group) => group.name === "数据丢失");
  assert(dataLossEvent?.status === "active", `${fileName}: data-loss status is stale`);
  assert(dataLossEvent?.trigger.includes("存在有进度的草稿"), `${fileName}: data-loss trigger is stale`);
  assert(!serialized.includes("毕业留言"), `${fileName}: deleted message data remains`);
  assert(!serialized.includes("疾病来袭"), `${fileName}: old combined illness copy remains`);
  assert(!serialized.includes("论文参会会场活动"), `${fileName}: old paper conference activity title remains`);
  assert(!serialized.includes("年会活动"), `${fileName}: old CCIG activity title remains`);
  assert(!serialized.includes("第 7 月只允许合作类事件"), `${fileName}: old month-7 pool remains`);
  assert(!serialized.includes("小张"), `${fileName}: old fixed junior name remains`);
  assert(!serialized.includes("拜入门下：SAN -3"), `${fileName}: stale mentor SAN cost remains`);
  assert(!serialized.includes("外出实习"), `${fileName}: old year-summary label remains`);
  assert(!html.includes("normalizeCopyReviewData"), `${fileName}: runtime snapshot normalizers remain`);
  assert(!html.includes("__EVENT_REVIEW_DATA__"), `${fileName}: temporary snapshot bridge remains`);
  assert(
    data.factsSource.includes("工作栏看论文及其月度行动点已接入"),
    `${fileName}: reading-system status is stale`,
  );

  const scholarship = data.eventGroups.find((group) => group.name === "国奖评选");
  const mentor = data.eventGroups.find((group) => group.name === "指导新生");
  const phdDecision = data.eventGroups.find((group) => group.name === "转博抉择");
  assert(scholarship?.trigger.includes("玩家可申报或继续积累成果"), `${fileName}: scholarship trigger is stale`);
  const scholarshipData = JSON.stringify(scholarship);
  assert(
    data.mode === "copy"
      ? scholarshipData.includes("准备材料并申报") && scholarshipData.includes("暂不申报")
      : scholarshipData.includes("实际分数线") && scholarshipData.includes("科研分基线"),
    `${fileName}: scholarship scoring presentation is stale`,
  );
  assert(!scholarshipData.includes("积分页面"), `${fileName}: stale scholarship score-page copy remains`);
  assert(
    mentor?.trigger === "转博后博士第一年入学的 9 月",
    `${fileName}: mentor trigger is stale`,
  );
  assert(
    !JSON.stringify(mentor).includes("处理期限"),
    `${fileName}: mentor assignment must be due this month`,
  );
  assert(
    !JSON.stringify(mentor).includes("候选") && !JSON.stringify(mentor).includes("选择其中"),
    `${fileName}: mentor assignment still exposes candidate selection`,
  );
  assert(
    JSON.stringify(phdDecision).includes("读博压力")
      && JSON.stringify(phdDecision).includes("SAN +1")
      && JSON.stringify(phdDecision).includes("SAN -1"),
    `${fileName}: PhD pressure cost is stale`,
  );
  if (data.mode === "copy") {
    const phdVariantNames = phdDecision?.variants.map((variant) => variant.name) ?? [];
    assert(
      JSON.stringify(phdVariantNames) === JSON.stringify([
        "第2年｜未达到门槛",
        "第2年｜达到门槛",
        "第3年｜未达到门槛",
        "第3年｜达到门槛",
      ]),
      `${fileName}: PhD decision branches are incomplete or duplicated`,
    );
    assert(html.includes("renderPhdDecisionBranches"), `${fileName}: PhD decision branches are not rendered together`);
    assert(html.includes("2 个年份 · 4 个条件分支"), `${fileName}: PhD decision branch count is unclear`);
  }
  for (const name of ["署名风波", "显卡故障"]) {
    const group = data.eventGroups.find((item) => item.name === name);
    assert(group?.trigger.includes("当学年尚未使用"), `${fileName}: ${name} yearly-use rule is stale`);
    assert(!group?.trigger.includes("允许同一学年重复出现"), `${fileName}: ${name} still claims repeatability`);
  }

  if (fileName.includes("文案审阅")) {
    const forbiddenCopyTokens = [
      "眼下的研究还没有做到让自己踏实",
      "开始了没日没夜的赶工",
      "科研能力有了质的飞跃",
      "你感觉茅塞顿开",
      "这次交流让你收获颇丰",
      "你在会场选择了：",
      "你被问得哑口无言",
      "导师全程认真听完",
      "推理闭环成立",
      "安抚费用",
      "赶 deadline",
    ];
    for (const token of forbiddenCopyTokens) {
      assert(!serialized.includes(token), `${fileName}: stale formulaic copy remains: ${token}`);
    }
    const advisorTalk = data.eventGroups.find((group) => group.name === "导师约谈");
    const advisorTalkData = JSON.stringify(advisorTalk);
    for (const requiredBranch of [
      "科研 < 6",
      "科研 ≥ 6",
      "导师好感 < 6",
      "导师好感 ≥ 6",
      "汇报进展",
      "当面请教",
      "安排实习",
      "谈话结束",
    ]) {
      assert(advisorTalkData.includes(requiredBranch), `${fileName}: advisor talk is missing branch ${requiredBranch}`);
    }
    assert(html.includes("renderAdvisorTalkBranches"), `${fileName}: advisor talk branches are not rendered together`);
    assert(html.includes("3 个选项 · 6 个条件结果"), `${fileName}: advisor talk branch count is unclear`);
    assert(
      html.includes("处理期限|随机人物说明|机制说明"),
      `${fileName}: copy review does not filter technical deadline/sample metadata`,
    );
    assert(!html.includes('data.mode === "copy" ? group.variants.slice(0, 1) : group.variants'), `${fileName}: copy review hides variants`);
    const funding = data.eventGroups.find((group) => group.name === "导师经费");
    const fundingData = JSON.stringify(funding);
    assert(
      fundingData.includes("所有 AI 模型都显示为 0 金币"),
      `${fileName}: AI reimbursement result copy is missing`,
    );
    for (const requiredFundingRule of [
      "下次购买或升级显卡",
      "机械键盘",
      "2K 显示器",
      "办公椅",
      "金币 +3",
      "金币 +5",
      "金币 +7",
      "金币 +9",
    ]) {
      assert(fundingData.includes(requiredFundingRule), `${fileName}: funding rule is missing ${requiredFundingRule}`);
    }
    for (const retiredFundingRule of ["判定次数：科研", "永久实验 +累计成功次数", "永久想 idea +1｜永久写作 +1｜SAN 上限 +1"]) {
      assert(!fundingData.includes(retiredFundingRule), `${fileName}: retired funding rule remains ${retiredFundingRule}`);
    }
    assert(
      data.mode === "logic"
        ? fundingData.indexOf("选项 3：装修工位") < fundingData.indexOf("选项 4：报销 AI 费用")
        : fundingData.indexOf("3. 装修工位") < fundingData.indexOf("4. 报销 AI 费用"),
      `${fileName}: AI reimbursement is not the final funding option`,
    );

    for (const careerName of ["互联网", "央国企", "公务员", "教职"]) {
      const career = data.eventGroups.find((group) => group.name === careerName);
      assert(
        JSON.stringify(career).includes(`这个月你没有继续投入「${careerName}」方向`),
        `${fileName}: ${careerName} zero-progress copy still claims work was completed`,
      );
    }
    const thesis = data.eventGroups.find((group) => group.name === "毕业论文");
    assert(
      JSON.stringify(thesis).includes("这个月你没有给毕业论文安排额外时间"),
      `${fileName}: thesis zero-progress copy still claims work was completed`,
    );

    const copyPattern = /(?:^|\n)\s*【阶段 (\d+)】([^\r\n]+)\r?\n(?:\s*完成日志：[^\r\n]*\r?\n)?\s*具体文案：\r?\n([\s\S]*?)(?=\r?\n\s*选项：)/gu;
    for (const group of data.eventGroups) {
      for (const variant of group.variants) {
        for (const match of variant.content.matchAll(copyPattern)) {
          const stageTitle = match[2]?.trim() ?? group.name;
          if (stageTitle.includes("导师信息")) continue;
          const sentenceCount = (match[3]?.match(/[。！？]|…+/gu) ?? []).length;
          assert(
            sentenceCount >= 3,
            `${fileName}: ${group.name} / ${variant.name} / ${stageTitle} has fewer than three sentences`,
          );
        }
      }
    }
  }
}

const forbiddenSourceTokens = [
  "midterm-message",
  "drawWeightedTriplet",
  "_legacyNatureExtensionYear",
  "isFirstSemester",
  "year-summary-intern",
  "willTransferPhDYear3",
];
const sourceFiles = [];
function collectTypeScriptFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectTypeScriptFiles(entryPath);
    else if (entry.name.endsWith(".ts")) sourceFiles.push(entryPath);
  }
}
collectTypeScriptFiles(path.join(repoRoot, "src"));
const source = sourceFiles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
for (const token of forbiddenSourceTokens) {
  assert(!source.includes(token), `source still contains removed token: ${token}`);
}

console.log(`Event review audit passed: ${reviewFiles.length} snapshots, ${sourceFiles.length} source files.`);
