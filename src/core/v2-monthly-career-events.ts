import { gameRandom } from "./v2-game-random";
import { randomOutcome } from "./v2-event-choice-random";
import {
  CAREER_DEFINITIONS,
  getCareerAbility,
  getCareerCandidates,
  getCareerSuccessChance,
  type CareerJobDefinition,
  type CareerOffer,
  type CareerType,
} from "./v2-career-rules";
import { getActualSanChange } from "./v2-sanity-rules";
import { quoteSanPayment } from "./v2-role-talent-costs";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export const CAREER_INTERVIEW_SAN_COST: Record<CareerType, number> = {
  internet: 6,
  stateOwned: 3,
  civilService: 6,
  academic: 4,
};

const CAREER_ORDER: CareerType[] = ["internet", "stateOwned", "civilService", "academic"];

const CAREER_SCENES: Record<CareerType, {
  search: string;
  prepare: string;
  interview: string;
  accepted: string;
  rejected: string;
}> = {
  internet: {
    search: "你把简历里的实验和代码改成能让招聘团队看懂的项目经历。原本写给审稿人的一页方法介绍，删改几次，才勉强装进两行。",
    prepare: "几份技术岗的要求看着相似，细读却各有侧重。你翻出旧项目，试着讲清自己解决过什么问题，而不只是报出模型名字。",
    interview: "技术面试从你简历上的一项实验问起。面试官追着问失败的尝试和后来如何排查，你在草稿纸上画出数据流，才把那段经历讲完整。",
    accepted: "晚上，邮箱里终于出现了录用通知。你又点开附件确认了一遍岗位和待遇，才敢把消息告诉家里。",
    rejected: "几天后邮件来了，措辞客气，却没有下一轮。你把被追问到卡住的地方记在简历旁，准备下次讲得更清楚。",
  },
  stateOwned: {
    search: "你打开就业网的公告附件，专业目录、学历要求和材料模板各在不同的页面。导师签过字的证明也要重新扫描，光整理文件就占了半个晚上。",
    prepare: "你逐条核对岗位要求，再把科研经历写进报名材料。某些项目在论文里只需一句话，在这里却要说明自己具体负责了什么。",
    interview: "笔试结束后，你带着材料走进面试室。考官问起团队协作和项目推进，你挑了一次真正参与的经历讲，尽量不把组会上的术语原样搬过去。",
    accepted: "录用通知比约定的时间晚来了一天。你看到名字后先松了口气，又仔细核对聘用条件，才把邮件存进招聘邮件文件夹。",
    rejected: "名单公布时，你从头到尾看了两遍，没有找到自己的名字。你合上页面，想起面试里那道没答透的项目问题。",
  },
  civilService: {
    search: "招聘群里有人发了职位表。你一边筛专业和学历，一边把组会日程挪开，给行测和申论留出完整的练习时间。",
    prepare: "职位表缩到只剩几行，你又把报考要求读了一遍。名额有限，岗位越靠上，对笔试和面试的把握就越不能只靠临场发挥。",
    interview: "行测交卷时，你还惦记着一道没算完的题。面试里又被问到如何协调不同意见，你停了半拍，才把答案从熟悉的实验室场景里抽出来。",
    accepted: "公示名单上出现了你的名字。你对着准考证核了一遍，给家里打电话时，才发现自己一直捏着那张已经皱了的纸。",
    rejected: "成绩和名单都出了，你离录用线还差一截。合上网页前，你把这次失分最多的部分记下来，免得下回又在同一处赶时间。",
  },
  academic: {
    search: "你翻着各学院的招聘启事，把研究计划从论文的“未来工作”里一点点展开。写到未来三年的方向时，你第一次认真问自己还想追哪个问题。",
    prepare: "岗位名称之外，各学院更关心你准备怎样独立开展研究。你把论文、项目经历和下一步计划排在一起，删掉几句听起来宏大却说不清如何做的话。",
    interview: "学术报告讲到一半，评委打断你，追问结果能否推广到另一类数据。你把投影退回实验设置那页，解释哪些结论已经验证，哪些仍需要时间。",
    accepted: "学院的邮件终于到了。你读完聘任条件，又回头看了看自己那份研究计划；几个月前写下的设想，忽然有了继续做下去的地方。",
    rejected: "学院的回复很简短。你想起报告后那场讨论，知道有些方向值得继续补强，只是这次还没能说服他们。",
  },
};

function describeProspect(chance: number): string {
  if (chance >= 70) return "你已有的经历与要求贴得很近，准备起来心里比较有底";
  if (chance >= 45) return "要求大致能对上，能否讲好关键经历还要看面试";
  if (chance >= 20) return "有几项要求需要你在面试里仔细解释";
  if (chance > 5) return "能对上的经历不多，投出去算是一次冲刺";
  return "要求几乎条条都很硬，你知道这一投胜算很小";
}

function describeListing(job: CareerJobDefinition, chance: number): string {
  const terms = job.compensation ? `待遇栏写着${job.compensation}`
    : job.detail ? `公告还注明“${job.detail}”` : "公告列出了详细的招录要求";
  return `${job.name}的${terms}，${describeProspect(chance)}`;
}

function drawExperience(random: () => number): number {
  return 5 + Math.floor(Math.max(0, Math.min(0.999999, random())) * 6);
}

function makeOffer(job: CareerJobDefinition, score: number): CareerOffer {
  return {
    type: job.type,
    jobId: job.id,
    name: job.name,
    threshold: job.threshold,
    score,
    ...(job.detail ? { detail: job.detail } : {}),
    ...(job.compensation ? { compensation: job.compensation } : {}),
  };
}

function createResultEvent(
  state: GameState,
  chainId: string,
  type: CareerType,
  job: CareerJobDefinition,
  score: number,
  success: boolean,
  experienceGain: number,
  sanChange: number,
): PendingEvent {
  const existing = Object.values(state.careerOffers).find((entry) => entry !== undefined);
  const offer = makeOffer(job, score);
  const scene = CAREER_SCENES[type];
  const summary = success
    ? `${scene.accepted}${job.compensation ? `邮件写明${job.compensation}。` : ""}${existing ? `你已经留着${existing.name}的 offer，手里只能保留一份，需要在两个去向间做选择。` : "你把通知放在桌上，想好再回复。"}`
    : `${scene.rejected}${existing ? `之前拿到的${existing.name} offer 还在，你暂时不用急着做决定。` : ""}`;
  const outcome = `${CAREER_DEFINITIONS[type].name}能力 +${experienceGain}；SAN ${sanChange}；${success ? "面试通过" : "面试未通过"}`;
  const baseEffects = {
    achievementFacts: success ? [`offer:${job.id}`] : [],
    san: sanChange,
    careerRecruitment: { totalMonths: state.totalMonths, type, experienceGain },
  };
  const choices: EventChoice[] = success ? [
    {
      id: existing ? "replace-offer" : "accept-offer",
      label: existing ? "替换旧 offer" : "接受 offer",
      outcome: `${outcome}；获得${job.name} offer`,
      effects: { ...baseEffects, careerRecruitment: { ...baseEffects.careerRecruitment, offer } },
    },
    {
      id: existing ? "keep-offer" : "decline-offer",
      label: existing ? "保留旧 offer" : "放弃 offer",
      outcome: `${outcome}；${existing ? `保留${existing.name} offer` : "未保留 offer"}`,
      effects: baseEffects,
    },
  ] : [{ id: "confirm", label: "确定", outcome, effects: baseEffects }];
  return {
    id: `${chainId}-${type}-${job.id}-result`,
    title: `找工作 ➜ ${CAREER_DEFINITIONS[type].name}岗位 ➜ 面试结果`,
    description: [
      `你投了${job.name}。从投递到笔面试，邮箱和手机都被你看得比平时勤。${scene.interview}`,
      summary,
      `机制结算\n${outcome}`,
    ].join("\n\n"),
    source: "career", blocking: true, deadlineMonths: 0, chainId, stage: "result", choices,
  };
}

function createDirectionEvent(
  state: GameState,
  chainId: string,
  type: CareerType,
  random: () => number,
): PendingEvent {
  const score = getCareerAbility(state, type);
  const baseCost = CAREER_INTERVIEW_SAN_COST[type];
  const sanChange = getActualSanChange(-baseCost, state.month, state.eventSupport, state.buffs);
  const candidates = getCareerCandidates(state, type);
  const choices: EventChoice[] = candidates.map((job) => {
    const chance = getCareerSuccessChance(type, score, job);
    const success = random() * 100 < chance;
    const experienceGain = drawExperience(random);
    const result = createResultEvent(state, chainId, type, job, score, success, experienceGain, sanChange);
    return {
      id: `apply-${job.id}`,
      ...randomOutcome(),
      label: job.name,
      disabledReason: !quoteSanPayment(state, -sanChange).allowed ? `SAN 不足，需要 ${-sanChange}` : undefined,
      outcome: `应聘${job.name}，结果待公布`,
      effects: { enqueueEvents: [result] },
    };
  });
  return {
    id: `${chainId}-${type}-choice`,
    title: `找工作 ➜ ${CAREER_DEFINITIONS[type].name}岗位`,
    description: [
      CAREER_SCENES[type].search,
      `${CAREER_SCENES[type].prepare}你把几份公告摊开，留意到这些去向：${candidates.map((job) => describeListing(job, getCareerSuccessChance(type, score, job))).join("；")}。`,
      "你在日历上给笔试和面试留出一段时间，盯着最后几个岗位名称看了会儿，才决定投哪一份。",
    ].join("\n\n"),
    source: "career", blocking: true, deadlineMonths: 0, chainId, stage: "act2", choices,
  };
}

export function createCareerRecruitmentEvent(
  state: GameState,
  random: () => number = gameRandom,
  includeClosedDirections = false,
): PendingEvent {
  const chainId = `career-recruitment-${state.totalMonths}`;
  const available = CAREER_ORDER.filter((type) => (includeClosedDirections || CAREER_DEFINITIONS[type].activeMonths.includes(state.month))
    && (type !== "academic" || state.degree === "phd"));
  return {
    id: chainId, title: "找工作", source: "career", blocking: true, deadlineMonths: 0, chainId, stage: "act1",
    description: [
      available.length
        ? "临近毕业，招聘群忽然比组会群还热闹。你把论文和项目经历整理进简历，翻出去年拍的证件照，发现文件名还叫“最终版2”。📄这次总得认真改一改。"
        : "毕业就在眼前，招聘群里的消息却慢慢少了。你翻出之前改过的简历，再看一眼日历：📄几个方向今年的投递时间都过去了。",
      available.length
        ? `新的岗位信息接连发来，你一边核对要求，一边看着日历里没划掉的实验和毕业材料。${Object.keys(state.careerOffers).length ? "手上已有回复，但你还想看看有没有更合适的去向。" : "眼下还没有着落，你开始在几个方向之间犹豫。"}投递、笔试、面试都得花时间，这个月只够认真准备一个方向。`
        : "到了6月，几个方向的招聘窗口都已结束。你把简历和毕业材料分开整理，这个月先把眼前的事做完。",
    ].join("\n\n"),
    choices: [
      ...available.map((type): EventChoice => ({
        id: `choose-${type}`, label: CAREER_DEFINITIONS[type].name,
        outcome: `查看${CAREER_DEFINITIONS[type].name}岗位`,
        effects: { enqueueEvents: [createDirectionEvent(state, chainId, type, random)] },
      })),
      { id: "rest", label: "本月休息", outcome: "本月不参加招聘", effects: { careerRecruitment: { totalMonths: state.totalMonths } } },
    ],
  };
}

export function shouldScheduleCareerRecruitment(state: GameState): boolean {
  return state.phase === "playing" && state.ending === null
    && state.month >= 1 && state.month <= 10
    && state.year === (state.degree === "master" ? 3 : 6)
    && state.careerLastRecruitmentTotalMonths !== state.totalMonths
    && !state.eventQueue.some((event) => event.chainId === `career-recruitment-${state.totalMonths}`);
}
