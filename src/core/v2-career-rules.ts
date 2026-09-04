export type CareerType = "internet" | "stateOwned" | "civilService" | "academic";

export interface CareerLevelDefinition {
  threshold: number;
  name: string;
}

export interface CareerDefinition {
  name: string;
  activeMonths: number[];
  levels: CareerLevelDefinition[];
  weights: {
    research: number;
    social: number;
    papers: number;
  };
}

export interface CareerOptionDefinition {
  id: string;
  text: string;
  sanCost: number;
  baseProgress: number;
}

export interface CareerProgressInput {
  research: number;
  social: number;
  publishedPaperCount: number;
  internshipCount: number;
}

export const CAREER_DEFINITIONS: Record<CareerType, CareerDefinition> = {
  internet: {
    name: "互联网",
    activeMonths: [11, 12, 1, 2],
    levels: [
      { threshold: 0, name: "未开始" },
      { threshold: 100, name: "小厂" },
      { threshold: 200, name: "中厂" },
      { threshold: 300, name: "大厂" },
      { threshold: 500, name: "人才计划" },
    ],
    weights: { research: 0.3, social: 0.2, papers: 0.3 },
  },
  stateOwned: {
    name: "央国企",
    activeMonths: [2, 3, 4],
    levels: [
      { threshold: 0, name: "未开始" },
      { threshold: 100, name: "普通国企" },
      { threshold: 200, name: "优质国企" },
      { threshold: 300, name: "头部央企" },
      { threshold: 500, name: "顶级央企" },
    ],
    weights: { research: 0.2, social: 0.4, papers: 0.2 },
  },
  civilService: {
    name: "公务员",
    activeMonths: [3, 4, 5],
    levels: [
      { threshold: 0, name: "未开始" },
      { threshold: 100, name: "乡镇级" },
      { threshold: 200, name: "县级" },
      { threshold: 300, name: "市级" },
      { threshold: 500, name: "省部级" },
    ],
    weights: { research: 0.1, social: 0.3, papers: 0.1 },
  },
  academic: {
    name: "教职",
    activeMonths: [5, 6, 7, 8, 9],
    levels: [
      { threshold: 0, name: "未开始" },
      { threshold: 100, name: "专科" },
      { threshold: 150, name: "普本" },
      { threshold: 200, name: "211" },
      { threshold: 300, name: "985" },
      { threshold: 500, name: "顶尖高校" },
    ],
    weights: { research: 0.5, social: 0.1, papers: 0.6 },
  },
};

export const CAREER_OPTIONS: CareerOptionDefinition[] = [
  { id: "pause", text: "不投入精力", sanCost: 0, baseProgress: 0 },
  { id: "light", text: "稍微关注", sanCost: 3, baseProgress: 15 },
  { id: "normal", text: "认真准备", sanCost: 6, baseProgress: 35 },
  { id: "all-in", text: "全力以赴", sanCost: 10, baseProgress: 60 },
];

export function getCareerEventTargetYear(
  degree: "master" | "phd",
): number | null {
  if (degree === "master") {
    return 3;
  }

  return 5;
}

export function getCareerLevel(careerType: CareerType, progress: number): CareerLevelDefinition {
  let currentLevel = CAREER_DEFINITIONS[careerType].levels[0];

  for (const level of CAREER_DEFINITIONS[careerType].levels) {
    if (progress >= level.threshold) {
      currentLevel = level;
    }
  }

  return currentLevel;
}

export function calculateCareerProgress(
  careerType: CareerType,
  option: CareerOptionDefinition,
  input: CareerProgressInput,
): number {
  if (option.baseProgress === 0) {
    return 0;
  }

  const weights = CAREER_DEFINITIONS[careerType].weights;
  const researchBonus = Math.floor((input.research / 20) * 20 * weights.research);
  const socialBonus = Math.floor((input.social / 20) * 20 * weights.social);
  const papersBonus = Math.min(input.publishedPaperCount * 5, 30) * weights.papers;
  const internshipBonus = input.internshipCount * (careerType === "internet" ? 15 : careerType === "stateOwned" ? 5 : 0);

  return Math.round(option.baseProgress + researchBonus + socialBonus + papersBonus + internshipBonus);
}
