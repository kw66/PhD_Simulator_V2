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
    internship: number;
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

export interface BestCareerOffer {
  type: CareerType;
  typeName: string;
  level: string;
  threshold: number;
  progress: number;
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
    weights: { research: 0.3, social: 0.2, papers: 0.3, internship: 0.5 },
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
    weights: { research: 0.2, social: 0.4, papers: 0.2, internship: 0.1 },
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
    weights: { research: 0.1, social: 0.3, papers: 0.1, internship: 0 },
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
    weights: { research: 0.5, social: 0.1, papers: 0.6, internship: 0 },
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
  willTransferPhDYear3: boolean,
  isNatureExtensionYear: boolean,
): number | null {
  if (degree === "master") {
    return willTransferPhDYear3 ? null : 3;
  }

  return isNatureExtensionYear ? 6 : 5;
}

export function canTriggerCareerEventsThisMonth(
  year: number,
  degree: "master" | "phd",
  willTransferPhDYear3: boolean,
  isNatureExtensionYear: boolean,
): boolean {
  const targetYear = getCareerEventTargetYear(degree, willTransferPhDYear3, isNatureExtensionYear);
  return targetYear !== null && year === targetYear;
}

export function getActiveCareerTypes(month: number): CareerType[] {
  return (Object.keys(CAREER_DEFINITIONS) as CareerType[]).filter((careerType) => CAREER_DEFINITIONS[careerType].activeMonths.includes(month));
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

export function updateBestCareerOffer(
  currentOffer: BestCareerOffer | null,
  careerType: CareerType,
  progress: number,
): BestCareerOffer {
  const careerDefinition = CAREER_DEFINITIONS[careerType];
  const level = getCareerLevel(careerType, progress);

  if (!currentOffer || level.threshold > currentOffer.threshold) {
    return {
      type: careerType,
      typeName: careerDefinition.name,
      level: level.name,
      threshold: level.threshold,
      progress,
    };
  }

  return currentOffer;
}
