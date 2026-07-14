export interface ThesisState {
  progress: number;
  started: boolean;
  completed: boolean;
  abandoned: boolean;
}

export interface ThesisStageDefinition {
  threshold: number;
  name: string;
}

export interface ThesisOptionDefinition {
  id: string;
  text: string;
  sanCost: number;
  baseProgress: number;
}

export const THESIS_STAGES: ThesisStageDefinition[] = [
  { threshold: 0, name: "未开始" },
  { threshold: 20, name: "开题报告" },
  { threshold: 40, name: "文献综述" },
  { threshold: 60, name: "实验/研究" },
  { threshold: 80, name: "论文撰写" },
  { threshold: 100, name: "答辩准备" },
];

export const THESIS_OPTIONS: ThesisOptionDefinition[] = [
  { id: "pause", text: "暂时搁置", sanCost: 0, baseProgress: 0 },
  { id: "light", text: "稍微推进", sanCost: 2, baseProgress: 5 },
  { id: "normal", text: "认真写作", sanCost: 5, baseProgress: 12 },
  { id: "all-in", text: "废寝忘食", sanCost: 10, baseProgress: 25 },
];

export function createInitialThesisState(): ThesisState {
  return {
    progress: 0,
    started: false,
    completed: false,
    abandoned: false,
  };
}

export function shouldTriggerThesisEvent(year: number, month: number, thesis: ThesisState): boolean {
  if (thesis.abandoned || thesis.completed) {
    return false;
  }

  if (thesis.started) {
    return true;
  }

  return year > 2 || (year === 2 && month >= 7);
}

export function startThesisIfAvailable(year: number, month: number, thesis: ThesisState): ThesisState {
  if (thesis.started) {
    return thesis;
  }

  if (!shouldTriggerThesisEvent(year, month, thesis)) {
    return thesis;
  }

  return {
    ...thesis,
    started: true,
  };
}

export function getThesisStage(progress: number): ThesisStageDefinition {
  let currentStage = THESIS_STAGES[0];

  for (const stage of THESIS_STAGES) {
    if (progress >= stage.threshold) {
      currentStage = stage;
    }
  }

  return currentStage;
}

export function calculateThesisProgressGain(baseProgress: number, publishedPaperCount: number, research: number): number {
  if (baseProgress === 0) {
    return 0;
  }

  const papersBonus = Math.min(publishedPaperCount * 2, 10);
  const researchBonus = Math.floor((research / 20) * 5);
  return Math.round(baseProgress + papersBonus + researchBonus);
}

export function applyThesisOption(
  thesis: ThesisState,
  option: ThesisOptionDefinition,
  publishedPaperCount: number,
  research: number,
): { nextThesis: ThesisState; progressGain: number; sanCost: number } {
  const progressGain = calculateThesisProgressGain(option.baseProgress, publishedPaperCount, research);
  const nextProgress = Math.min(100, thesis.progress + progressGain);

  return {
    nextThesis: {
      ...thesis,
      started: true,
      progress: nextProgress,
      completed: nextProgress >= 100,
    },
    progressGain,
    sanCost: option.sanCost,
  };
}

export function abandonThesis(thesis: ThesisState): ThesisState {
  return {
    ...thesis,
    abandoned: true,
  };
}
