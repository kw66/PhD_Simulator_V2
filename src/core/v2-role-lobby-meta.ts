import { ACHIEVEMENT_DEFINITIONS } from "./v2-achievements";
import { getRoleDefinition } from "./v2-progression";
import type {
  GameState,
  RoleAchievementDefinition,
  RoleAchievementMetricId,
  RoleAchievementProgressSnapshot,
  RoleId,
} from "./v2-types";

type RoleAchievementProgressMode = "best-single" | "cumulative";

interface RoleAchievementMetricTemplate {
  id: RoleAchievementMetricId;
  label: string;
  target: number;
}

interface RoleAchievementTemplate {
  idSuffix: string;
  icon: string;
  title: string;
  description: string;
  rewardText?: string;
  milestone?: RoleAchievementDefinition["milestone"];
  progressMode?: RoleAchievementProgressMode;
  progressMetrics?: readonly RoleAchievementMetricTemplate[];
}

const ROLE_UNLOCK_DISPLAY_ACHIEVEMENTS: Partial<Record<RoleId, RoleAchievementDefinition>> = {
  rich: {
    id: "unlock:rich",
    icon: "💰",
    title: "小有积蓄",
    description: "使用大多数角色，金币达到30",
    rewardText: "经验+5，解锁富可敌国角色",
    unlocksRoleId: "rich",
  },
  genius: {
    id: "unlock:genius",
    icon: "🔬",
    title: "初窥门径",
    description: "使用大多数角色，科研能力达到12",
    rewardText: "经验+5，解锁院士转世角色",
    unlocksRoleId: "genius",
  },
  "teacher-child": {
    id: "unlock:teacher-child",
    icon: "🌟",
    title: "得到器重",
    description: "使用大多数角色，导师好感达到12",
    rewardText: "经验+5，解锁导师子女角色",
    unlocksRoleId: "teacher-child",
  },
  social: {
    id: "unlock:social",
    icon: "🤝",
    title: "人脉初成",
    description: "使用大多数角色，社交能力达到12",
    rewardText: "经验+5，解锁社交达人角色",
    unlocksRoleId: "social",
  },
  chosen: {
    id: "unlock:chosen",
    icon: "🏆",
    title: "全面发展",
    description: "使用大多数角色，科研、社交、好感、金币都达到6",
    rewardText: "经验+5，解锁天选之人角色",
    unlocksRoleId: "chosen",
  },
  "normal-reversed": {
    id: "unlock:normal-reversed",
    icon: "😴",
    title: "渐生惰性",
    description: "使用大多数角色，购买办公椅并升级为人体工学椅",
    rewardText: "经验+5，解锁怠惰·大多数角色",
    unlocksRoleId: "normal-reversed",
  },
};

const ROLE_PROFILE_SUMMARIES: Record<RoleId, string> = {
  normal: "家里条件普通，读研也没什么捷径。组会前赶实验，月底算生活费，论文退了就再改一版。你和大多数人一样，只能靠每个月的选择把日子往前推。",
  genius: "从本科起就是老师眼里的好苗子，读论文快，做实验也容易抓到关键。但研究生阶段不认过去的奖状：点子能否落地、论文能否投中，才是新的成绩单。",
  social: "你记得每个人的研究方向，也知道组会后该和谁多聊两句。合作机会、会议信息和师门消息总比别人早一步到手，不过人情来往也要花时间维护。",
  rich: "生活费和设备钱不用精打细算，遇到想做的方向也能多试几次。钱能省下很多麻烦，却不能替你写论文；怎么花，仍会决定这段研究生生活怎么走。",
  "teacher-child": "从小听惯了高校里的职称、项目和人情，进组后很快就能读懂导师的言外之意。熟悉规则是优势，也意味着每次成绩都容易被和家庭背景放在一起议论。",
  chosen: "保研顺利，开题顺利，投稿时也常能赶上合适的机会。你没有明显短板，也因此更难判断力气该用在哪里；好运能替你开门，最后还是要自己走完。",
  rewinder: "你记得哪些选题会卡住、哪次投稿会被拒，也记得谁会在关键时候伸手。重新来过不等于自动成功，只是这一次，你能少交几笔昂贵的学费。",
  "research-captain": "你擅长把人和任务放到合适的位置：谁写代码，谁跑实验，谁去谈合作。独自做得快不算本事，让整个团队稳定产出，才是你的研究方式。",
  "normal-reversed": "你不是不会做，只是总想等状态好一点再开始。临近截止日期时又能一口气补完许多事，代价是精力消耗得更快；这一局要学会和拖延相处。",
  "genius-reversed": "科研能力始终是零，论文槽却一个不少。每次被迫提升科研时，收益都会转到金钱、精力和人际上；既然写不出论文，就把实验室生活过成另一种成功。",
  "social-reversed": "你对同门的进展格外敏感。社交下降时，不甘心会推着科研和导师好感往前；社交上升时，精力和钱包又得到补偿。比较心在这里也是一种资源。",
  "rich-reversed": "你只在意账户里的数字。每个月，精力和能力都会被压回最低点，损失则折算成金币；这不是轻松的富有，而是一场拿其他一切换钱的交易。",
  "teacher-child-reversed": "你熟悉导师的底线，也总忍不住去试探。关系闹僵后仍有机会回到桌前，甚至换来额外资源；这条路线靠的不是讨好，而是把分寸踩得足够准。",
  "chosen-reversed": "每个月，科研、社交和好感都会重新洗牌，连精力与金币也可能互换。你无法经营一套稳定的计划，只能根据当月拿到的属性临场应对。",
};

const ROLE_ACHIEVEMENT_TEMPLATES: Record<RoleId, readonly RoleAchievementTemplate[]> = {
  normal: [
    {
      idSuffix: "first-pot",
      icon: "💰",
      title: "小有积蓄",
      description: "金币达到30",
      rewardText: "经验+5，解锁富可敌国角色",
      progressMode: "best-single",
      progressMetrics: [{ id: "money", label: "金币", target: 30 }],
    },
    {
      idSuffix: "research-start",
      icon: "🔬",
      title: "初窥门径",
      description: "科研能力达到12",
      rewardText: "经验+5，解锁院士转世角色",
      progressMode: "best-single",
      progressMetrics: [{ id: "research", label: "科研", target: 12 }],
    },
    {
      idSuffix: "favorite",
      icon: "🌟",
      title: "得到器重",
      description: "导师好感达到12",
      rewardText: "经验+5，解锁导师子女角色",
      progressMode: "best-single",
      progressMetrics: [{ id: "favor", label: "好感", target: 12 }],
    },
    {
      idSuffix: "socialite",
      icon: "🤝",
      title: "人脉初成",
      description: "社交能力达到12",
      rewardText: "经验+5，解锁社交达人角色",
      progressMode: "best-single",
      progressMetrics: [{ id: "social", label: "社交", target: 12 }],
    },
    {
      idSuffix: "all-rounder",
      icon: "🏆",
      title: "全面发展",
      description: "科研、社交、好感、金币都达到6",
      rewardText: "经验+5，解锁天选之人角色",
      progressMode: "best-single",
      progressMetrics: [
        { id: "research", label: "科研", target: 6 },
        { id: "social", label: "社交", target: 6 },
        { id: "favor", label: "好感", target: 6 },
        { id: "money", label: "金币", target: 6 },
      ],
    },
    {
      idSuffix: "chair-upgrade",
      icon: "😴",
      title: "渐生惰性",
      description: "购买办公椅并升级为人体工学椅",
      rewardText: "经验+5，解锁怠惰·大多数角色",
      progressMode: "best-single",
      progressMetrics: [
        { id: "chair-owned", label: "办公椅", target: 1 },
        { id: "chair-advanced", label: "工学椅", target: 1 },
      ],
    },
  ],
  genius: [],
  social: [],
  rich: [],
  "teacher-child": [],
  chosen: [],
  rewinder: [],
  "research-captain": [],
  "normal-reversed": [],
  "genius-reversed": [],
  "social-reversed": [],
  "rich-reversed": [],
  "teacher-child-reversed": [],
  "chosen-reversed": [],
};

export function getRoleProfileSummary(roleId: RoleId): string {
  return ROLE_PROFILE_SUMMARIES[roleId];
}

export function getRoleAchievementDefinitions(roleId: RoleId): RoleAchievementDefinition[] {
  return ROLE_ACHIEVEMENT_TEMPLATES[roleId].map((template) => ({
    id: `${roleId}:${template.idSuffix}`,
    icon: template.icon,
    title: template.title,
    description: template.description,
    rewardText: template.rewardText,
    milestone: template.milestone,
  }));
}

function isAchievementVisibleForRole(scope: "any-role" | "upright-role", roleId: RoleId): boolean {
  return scope === "any-role" || getRoleDefinition(roleId).mode === "upright";
}

export function getRoleLobbyAchievementDefinitions(roleId: RoleId): RoleAchievementDefinition[] {
  const unlockAchievement = ROLE_UNLOCK_DISPLAY_ACHIEVEMENTS[roleId];
  const commonAchievements = ACHIEVEMENT_DEFINITIONS
    .filter((achievement) => isAchievementVisibleForRole(achievement.scope, roleId))
    .map((achievement) => ({
      id: `global:${achievement.id}`,
      icon: achievement.icon,
      title: achievement.name,
      description: `${achievement.scope === "upright-role" ? "任意正位角色" : "任意角色"}：${achievement.description}`,
      rewardText: "通用成就；完成后将在所有适用角色档案中同步展示",
      scope: achievement.scope,
      globalAchievementId: achievement.id,
    }));

  return unlockAchievement ? [unlockAchievement, ...commonAchievements] : commonAchievements;
}

function getRoleAchievementTemplateByDefinitionId(roleId: RoleId, definitionId: string): RoleAchievementTemplate | null {
  return ROLE_ACHIEVEMENT_TEMPLATES[roleId].find((template) => `${roleId}:${template.idSuffix}` === definitionId) ?? null;
}

function getSnapshotMetricValue(
  snapshot: RoleAchievementProgressSnapshot | undefined,
  metricId: RoleAchievementMetricId,
): number {
  return Math.max(0, Math.floor(snapshot?.values[metricId] ?? 0));
}

function buildSnapshotScore(
  template: RoleAchievementTemplate,
  snapshot: RoleAchievementProgressSnapshot | undefined,
): number {
  if (!template.progressMetrics?.length || !snapshot) {
    return 0;
  }

  return template.progressMetrics.reduce((score, metric) => (
    score + Math.min(getSnapshotMetricValue(snapshot, metric.id) / metric.target, 1)
  ), 0);
}

function readMetricValueFromFinishedRun(
  metricId: RoleAchievementMetricId,
  state: Pick<GameState, "player" | "shopState">,
  nextCompletedRuns: number,
): number {
  switch (metricId) {
    case "completed-runs":
      return nextCompletedRuns;
    case "chair-owned":
      return state.shopState.chairOwned ? 1 : 0;
    case "chair-advanced":
      return state.shopState.chairUpgrade === "advanced" ? 1 : 0;
  }

  return Math.max(0, Math.floor(state.player[metricId]));
}

export function buildRoleAchievementProgressSnapshotFromFinishedRun(
  roleId: RoleId,
  definitionId: string,
  state: Pick<GameState, "player" | "shopState">,
  nextCompletedRuns: number,
): RoleAchievementProgressSnapshot | null {
  const template = getRoleAchievementTemplateByDefinitionId(roleId, definitionId);
  if (!template?.progressMetrics?.length) {
    return null;
  }

  return {
    values: Object.fromEntries(
      template.progressMetrics.map((metric) => [
        metric.id,
        readMetricValueFromFinishedRun(metric.id, state, nextCompletedRuns),
      ]),
    ) as RoleAchievementProgressSnapshot["values"],
  };
}

export function mergeRoleAchievementProgressSnapshot(
  roleId: RoleId,
  definitionId: string,
  current: RoleAchievementProgressSnapshot | undefined,
  next: RoleAchievementProgressSnapshot | null,
): RoleAchievementProgressSnapshot | undefined {
  if (!next) {
    return current;
  }

  const template = getRoleAchievementTemplateByDefinitionId(roleId, definitionId);
  if (!template?.progressMetrics?.length) {
    return current;
  }

  if (!current) {
    return next;
  }

  if (template.progressMode === "best-single" && template.progressMetrics.length > 1) {
    return buildSnapshotScore(template, next) >= buildSnapshotScore(template, current) ? next : current;
  }

  return {
    values: Object.fromEntries(
      template.progressMetrics.map((metric) => [
        metric.id,
        Math.max(getSnapshotMetricValue(current, metric.id), getSnapshotMetricValue(next, metric.id)),
      ]),
    ) as RoleAchievementProgressSnapshot["values"],
  };
}

export function isRoleAchievementUnlockedFromSnapshot(
  roleId: RoleId,
  definitionId: string,
  snapshot: RoleAchievementProgressSnapshot | undefined,
): boolean {
  const template = getRoleAchievementTemplateByDefinitionId(roleId, definitionId);
  if (!template?.progressMetrics?.length) {
    return false;
  }

  return template.progressMetrics.every((metric) => getSnapshotMetricValue(snapshot, metric.id) >= metric.target);
}

export function buildRoleAchievementProgressLines(
  roleId: RoleId,
  definitionId: string,
  snapshot: RoleAchievementProgressSnapshot | undefined,
): string[] {
  const template = getRoleAchievementTemplateByDefinitionId(roleId, definitionId);
  if (!template?.progressMetrics?.length) {
    return [];
  }

  const progressSegments = template.progressMetrics.map((metric) => (
    `${metric.label} ${getSnapshotMetricValue(snapshot, metric.id)}/${metric.target}`
  ));

  if (template.progressMode === "cumulative" && progressSegments.length === 1) {
    const metric = template.progressMetrics[0];
    return [`累计 ${getSnapshotMetricValue(snapshot, metric.id)} / ${metric.target}`];
  }

  if (progressSegments.length === 1) {
    const metric = template.progressMetrics[0];
    return [`历史最高 ${getSnapshotMetricValue(snapshot, metric.id)} / ${metric.target}`];
  }

  return [`最佳单局：${progressSegments.join(" · ")}`];
}

export function isRoleAchievementUnlockedFromFinishedRun(
  definition: RoleAchievementDefinition,
  state: Pick<GameState, "ending" | "achievementFlags">,
): boolean {
  if (!definition.milestone) {
    return false;
  }

  switch (definition.milestone) {
    case "graduate":
      return state.ending === "master" || state.ending === "phd";
    case "phd":
      return state.ending === "phd";
    case "phd-with-global-achievements":
      return false;
  }
}
