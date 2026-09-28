import type { AdvisorRequirements, PaperTarget, RoleDefinition } from "./v2-types";

export const MASTER_TOTAL_MONTHS = 68;
export const PHD_TOTAL_MONTHS = 68;
export const PAPER_SLOT_LIMIT = 4;
export const MAX_SAN = 20;

export const BASE_ROLE_STARTING_STATS = { san: MAX_SAN, research: 1, social: 1, favor: 1, money: 1 } as const;

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: "normal",
    mode: "upright",
    gender: "male",
    name: "大多数",
    icon: "👤",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "genius",
    mode: "upright",
    gender: "male",
    name: "院士转世",
    icon: "🔬",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "social",
    mode: "upright",
    gender: "male",
    name: "社交达人",
    icon: "🤝",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "rich",
    mode: "upright",
    gender: "female",
    name: "富可敌国",
    icon: "💰",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "teacher-child",
    mode: "upright",
    gender: "female",
    name: "导师子女",
    icon: "👨‍👧",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "chosen",
    mode: "upright",
    gender: "female",
    name: "天选之人",
    icon: "⭐",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "rewinder",
    mode: "upright",
    gender: "female",
    name: "轮回者",
    icon: "⏳",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "research-captain",
    mode: "upright",
    gender: "male",
    name: "统御者",
    icon: "🧭",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "normal-reversed",
    mode: "reversed",
    gender: "male",
    name: "怠惰·大多数",
    icon: "😴",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "genius-reversed",
    mode: "reversed",
    gender: "male",
    name: "愚钝·院士转世",
    icon: "🤡",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "social-reversed",
    mode: "reversed",
    gender: "male",
    name: "嫉妒·社交达人",
    icon: "🐍",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "rich-reversed",
    mode: "reversed",
    gender: "female",
    name: "贪求·富可敌国",
    icon: "🏴‍☠️",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "teacher-child-reversed",
    mode: "reversed",
    gender: "female",
    name: "玩世·导师子女",
    icon: "🎪",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
  {
    id: "chosen-reversed",
    mode: "reversed",
    gender: "female",
    name: "空想·天选之人",
    icon: "🌀",
    startingStats: { ...BASE_ROLE_STARTING_STATS },
  },
];

export const ADVISOR_REQUIREMENTS: AdvisorRequirements = {
  phdYear2: 2,
  phdYear3: 3,
  masterGrad: 1,
  phdGrad: 7,
};

export const ADVISOR_SALARY = { master: 1, phd: 3 } as const;

export const SCORE_BY_TARGET: Record<PaperTarget, number> = { C: 1, B: 2, A: 4 };
export const PAPER_SLOT_RESEARCH_THRESHOLDS = [0, 6, 12, 18] as const;
