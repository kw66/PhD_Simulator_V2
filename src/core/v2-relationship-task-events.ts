import { buildLoverPaperBonusUpdate } from "./v2-lover-progression";
import type { FellowProgressProfile, FellowTaskType, Paper, PendingEvent } from "./v2-types";

function getRewardEligiblePapers(papers: Paper[]): Paper[] {
  return papers.filter((paper) => paper.status !== "reviewing");
}

function getEligibleFellowPapers(taskType: FellowTaskType, papers: Paper[]): Paper[] {
  const eligiblePapers = getRewardEligiblePapers(papers);
  if (taskType === "experiment") {
    return eligiblePapers.filter((paper) => paper.idea > 0);
  }
  if (taskType === "writing") {
    return eligiblePapers.filter((paper) => paper.experiment > 0);
  }
  return eligiblePapers;
}

function getFellowFieldLabel(taskType: FellowTaskType): string {
  switch (taskType) {
    case "idea":
      return "idea";
    case "experiment":
      return "实验";
    case "writing":
      return "写作";
    default:
      return "论文";
  }
}

export function buildAdvisorTaskRewardEvent(input: {
  totalMonths: number;
  completedProjectCount: number;
  paperBonus: number;
  papers: Paper[];
}): PendingEvent | null {
  const eligiblePapers = getRewardEligiblePapers(input.papers);
  if (eligiblePapers.length === 0) {
    return null;
  }

  return {
    id: `advisor-task-reward-${input.totalMonths}-${input.completedProjectCount}`,
    title: "导师项目奖励",
    description: `可把导师项目奖励分配给一篇草稿，论文 idea / 实验 / 写作各 +${input.paperBonus}。`,
    preview: "选择奖励论文",
    source: "system",
    blocking: true,
    deadlineMonths: 0,
    chainId: "advisor-task-reward",
    stage: "result",
    choices: [
      ...eligiblePapers.map((paper) => ({
        id: `paper-${paper.id}`,
        label: `选择 ${paper.title}`,
        outcome: `${paper.title} 的 idea / 实验 / 写作各 +${input.paperBonus}。`,
        effects: {
          paperUpdates: [{
            id: paper.id,
            idea: paper.idea + input.paperBonus,
            experiment: paper.experiment + input.paperBonus,
            writing: paper.writing + input.paperBonus,
            receivedRelationshipBonus: true,
          }],
        },
      })),
      {
        id: "skip",
        label: "跳过",
        outcome: "你决定先不分配这次论文奖励。",
        effects: {},
      },
    ],
  };
}

export function buildFellowTaskRewardEvent(input: {
  totalMonths: number;
  profile: FellowProgressProfile;
  papers: Paper[];
}): PendingEvent | null {
  const eligiblePapers = getEligibleFellowPapers(input.profile.taskType, input.papers);
  if (eligiblePapers.length === 0) {
    return null;
  }

  const fieldLabel = getFellowFieldLabel(input.profile.taskType);
  return {
    id: `fellow-task-reward-${input.totalMonths}-${input.profile.id}-${input.profile.completedTaskCount}`,
    title: "同门任务奖励",
    description: `可把这次同门任务奖励分配给一篇草稿，${fieldLabel} +${input.profile.research}。`,
    preview: "选择奖励论文",
    source: "system",
    blocking: true,
    deadlineMonths: 0,
    chainId: "fellow-task-reward",
    stage: "result",
    choices: [
      ...eligiblePapers.map((paper) => ({
        id: `paper-${paper.id}`,
        label: `选择 ${paper.title}`,
        outcome: `${paper.title} 的 ${fieldLabel} +${input.profile.research}。`,
        effects: {
          paperUpdates: [{
            id: paper.id,
            ...(input.profile.taskType === "idea" ? { idea: paper.idea + input.profile.research } : {}),
            ...(input.profile.taskType === "experiment" ? { experiment: paper.experiment + input.profile.research } : {}),
            ...(input.profile.taskType === "writing" ? { writing: paper.writing + input.profile.research } : {}),
            receivedRelationshipBonus: true,
          }],
        },
      })),
      {
        id: "skip",
        label: "跳过",
        outcome: "你决定先不分配这次论文奖励。",
        effects: {},
      },
    ],
  };
}

export function buildLoverTaskRewardEvent(input: {
  totalMonths: number;
  completedTaskCount: number;
  paperBonusTotal: number;
  papers: Paper[];
}): PendingEvent | null {
  const eligiblePapers = getRewardEligiblePapers(input.papers);
  if (eligiblePapers.length === 0) {
    return null;
  }

  return {
    id: `lover-task-reward-${input.totalMonths}-${input.completedTaskCount}`,
    title: "恋人任务奖励",
    description: `可把恋人的补短板奖励分配给一篇草稿，总加成 ${input.paperBonusTotal}，会优先补最低项。`,
    preview: "选择奖励论文",
    source: "system",
    blocking: true,
    deadlineMonths: 0,
    chainId: "lover-task-reward",
    stage: "result",
    choices: [
      ...eligiblePapers.map((paper) => {
        const bonusApplied = buildLoverPaperBonusUpdate(paper, input.paperBonusTotal);
        return {
          id: `paper-${paper.id}`,
          label: `选择 ${paper.title}`,
          outcome: `${paper.title} 获得补短板加成：idea +${bonusApplied.idea}、实验 +${bonusApplied.experiment}、写作 +${bonusApplied.writing}。`,
          effects: {
            paperUpdates: [{
              id: paper.id,
              idea: paper.idea + bonusApplied.idea,
              experiment: paper.experiment + bonusApplied.experiment,
              writing: paper.writing + bonusApplied.writing,
              receivedRelationshipBonus: true,
            }],
          },
        };
      }),
      {
        id: "skip",
        label: "跳过",
        outcome: "你决定先不分配这次论文奖励。",
        effects: {},
      },
    ],
  };
}
