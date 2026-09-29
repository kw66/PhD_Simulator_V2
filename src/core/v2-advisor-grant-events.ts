import { appendMechanismSettlement, createFixedEvent } from "./v2-fixed-events-shared";
import type { AdvisorGrantApplication, PendingEvent } from "./v2-types";

export interface AdvisorGrantResultContext {
  application: AdvisorGrantApplication;
  grantName: string;
  funding: number;
  success: boolean;
  rank: string;
  previousSalary: number;
  salary: number;
}

export function createAdvisorGrantResultEvent(context: AdvisorGrantResultContext): PendingEvent {
  const { application, grantName, success, funding, rank, previousSalary, salary } = context;
  const academician = application.id === "academician";
  const title = academician ? "导师增选结果" : "导师基金结果";
  const chainId = `advisor-grant-${application.calendarYear}-${application.id}`;
  const salaryGain = salary - previousSalary;
  const settlement = success
    ? [`科研经费 +${funding}`, `导师晋升${rank}`, ...(salaryGain > 0 ? [`每月补助 +${salaryGain}（${previousSalary}→${salary}金币，下月起）`] : [])].join("；")
    : "无事发生";
  const result = createFixedEvent({
    id: `${chainId}-result`,
    title: `${title} ➜ 等待消息 ➜ ${success ? academician ? "当选院士" : "好消息" : "没有上榜"}`,
    chainId,
    stage: "result",
    description: appendMechanismSettlement(success
      ? [
          academician
            ? "组会还没开始，导师先把手机放到桌上，笑着说：“名单出了，我当选了。”你跟着大家鼓掌，忽然觉得前阵子反复核对的那几页成果清单，终于有了点分量。"
            : `组会刚坐下，导师就笑着宣布：“今年的${grantName}中了，大家这阵子辛苦了。”你愣了一下才跟着鼓掌，脑子里先闪过的不是项目名称，而是那张改到看不出第一版模样的技术路线图。`,
          `导师接着说，${rank}的手续也办好了，下个月按新标准发补助。经费到账后，实验室总算宽裕了一些。你和旁边的同学对视一眼：横向的活，暂时可以少赶一点了。`,
        ].join("\n\n")
      : [
          `你是听组里的同学说起，才知道${academician ? "这轮增选" : `今年的${grantName}`}没上榜。组会上导师照常翻开进度表，问实验跑到哪了，谁也没主动提那份名单。`,
          "你把申请材料收进文件夹，没删，兴许明年还用得上。桌边的横向项目交付表倒是不用收，原定周五的截止日期，一天也没往后挪。",
        ].join("\n\n"), settlement),
    completionLog: success ? `${academician ? "导师当选院士" : `${grantName}获批`}；${settlement}` : `${grantName}${academician ? "增选未通过" : "未获批"}；无事发生`,
    choices: [{
      id: `${chainId}-finish`,
      label: "知道了",
      outcome: settlement,
      effects: { advisorGrantResult: application },
    }],
  });
  const decision = createFixedEvent({
    id: `${chainId}-act2`,
    title: `${title} ➜ 等待消息`,
    chainId,
    stage: "act2",
    description: [
      academician
        ? "你翻出当时核对的成果清单，文章标题、年份、作者顺序，一项项查得眼睛发酸。材料交上去之后，这件事就从大家的待办里消失了，却没从心里消失。"
        : `三月赶${grantName}申请，你们补实验、查文献，导师反复改“研究内容”和“关键问题”。文件名从“终稿”变成“终稿_再改”，真正提交的那版，名字反而最朴素。`,
      success
        ? "本子里最有底气的图，都是大家攒下的成果。这回能成，租卡和设备就有了着落，补助或许也能涨。不过消息没落地，先别把下个月的饭钱都算进去。"
        : "你想起交材料前还在补的那组实验，总觉得前期依据薄了点。可名单没确认，谁也说不准。你把手机扣在桌上，决定先别追着导师问——他这几天回消息，比平时还简短。",
    ].join("\n\n"),
    choices: [{ id: `${chainId}-wait`, label: "继续", outcome: "留意组里的消息。", effects: { enqueueEvents: [result] } }],
  });
  return createFixedEvent({
    id: `${chainId}-act1`,
    title,
    chainId,
    description: [
      academician
        ? "八月，群里开始转发院士增选的消息。你想起前阵子帮导师整理材料，光是把各处的成果清单对齐，就和同学核了好几轮。"
        : `八月，工位旁有人小声问：“今年基金是不是快出结果了？”你想起春天帮导师赶${grantName}本子，白天跑实验，晚上把图往模板里塞，连做梦都在调箭头的位置。`,
      "你点开课题组群，还没有新通知。聊天记录往上一翻，当初催大家交材料的消息居然还在，后面整整齐齐跟着一排“收到”。",
    ].join("\n\n"),
    choices: [{ id: `${chainId}-continue`, label: "继续", outcome: "回想申请时的准备。", effects: { enqueueEvents: [decision] } }],
  });
}
