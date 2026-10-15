import { gameRandom } from "./v2-game-random";
import { getEffectiveResearch } from "./v2-effective-attributes";
import type { GameState } from "./v2-types";

export type CareerType = "internet" | "stateOwned" | "civilService" | "academic";

export interface CareerDefinition {
  name: string;
  /** Game month 1 is September; game month 10 is June. */
  activeMonths: number[];
}

export interface CareerJobDefinition {
  id: string;
  type: CareerType;
  name: string;
  threshold: number;
  detail?: string;
  compensation?: string;
}

export interface CareerOffer extends Omit<CareerJobDefinition, "id"> {
  jobId: string;
  /** Ability at the time of the successful interview. */
  score: number;
}

export const CAREER_DEFINITIONS: Record<CareerType, CareerDefinition> = {
  internet: { name: "大厂", activeMonths: [1, 2, 3, 4, 5, 6, 7] },
  stateOwned: { name: "央国企", activeMonths: [2, 3, 4, 5, 6, 7, 8] },
  civilService: { name: "公务员", activeMonths: [3, 4, 5, 6, 7, 8, 9] },
  academic: { name: "教职", activeMonths: [4, 5, 6, 7, 8, 9, 10] },
};

const internetJobs: CareerJobDefinition[] = [
  { id: "internet-development", type: "internet", name: "大厂开发岗", threshold: 80, compensation: "年总包 20～35 万" },
  { id: "internet-algorithm", type: "internet", name: "大厂算法岗", threshold: 180, compensation: "年总包 50～80 万" },
  { id: "internet-talent", type: "internet", name: "人才计划", threshold: 280, compensation: "年总包 80～120 万" },
  { id: "internet-top-talent", type: "internet", name: "顶尖人才计划", threshold: 400, compensation: "年总包 130～220 万" },
  { id: "internet-tech-lead", type: "internet", name: "技术负责人", threshold: 650, compensation: "年总包 220～350 万" },
  { id: "internet-chief-scientist", type: "internet", name: "首席科学家", threshold: 1000, compensation: "年总包 350～600 万" },
];

const stateOwnedJobs: CareerJobDefinition[] = [
  { id: "state-local", type: "stateOwned", name: "地方国企技术岗", threshold: 70, compensation: "年收入 15～25 万" },
  { id: "state-provincial", type: "stateOwned", name: "省属国企研发岗", threshold: 150, compensation: "年收入 20～35 万" },
  { id: "state-research", type: "stateOwned", name: "央企研究院研发岗", threshold: 210, compensation: "年收入 25～45 万" },
  { id: "state-headquarters", type: "stateOwned", name: "央企总部业务主管", threshold: 280, compensation: "年收入 35～60 万" },
  { id: "state-subsidiary-vp", type: "stateOwned", name: "央企二级公司副总经理", threshold: 380, compensation: "年收入 120～200 万" },
  { id: "state-headquarters-director", type: "stateOwned", name: "央企总部部门负责人", threshold: 550, compensation: "年收入 200 万以上" },
];

const civilServiceJobs: CareerJobDefinition[] = [
  { id: "civil-town-deputy-section", type: "civilService", name: "乡镇机关 · 四级主任科员", threshold: 80 },
  { id: "civil-county-deputy-section", type: "civilService", name: "县区机关 · 四级主任科员", threshold: 150 },
  { id: "civil-city-section", type: "civilService", name: "市直机关 · 二级主任科员", threshold: 210 },
  { id: "civil-province-section", type: "civilService", name: "省直机关 · 二级主任科员", threshold: 260 },
  { id: "civil-municipality-section", type: "civilService", name: "直辖市机关 · 二级主任科员", threshold: 330 },
  { id: "civil-central-deputy-division", type: "civilService", name: "中央部委 · 四级调研员", threshold: 400, detail: "特殊引进岗位" },
];

const academicJobs: CareerJobDefinition[] = [
  { id: "academic-non-elite-lecturer", type: "academic", name: "双非讲师", threshold: 80 },
  { id: "academic-211-lecturer", type: "academic", name: "211讲师", threshold: 180 },
  { id: "academic-985-lecturer", type: "academic", name: "985讲师", threshold: 300 },
  { id: "academic-985-associate", type: "academic", name: "985副教授", threshold: 450 },
  { id: "academic-985-professor", type: "academic", name: "985教授", threshold: 700 },
  { id: "academic-world-professor", type: "academic", name: "世界名校长聘教授", threshold: 1100 },
];

export const CAREER_JOBS: Record<CareerType, CareerJobDefinition[]> = {
  internet: internetJobs,
  stateOwned: stateOwnedJobs,
  civilService: civilServiceJobs,
  academic: academicJobs,
};

const advisorGrantBonus = { youth: 5, general: 15, excellent: 30, distinguished: 40, academician: 50 } as const;

export function getCareerEventTargetYear(degree: "master" | "phd"): number {
  return degree === "master" ? 3 : 6;
}

export function getCareerBaseScore(state: GameState, type: CareerType): number {
  const researchScore = Math.max(0, state.totalResearchScore);
  const citationHundreds = Math.floor(Math.max(0, state.totalCitations) / 100);
  const scholarshipCount = Math.max(0, state.scholarshipState.awardCount ?? 0);
  const education = state.degree === "phd" ? 50 : 20;
  switch (type) {
    case "internet":
      return education + researchScore * 4 + citationHundreds * 2 + Math.max(0, state.internshipCount) * 20;
    case "stateOwned":
      return education + researchScore * 2 + scholarshipCount * 20;
    case "civilService":
      return education + researchScore + scholarshipCount * 10;
    case "academic": {
      if (state.degree !== "phd") return -999;
      const projects = state.advisorProgressState.playerProjectCompletions;
      const highestGrantBonus = state.advisorProgressState.awards.reduce(
        (highest, award) => Math.max(highest, advisorGrantBonus[award.id]), 0,
      );
      return researchScore * 6 + citationHundreds * 3
        + Math.max(0, projects.vertical) * 2 + Math.max(0, projects.horizontal) + highestGrantBonus;
    }
  }
}

export function getCareerAbility(state: GameState, type: CareerType): number {
  const base = getCareerBaseScore(state, type);
  return type === "academic" && state.degree !== "phd" ? base : base + Math.max(0, state.careerProgress[type]);
}

function randomZeroToFive(random: () => number): number {
  return Math.min(5, Math.floor(Math.max(0, random()) * 6));
}

export function calculateMonthlyCareerProgress(
  state: GameState, type: CareerType, random: () => number = gameRandom,
): number {
  const research = Math.max(0, getEffectiveResearch(state));
  switch (type) {
    case "internet": return Math.floor(research * 0.5);
    case "stateOwned": return Math.floor(research * 0.25) + randomZeroToFive(random);
    case "civilService": return Math.floor(Math.max(0, state.player.san) / 2) + randomZeroToFive(random);
    case "academic": return state.degree === "phd" ? Math.floor(research * 0.25) : 0;
  }
}

export function getCareerCandidates(state: GameState, type: CareerType): CareerJobDefinition[] {
  if (type === "academic" && state.degree !== "phd") return [];
  const ability = getCareerAbility(state, type);
  const distinctThresholds = [...new Set(CAREER_JOBS[type].map((job) => job.threshold))];
  const firstAbove = distinctThresholds.findIndex((threshold) => threshold > ability);
  const center = firstAbove === -1 ? distinctThresholds.length - 1 : Math.max(0, firstAbove - 1);
  const start = Math.min(Math.max(0, center - 1), distinctThresholds.length - 3);
  return CAREER_JOBS[type].slice(start, start + 3);
}

const chanceCurves: Record<CareerType, { atThreshold: number; perTenPoints: number }> = {
  internet: { atThreshold: 50, perTenPoints: 5 },
  stateOwned: { atThreshold: 45, perTenPoints: 5.5 },
  civilService: { atThreshold: 35, perTenPoints: 7.5 },
  academic: { atThreshold: 40, perTenPoints: 4 },
};

export function getCareerSuccessChance(type: CareerType, ability: number, job: CareerJobDefinition): number {
  if (job.type !== type) return 0;
  const curve = chanceCurves[type];
  const chance = curve.atThreshold + (ability - job.threshold) / 10 * curve.perTenPoints;
  return Math.round(Math.max(0, Math.min(95, chance)) * 10) / 10;
}
