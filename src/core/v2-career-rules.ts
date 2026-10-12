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
  { id: "internet-small", type: "internet", name: "小型科技公司", threshold: 45, compensation: "年总包 20～35 万" },
  { id: "internet-medium", type: "internet", name: "中型科技公司", threshold: 80, compensation: "年总包 35～55 万" },
  { id: "internet-leading", type: "internet", name: "头部大厂", threshold: 120, compensation: "年总包 50～80 万" },
  { id: "internet-talent", type: "internet", name: "人才计划", threshold: 170, compensation: "年总包 80～120 万" },
  { id: "internet-top-talent", type: "internet", name: "顶尖人才计划", threshold: 260, compensation: "年总包 130～220 万" },
  { id: "internet-tech-lead", type: "internet", name: "技术带头人", threshold: 380, compensation: "年总包 220～350 万" },
  { id: "internet-research-vp", type: "internet", name: "研究副总／首席科学家", threshold: 600, compensation: "年总包 350～600 万" },
  { id: "internet-ai-vp", type: "internet", name: "集团 AI 负责人／技术副总裁", threshold: 850, compensation: "年总包 600 万以上" },
];

const stateOwnedJobs: CareerJobDefinition[] = [
  { id: "state-local", type: "stateOwned", name: "地方国企", threshold: 30, compensation: "年收入 15～25 万" },
  { id: "state-provincial", type: "stateOwned", name: "省属骨干企业", threshold: 60, compensation: "年收入 20～35 万" },
  { id: "state-research", type: "stateOwned", name: "央企下属研究院", threshold: 95, compensation: "年收入 25～45 万" },
  { id: "state-headquarters", type: "stateOwned", name: "总部重点研发岗", threshold: 135, compensation: "年收入 35～60 万" },
  { id: "state-talent", type: "stateOwned", name: "专项引才", threshold: 190, compensation: "年收入 50～80 万" },
  { id: "state-discipline-lead", type: "stateOwned", name: "学科带头人", threshold: 290, compensation: "年收入 80～120 万" },
  { id: "state-subsidiary-vp", type: "stateOwned", name: "二级公司技术副总", threshold: 430, compensation: "年收入 120～200 万" },
  { id: "state-chief-scientist", type: "stateOwned", name: "集团首席科学家", threshold: 620, compensation: "年收入 200 万以上" },
];

const civilServiceUnits = [
  { id: "town", name: "乡镇", threshold: 25 },
  { id: "county", name: "县区", threshold: 50 },
  { id: "city", name: "市直", threshold: 75 },
  { id: "province", name: "省直", threshold: 105 },
  { id: "central", name: "中央机关", threshold: 145 },
] as const;
const civilServiceRanks = [
  { id: "staff", name: "一级科员", bonus: 0 },
  { id: "deputy-section", name: "四级主任科员", bonus: 20 },
  { id: "section", name: "二级主任科员", bonus: 45 },
  { id: "deputy-division", name: "四级调研员", bonus: 120 },
  { id: "division", name: "二级调研员", bonus: 220 },
] as const;
const civilServiceJobs: CareerJobDefinition[] = civilServiceUnits.flatMap((unit) => civilServiceRanks.map((rank) => ({
  id: `civil-${unit.id}-${rank.id}`,
  type: "civilService" as const,
  name: `${unit.name} · ${rank.name}`,
  threshold: unit.threshold + rank.bonus,
  ...(rank.bonus >= 120 ? { detail: "特殊引进岗位" } : {}),
}))).sort((a, b) => a.threshold - b.threshold);

const academicGradeThresholds = [30, 55, 90, 145, 230, 380, 650] as const;
const academicSchools = [
  { id: "second-tier", name: "二本", lecturerGrade: 1 },
  { id: "non-elite", name: "双非一本", lecturerGrade: 2 },
  { id: "211", name: "211", lecturerGrade: 3 },
  { id: "985", name: "985", lecturerGrade: 4 },
] as const;
const academicRanks = [
  { id: "postdoc", name: "博后", gradeDelta: -1 },
  { id: "lecturer", name: "讲师", gradeDelta: 0 },
  { id: "associate", name: "副教授", gradeDelta: 1 },
  { id: "professor", name: "教授", gradeDelta: 2 },
] as const;
const academicRepresentativeIds = new Set([
  "academic-second-tier-postdoc", "academic-second-tier-lecturer", "academic-non-elite-lecturer",
  "academic-211-lecturer", "academic-985-lecturer", "academic-985-associate", "academic-985-professor",
]);
const academicJobs: CareerJobDefinition[] = academicSchools.flatMap((school) => academicRanks.map((rank) => {
  const grade = school.lecturerGrade + rank.gradeDelta;
  return {
    id: `academic-${school.id}-${rank.id}`,
    type: "academic" as const,
    name: `${school.name}${school.id === "985" && rank.id === "professor" ? "特聘教授" : rank.name}`,
    threshold: academicGradeThresholds[grade]!,
    ...(rank.id === "postdoc" ? { detail: "博士后岗位" } : {}),
  };
})).sort((a, b) => a.threshold - b.threshold
  || Number(academicRepresentativeIds.has(b.id)) - Number(academicRepresentativeIds.has(a.id)));

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
  state: GameState, type: CareerType, random: () => number = Math.random,
): number {
  const research = Math.max(0, state.player.research);
  switch (type) {
    case "internet": return Math.floor(research * 0.5);
    case "stateOwned": return Math.floor(research * 0.25) + randomZeroToFive(random);
    case "civilService": return 5 + randomZeroToFive(random);
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
  return distinctThresholds.slice(start, start + 3).map((threshold) => {
    const sameGrade = CAREER_JOBS[type].filter((job) => job.threshold === threshold);
    return sameGrade[Math.max(0, state.totalMonths - 1) % sameGrade.length]!;
  });
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
  return Math.round(Math.max(1, Math.min(95, chance)) * 10) / 10;
}
