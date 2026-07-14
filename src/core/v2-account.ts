import { ACHIEVEMENT_DEFINITIONS, createAchievementFlags, getUnlockedAchievementCount } from "./v2-achievements";
import { getRoleDefinition, getRoleOptions } from "./v2-progression";
import { getAcceptedPaperScore } from "./v2-publication-rules";
import {
  buildRoleAchievementProgressLines,
  buildRoleAchievementProgressSnapshotFromFinishedRun,
  getRoleAchievementDefinitions,
  getRoleProfileSummary,
  isRoleAchievementUnlockedFromSnapshot,
  isRoleAchievementUnlockedFromFinishedRun,
  mergeRoleAchievementProgressSnapshot,
} from "./v2-role-lobby-meta";
import type {
  AccountProfile,
  AchievementMetaState,
  GameState,
  LobbySelectedRoleHistoryStatViewModel,
  LobbySelectedRoleAchievementViewModel,
  LobbySelectedRolePassiveViewModel,
  LobbySelectedRoleStatViewModel,
  LobbySelectedRoleViewModel,
  Paper,
  PlayerStats,
  RoleAchievementProgressSnapshot,
  RoleHistoryBest,
  RoleGrowthStatId,
  RoleId,
  RoleLobbyDefinition,
  RoleMetaProgress,
  RoleUnlockState,
  RolePassiveDefinition,
} from "./v2-types";

const DEFAULT_EXP_TO_NEXT = 100;
export const LOBBY_ROLE_PAGE_SIZE = 10;
export const LOBBY_ROLE_PAGE_ROW_COUNT = Math.max(1, Math.floor(LOBBY_ROLE_PAGE_SIZE / 2));
export const ROLE_ACHIEVEMENT_PAGE_SIZE = 5;
const LOBBY_ROLE_ROWS: ReadonlyArray<ReadonlyArray<RoleId>> = [
  ["normal", "normal-reversed"],
  ["rich", "rich-reversed"],
  ["genius", "genius-reversed"],
  ["teacher-child", "teacher-child-reversed"],
  ["social", "social-reversed"],
  ["chosen", "chosen-reversed"],
  ["research-captain", "rewinder"],
];
const GROWTH_STAT_IDS: RoleGrowthStatId[] = ["san", "research", "social", "favor", "money"];

const ROLE_ARCHETYPE_TEXT: Record<RoleId, string> = {
  normal: "基础 / 生存",
  genius: "科研 / 爆发",
  social: "人脉 / 联动",
  rich: "资源 / 节奏",
  "teacher-child": "好感 / 导师线",
  chosen: "均衡 / 万用",
  rewinder: "特殊 / 时间线",
  "research-captain": "特殊 / 编队",
  "normal-reversed": "逆位 / 生存",
  "genius-reversed": "逆位 / 反科研",
  "social-reversed": "逆位 / 拉扯",
  "rich-reversed": "逆位 / 风险",
  "teacher-child-reversed": "逆位 / 叛逆",
  "chosen-reversed": "逆位 / 随机",
};

const ROLE_UNLOCK_TEXT: Record<RoleId, string> = {
  normal: "初始角色",
  genius: "成就系统待接入：完成科研路线成就后解锁",
  social: "成就系统待接入：完成社交路线成就后解锁",
  rich: "成就系统待接入：完成资源路线成就后解锁",
  "teacher-child": "成就系统待接入：完成导师路线成就后解锁",
  chosen: "成就系统待接入：完成综合路线成就后解锁",
  rewinder: "特殊角色展示中：正式机制与解锁条件待定",
  "research-captain": "特殊角色展示中：正式机制与解锁条件待定",
  "normal-reversed": "成就系统待接入：完成大多数的逆位挑战后解锁",
  "genius-reversed": "成就系统待接入：完成院士路线的逆位挑战后解锁",
  "social-reversed": "成就系统待接入：完成社交路线的逆位挑战后解锁",
  "rich-reversed": "成就系统待接入：完成富豪路线的逆位挑战后解锁",
  "teacher-child-reversed": "成就系统待接入：完成子女路线的逆位挑战后解锁",
  "chosen-reversed": "成就系统待接入：完成天选路线的逆位挑战后解锁",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createZeroStats(): PlayerStats {
  return {
    san: 0,
    research: 0,
    social: 0,
    favor: 0,
    money: 0,
  };
}

function createZeroHistoryBest(): RoleHistoryBest {
  return {
    researchScore: 0,
    totalCitations: 0,
    natureCount: 0,
    representativeCitations: 0,
    representativeScore: 0,
  };
}

function createEmptyAchievementSnapshots(): Record<string, RoleAchievementProgressSnapshot> {
  return {};
}

function isZeroStats(stats: PlayerStats): boolean {
  return stats.san === 0
    && stats.research === 0
    && stats.social === 0
    && stats.favor === 0
    && stats.money === 0;
}

function isZeroPassiveLevels(levels: Record<string, number>): boolean {
  return Object.values(levels).every((value) => value === 0);
}

function isZeroHistoryBest(historyBest: RoleHistoryBest): boolean {
  return historyBest.researchScore === 0
    && historyBest.totalCitations === 0
    && historyBest.natureCount === 0
    && historyBest.representativeCitations === 0
    && historyBest.representativeScore === 0;
}

function isZeroAchievementSnapshots(snapshots: Record<string, RoleAchievementProgressSnapshot>): boolean {
  return Object.keys(snapshots).length === 0;
}

function isStarterAchievementState(flags: AccountProfile["achievementProgress"]["flags"]): boolean {
  return Object.values(flags).every((value) => value !== true);
}

function mergeUniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function normalizeUnlockedRoleAchievementIds(
  roleId: RoleId,
  value: unknown,
  fallbackCount = 0,
): string[] {
  const definitions = getRoleAchievementDefinitions(roleId);
  const validIds = new Set(definitions.map((definition) => definition.id));
  const explicitIds = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && validIds.has(item))
    : [];

  if (explicitIds.length > 0) {
    return mergeUniqueIds(explicitIds);
  }

  const fallbackEnabled = definitions.length > 0 && definitions.every((definition) => typeof definition.milestone === "string");

  if (fallbackCount <= 0 || !fallbackEnabled) {
    return [];
  }

  return definitions
    .slice(0, Math.min(fallbackCount, definitions.length))
    .map((definition) => definition.id);
}

function createPassiveDefinitions(roleId: RoleId): RolePassiveDefinition[] {
  const role = getRoleDefinition(roleId);
  const awakeningMaxLevel = roleId === "normal" ? 10 : 3;
  const hiddenAwakenMaxLevel = roleId === "normal" ? 10 : 1;
  const passiveDefinitions: RolePassiveDefinition[] = [
    {
      id: "trait",
      name: "角色特性",
      description: role.bonus,
      maxLevel: 5,
      unlockLevel: 1,
    },
    {
      id: "awakening",
      name: role.awakenName,
      description: role.awakenDesc,
      maxLevel: awakeningMaxLevel,
      unlockLevel: 3,
    },
  ];

  if (role.hiddenAwakenName && role.hiddenAwakenDesc) {
    passiveDefinitions.push({
      id: "hidden-awaken",
      name: role.hiddenAwakenName,
      description: role.hiddenAwakenDesc,
      maxLevel: hiddenAwakenMaxLevel,
      unlockLevel: 5,
    });
  }

  return passiveDefinitions;
}

const ROLE_LOBBY_DEFINITIONS: Record<RoleId, RoleLobbyDefinition> = Object.fromEntries(
  getRoleOptions().map((role) => [
    role.id,
    {
      roleId: role.id,
      archetype: ROLE_ARCHETYPE_TEXT[role.id],
      summary: getRoleProfileSummary(role.id),
      portraitLabel: "立绘待替换",
      unlockConditionText: ROLE_UNLOCK_TEXT[role.id],
      growthStatIds: [...GROWTH_STAT_IDS],
      passiveDefinitions: createPassiveDefinitions(role.id),
    },
  ]),
) as Record<RoleId, RoleLobbyDefinition>;

function createPassiveLevelMap(roleId: RoleId): Record<string, number> {
  return Object.fromEntries(
    ROLE_LOBBY_DEFINITIONS[roleId].passiveDefinitions.map((definition) => [definition.id, 0]),
  );
}

export function getRoleLobbyDefinition(roleId: RoleId): RoleLobbyDefinition {
  return ROLE_LOBBY_DEFINITIONS[roleId];
}

export function getRoleLobbyDefinitions(): RoleLobbyDefinition[] {
  return getRoleOptions().map((role) => getRoleLobbyDefinition(role.id));
}

export function createDefaultRoleMetaProgress(roleId: RoleId): RoleMetaProgress {
  const unlocked = roleId === "normal";

  return {
    level: 0,
    exp: 0,
    expToNext: DEFAULT_EXP_TO_NEXT,
    completedRuns: 0,
    achievementCount: 0,
    unlockedAchievementIds: [],
    achievementSnapshots: createEmptyAchievementSnapshots(),
    availableStatPoints: 0,
    allocatedStats: createZeroStats(),
    passiveLevels: createPassiveLevelMap(roleId),
    historyBest: createZeroHistoryBest(),
    unlocked,
    unlockConditionText: ROLE_UNLOCK_TEXT[roleId],
  };
}

export function createDefaultAccountProfile(): AccountProfile {
  const roleProgress = Object.fromEntries(
    getRoleOptions().map((role) => [role.id, createDefaultRoleMetaProgress(role.id)]),
  ) as Record<RoleId, RoleMetaProgress>;

  return {
    ownedRoleIds: ["normal"],
    selectedLobbyRoleId: "normal",
    lobbyRolePage: 0,
    lobbyRoleAchievementPage: 0,
    metaCurrency: 0,
    achievementProgress: {
      flags: createAchievementFlags(),
    },
    roleProgress,
  };
}

function normalizePlayerStats(value: unknown): PlayerStats {
  if (!isObject(value)) {
    return createZeroStats();
  }

  return {
    san: typeof value.san === "number" ? value.san : 0,
    research: typeof value.research === "number" ? value.research : 0,
    social: typeof value.social === "number" ? value.social : 0,
    favor: typeof value.favor === "number" ? value.favor : 0,
    money: typeof value.money === "number" ? value.money : 0,
  };
}

function normalizeHistoryBest(value: unknown): RoleHistoryBest {
  if (!isObject(value)) {
    return createZeroHistoryBest();
  }

  return {
    researchScore: typeof value.researchScore === "number" ? Math.max(0, Math.floor(value.researchScore)) : 0,
    totalCitations: typeof value.totalCitations === "number" ? Math.max(0, Math.floor(value.totalCitations)) : 0,
    natureCount: typeof value.natureCount === "number" ? Math.max(0, Math.floor(value.natureCount)) : 0,
    representativeCitations: typeof value.representativeCitations === "number" ? Math.max(0, Math.floor(value.representativeCitations)) : 0,
    representativeScore: typeof value.representativeScore === "number" ? Math.max(0, Math.floor(value.representativeScore)) : 0,
  };
}

function normalizePassiveLevels(roleId: RoleId, value: unknown): Record<string, number> {
  const definitions = getRoleLobbyDefinition(roleId).passiveDefinitions;
  const nextLevels = createPassiveLevelMap(roleId);

  if (!isObject(value)) {
    return nextLevels;
  }

  for (const definition of definitions) {
    const rawLevel = value[definition.id];
    if (typeof rawLevel === "number") {
      nextLevels[definition.id] = Math.max(0, Math.min(definition.maxLevel, Math.floor(rawLevel)));
    }
  }

  return nextLevels;
}

function normalizeAchievementSnapshots(
  roleId: RoleId,
  value: unknown,
): Record<string, RoleAchievementProgressSnapshot> {
  const definitions = getRoleAchievementDefinitions(roleId);
  const validDefinitionIds = new Set(definitions.map((definition) => definition.id));
  const nextSnapshots = createEmptyAchievementSnapshots();

  if (!isObject(value)) {
    return nextSnapshots;
  }

  for (const [definitionId, rawSnapshot] of Object.entries(value)) {
    if (!validDefinitionIds.has(definitionId) || !isObject(rawSnapshot) || !isObject(rawSnapshot.values)) {
      continue;
    }

    nextSnapshots[definitionId] = {
      values: Object.fromEntries(
        Object.entries(rawSnapshot.values)
          .filter(([, metricValue]) => typeof metricValue === "number")
          .map(([metricId, metricValue]) => [metricId, Math.max(0, Math.floor(metricValue as number))]),
      ) as RoleAchievementProgressSnapshot["values"],
    };
  }

  return nextSnapshots;
}

function normalizeAchievementFlags(value: unknown): AccountProfile["achievementProgress"]["flags"] {
  const defaults = createAchievementFlags();

  if (!isObject(value)) {
    return defaults;
  }

  return Object.fromEntries(
    Object.keys(defaults).map((key) => [key, value[key] === true]),
  ) as AccountProfile["achievementProgress"]["flags"];
}

export function normalizeAccountProfile(value: unknown): AccountProfile | null {
  if (!isObject(value)) {
    return null;
  }

  const defaults = createDefaultAccountProfile();
  const validRoleIds = new Set<RoleId>(getRoleOptions().map((role) => role.id));

  const ownedRoleIds = Array.isArray(value.ownedRoleIds)
    ? value.ownedRoleIds.filter((item): item is RoleId => typeof item === "string" && validRoleIds.has(item as RoleId))
    : [];
  const normalizedOwnedRoleIds: RoleId[] = ownedRoleIds.includes("normal") ? ownedRoleIds : ["normal", ...ownedRoleIds];
  const selectedLobbyRoleId = typeof value.selectedLobbyRoleId === "string" && validRoleIds.has(value.selectedLobbyRoleId as RoleId)
    ? value.selectedLobbyRoleId as RoleId
    : defaults.selectedLobbyRoleId;
  const lobbyRolePageRaw = typeof value.lobbyRolePage === "number" ? Math.max(0, Math.floor(value.lobbyRolePage)) : defaults.lobbyRolePage;
  const lobbyRoleAchievementPageRaw = typeof value.lobbyRoleAchievementPage === "number"
    ? Math.max(0, Math.floor(value.lobbyRoleAchievementPage))
    : defaults.lobbyRoleAchievementPage;

  const roleProgress = { ...defaults.roleProgress };
  if (isObject(value.roleProgress)) {
    for (const role of getRoleOptions()) {
      const rawProgress = value.roleProgress[role.id];
      if (!isObject(rawProgress)) continue;

      const rawAchievementCount = typeof rawProgress.achievementCount === "number"
        ? Math.max(0, Math.floor(rawProgress.achievementCount))
        : defaults.roleProgress[role.id].achievementCount;
      const unlockedAchievementIds = normalizeUnlockedRoleAchievementIds(
        role.id,
        rawProgress.unlockedAchievementIds,
        rawAchievementCount,
      );

      roleProgress[role.id] = {
        level: typeof rawProgress.level === "number" ? Math.max(0, Math.floor(rawProgress.level)) : defaults.roleProgress[role.id].level,
        exp: typeof rawProgress.exp === "number" ? Math.max(0, Math.floor(rawProgress.exp)) : defaults.roleProgress[role.id].exp,
        expToNext: typeof rawProgress.expToNext === "number" ? Math.max(1, Math.floor(rawProgress.expToNext)) : defaults.roleProgress[role.id].expToNext,
        completedRuns: typeof rawProgress.completedRuns === "number" ? Math.max(0, Math.floor(rawProgress.completedRuns)) : defaults.roleProgress[role.id].completedRuns,
        achievementCount: unlockedAchievementIds.length,
        unlockedAchievementIds,
        achievementSnapshots: normalizeAchievementSnapshots(role.id, rawProgress.achievementSnapshots),
        availableStatPoints: typeof rawProgress.availableStatPoints === "number"
          ? Math.max(0, Math.floor(rawProgress.availableStatPoints))
          : defaults.roleProgress[role.id].availableStatPoints,
        allocatedStats: normalizePlayerStats(rawProgress.allocatedStats),
        passiveLevels: normalizePassiveLevels(role.id, rawProgress.passiveLevels),
        historyBest: normalizeHistoryBest(rawProgress.historyBest),
        unlocked: rawProgress.unlocked === true || normalizedOwnedRoleIds.includes(role.id),
        unlockConditionText: typeof rawProgress.unlockConditionText === "string"
          ? rawProgress.unlockConditionText
          : defaults.roleProgress[role.id].unlockConditionText,
      };
    }
  }

  for (const ownedRoleId of normalizedOwnedRoleIds) {
    roleProgress[ownedRoleId] = {
      ...roleProgress[ownedRoleId],
      unlocked: true,
      achievementCount: roleProgress[ownedRoleId].unlockedAchievementIds.length,
    };
  }

  const normalizedAchievementFlags = normalizeAchievementFlags(isObject(value.achievementProgress) ? value.achievementProgress.flags : undefined);
  const looksLikeLegacyStarterProfile = normalizedOwnedRoleIds.length === 1
    && normalizedOwnedRoleIds[0] === "normal"
    && isStarterAchievementState(normalizedAchievementFlags)
    && Object.entries(roleProgress).every(([roleId, progress]) => {
      const allowedLevel = roleId === "normal" ? progress.level === 0 || progress.level === 1 : progress.level === 0;
      return allowedLevel
        && progress.exp === 0
        && progress.completedRuns === 0
        && progress.achievementCount === 0
        && progress.unlockedAchievementIds.length === 0
        && isZeroAchievementSnapshots(progress.achievementSnapshots)
        && progress.availableStatPoints === 0
        && isZeroStats(progress.allocatedStats)
        && isZeroPassiveLevels(progress.passiveLevels)
        && isZeroHistoryBest(progress.historyBest);
    });

  if (looksLikeLegacyStarterProfile) {
    roleProgress.normal = {
      ...roleProgress.normal,
      level: 0,
    };
  }

  return {
    ownedRoleIds: Array.from(new Set(normalizedOwnedRoleIds)) as RoleId[],
    selectedLobbyRoleId,
    lobbyRolePage: Math.min(lobbyRolePageRaw, getLobbyRolePageCount() - 1),
    lobbyRoleAchievementPage: Math.min(lobbyRoleAchievementPageRaw, getRoleAchievementPageCount(selectedLobbyRoleId) - 1),
    metaCurrency: typeof value.metaCurrency === "number" ? Math.max(0, Math.floor(value.metaCurrency)) : defaults.metaCurrency,
    achievementProgress: {
      flags: normalizedAchievementFlags,
    },
    roleProgress,
  };
}

export function isRoleOwned(account: AccountProfile, roleId: RoleId): boolean {
  return account.ownedRoleIds.includes(roleId) || account.roleProgress[roleId]?.unlocked === true;
}

export function selectLobbyRole(account: AccountProfile, roleId: RoleId): AccountProfile {
  return {
    ...account,
    selectedLobbyRoleId: roleId,
    lobbyRolePage: getLobbyRolePageIndex(roleId),
    lobbyRoleAchievementPage: 0,
  };
}

export function getLobbyRolePageCount(pageSize = LOBBY_ROLE_PAGE_SIZE): number {
  const pageRowCount = pageSize === LOBBY_ROLE_PAGE_SIZE ? LOBBY_ROLE_PAGE_ROW_COUNT : Math.max(1, Math.floor(pageSize / 2));
  return Math.max(1, Math.ceil(LOBBY_ROLE_ROWS.length / pageRowCount));
}

export function getLobbyRolePageIndex(roleId: RoleId, pageSize = LOBBY_ROLE_PAGE_SIZE): number {
  const pageRowCount = pageSize === LOBBY_ROLE_PAGE_SIZE ? LOBBY_ROLE_PAGE_ROW_COUNT : Math.max(1, Math.floor(pageSize / 2));
  const rowIndex = LOBBY_ROLE_ROWS.findIndex((row) => row.includes(roleId));
  if (rowIndex >= 0) {
    return Math.floor(rowIndex / pageRowCount);
  }

  return 0;
}

export function changeLobbyRolePage(account: AccountProfile, delta: number, pageSize = LOBBY_ROLE_PAGE_SIZE): AccountProfile {
  const maxPageIndex = getLobbyRolePageCount(pageSize) - 1;
  return {
    ...account,
    lobbyRolePage: Math.min(maxPageIndex, Math.max(0, account.lobbyRolePage + delta)),
  };
}

export function getRoleAchievementPageCount(roleId: RoleId, pageSize = ROLE_ACHIEVEMENT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(getRoleAchievementDefinitions(roleId).length / pageSize));
}

export function changeRoleAchievementPage(
  account: AccountProfile,
  delta: number,
  roleId = account.selectedLobbyRoleId,
  pageSize = ROLE_ACHIEVEMENT_PAGE_SIZE,
): AccountProfile {
  const maxPageIndex = getRoleAchievementPageCount(roleId, pageSize) - 1;
  return {
    ...account,
    lobbyRoleAchievementPage: Math.min(maxPageIndex, Math.max(0, account.lobbyRoleAchievementPage + delta)),
  };
}

export function getLobbyRolePageItems(account: AccountProfile, pageSize = LOBBY_ROLE_PAGE_SIZE): RoleId[] {
  return getLobbyRolePageRows(account, pageSize).flatMap((row) => row);
}

export function getLobbyRolePageRows(
  account: AccountProfile,
  pageSize = LOBBY_ROLE_PAGE_SIZE,
): RoleId[][] {
  const pageRowCount = pageSize === LOBBY_ROLE_PAGE_SIZE ? LOBBY_ROLE_PAGE_ROW_COUNT : Math.max(1, Math.floor(pageSize / 2));
  const pageStart = account.lobbyRolePage * pageRowCount;
  return LOBBY_ROLE_ROWS.slice(pageStart, pageStart + pageRowCount).map((row) => [...row]);
}

export function buildAchievementMetaState(flags: AccountProfile["achievementProgress"]["flags"]): AchievementMetaState {
  return {
    flags,
    unlockedCount: getUnlockedAchievementCount(flags),
    totalCount: ACHIEVEMENT_DEFINITIONS.length,
  };
}

export function getRoleAchievementDisplayTotal(roleId: RoleId): number {
  return getRoleAchievementDefinitions(roleId).length;
}

function getStatLabel(statId: RoleGrowthStatId): string {
  switch (statId) {
    case "san":
      return "SAN";
    case "research":
      return "科研";
    case "social":
      return "社交";
    case "favor":
      return "好感";
    case "money":
      return "金币";
  }
}

function buildRoleUnlockState(account: AccountProfile, roleId: RoleId): RoleUnlockState {
  const owned = isRoleOwned(account, roleId);
  return {
    owned,
    statusLabel: owned ? "已拥有" : "未解锁",
    unlockConditionText: account.roleProgress[roleId]?.unlockConditionText ?? getRoleLobbyDefinition(roleId).unlockConditionText,
  };
}

function buildRoleStatsViewModel(roleId: RoleId, progress: RoleMetaProgress): LobbySelectedRoleStatViewModel[] {
  const role = getRoleDefinition(roleId);

  return getRoleLobbyDefinition(roleId).growthStatIds.map((statId) => ({
    id: statId,
    label: getStatLabel(statId),
    base: role.startingStats[statId],
    bonus: progress.allocatedStats[statId],
    total: role.startingStats[statId] + progress.allocatedStats[statId],
  }));
}

function buildRoleHistoryStatsViewModel(progress: RoleMetaProgress): LobbySelectedRoleHistoryStatViewModel[] {
  return [
    { id: "research-score", label: "科研分", value: progress.historyBest.researchScore },
    { id: "total-citations", label: "总引用", value: progress.historyBest.totalCitations },
    { id: "nature-count", label: "Nature数量", value: progress.historyBest.natureCount },
    { id: "representative-citations", label: "代表作引用", value: progress.historyBest.representativeCitations },
    { id: "representative-score", label: "代表作分数", value: progress.historyBest.representativeScore },
  ];
}

function buildRolePassivesViewModel(roleId: RoleId, progress: RoleMetaProgress): LobbySelectedRolePassiveViewModel[] {
  return getRoleLobbyDefinition(roleId).passiveDefinitions.map((definition) => ({
    definition,
    level: progress.passiveLevels[definition.id] ?? 0,
    unlocked: true,
  }));
}

function buildRoleAchievementsViewModel(roleId: RoleId, progress: RoleMetaProgress): LobbySelectedRoleAchievementViewModel[] {
  const unlockedIds = new Set(progress.unlockedAchievementIds);
  return getRoleAchievementDefinitions(roleId).map((definition) => ({
    definition,
    unlocked: unlockedIds.has(definition.id),
    progressLines: buildRoleAchievementProgressLines(roleId, definition.id, progress.achievementSnapshots[definition.id]),
  }));
}

export function buildLobbySelectedRoleViewModel(account: AccountProfile, roleId: RoleId): LobbySelectedRoleViewModel {
  const role = getRoleDefinition(roleId);
  const progress = account.roleProgress[roleId];

  return {
    role,
    lobby: getRoleLobbyDefinition(roleId),
    progress,
    unlockState: buildRoleUnlockState(account, roleId),
    stats: buildRoleStatsViewModel(roleId, progress),
    historyStats: buildRoleHistoryStatsViewModel(progress),
    passives: buildRolePassivesViewModel(roleId, progress),
    roleAchievements: buildRoleAchievementsViewModel(roleId, progress),
    achievementProgress: buildAchievementMetaState(account.achievementProgress.flags),
  };
}

function getPublishedPapersFromFinishedRun(state: Pick<GameState, "papers" | "externalPublications">): Paper[] {
  return [...state.papers, ...state.externalPublications].filter((paper) => paper.status === "published");
}

function buildHistoryBestFromFinishedRun(
  state: Pick<GameState, "totalResearchScore" | "totalCitations" | "papers" | "externalPublications">,
): RoleHistoryBest {
  const publishedPapers = getPublishedPapersFromFinishedRun(state);

  return {
    researchScore: Math.max(0, Math.floor(state.totalResearchScore)),
    totalCitations: Math.max(0, Math.floor(state.totalCitations)),
    natureCount: publishedPapers.filter((paper) => paper.target === "A").length,
    representativeCitations: publishedPapers.reduce(
      (best, paper) => Math.max(best, Math.max(0, Math.floor(paper.publication?.citations ?? 0))),
      0,
    ),
    representativeScore: publishedPapers.reduce(
      (best, paper) => Math.max(best, Math.max(0, Math.floor(getAcceptedPaperScore(paper)))),
      0,
    ),
  };
}

function mergeHistoryBest(current: RoleHistoryBest, next: RoleHistoryBest): RoleHistoryBest {
  return {
    researchScore: Math.max(current.researchScore, next.researchScore),
    totalCitations: Math.max(current.totalCitations, next.totalCitations),
    natureCount: Math.max(current.natureCount, next.natureCount),
    representativeCitations: Math.max(current.representativeCitations, next.representativeCitations),
    representativeScore: Math.max(current.representativeScore, next.representativeScore),
  };
}

function isSameHistoryBest(left: RoleHistoryBest, right: RoleHistoryBest): boolean {
  return left.researchScore === right.researchScore
    && left.totalCitations === right.totalCitations
    && left.natureCount === right.natureCount
    && left.representativeCitations === right.representativeCitations
    && left.representativeScore === right.representativeScore;
}

function isSameAchievementSnapshots(
  left: Record<string, RoleAchievementProgressSnapshot>,
  right: Record<string, RoleAchievementProgressSnapshot>,
): boolean {
  const leftIds = Object.keys(left).sort();
  const rightIds = Object.keys(right).sort();
  if (leftIds.length !== rightIds.length) {
    return false;
  }

  for (let index = 0; index < leftIds.length; index += 1) {
    if (leftIds[index] !== rightIds[index]) {
      return false;
    }
  }

  for (const definitionId of leftIds) {
    const leftSnapshot = left[definitionId];
    const rightSnapshot = right[definitionId];
    const leftValues = Object.keys(leftSnapshot?.values ?? {}).sort();
    const rightValues = Object.keys(rightSnapshot?.values ?? {}).sort();
    if (leftValues.length !== rightValues.length) {
      return false;
    }

    for (let index = 0; index < leftValues.length; index += 1) {
      const metricId = leftValues[index] as keyof RoleAchievementProgressSnapshot["values"];
      if (metricId !== rightValues[index]) {
        return false;
      }
      if ((leftSnapshot?.values?.[metricId] ?? 0) !== (rightSnapshot?.values?.[metricId] ?? 0)) {
        return false;
      }
    }
  }

  return true;
}

export function applyFinishedRunToAccountProfile(
  account: AccountProfile,
  state: Pick<GameState, "phase" | "ending" | "selectedRoleId" | "achievementFlags" | "player" | "shopState" | "totalResearchScore" | "totalCitations" | "papers" | "externalPublications">,
): AccountProfile {
  if (state.phase !== "finished") {
    return account;
  }

  const successfulRun = state.ending === "master" || state.ending === "phd";
  const roleId = state.selectedRoleId;
  const currentProgress = account.roleProgress[roleId];
  const nextCompletedRuns = successfulRun ? currentProgress.completedRuns + 1 : currentProgress.completedRuns;
  const nextAchievementSnapshots = Object.fromEntries(
    Object.entries(currentProgress.achievementSnapshots).map(([definitionId, snapshot]) => [
      definitionId,
      { values: { ...snapshot.values } },
    ]),
  ) as Record<string, RoleAchievementProgressSnapshot>;

  for (const definition of getRoleAchievementDefinitions(roleId)) {
    const mergedSnapshot = mergeRoleAchievementProgressSnapshot(
      roleId,
      definition.id,
      nextAchievementSnapshots[definition.id],
      buildRoleAchievementProgressSnapshotFromFinishedRun(roleId, definition.id, state, nextCompletedRuns),
    );

    if (mergedSnapshot) {
      nextAchievementSnapshots[definition.id] = mergedSnapshot;
    }
  }

  const unlockedAchievementIds = mergeUniqueIds([
    ...currentProgress.unlockedAchievementIds,
    ...getRoleAchievementDefinitions(roleId)
      .filter((definition) => (
        isRoleAchievementUnlockedFromFinishedRun(definition, state)
        || isRoleAchievementUnlockedFromSnapshot(roleId, definition.id, nextAchievementSnapshots[definition.id])
      ))
      .map((definition) => definition.id),
  ]);
  const nextHistoryBest = mergeHistoryBest(currentProgress.historyBest, buildHistoryBestFromFinishedRun(state));

  const nextProgress: RoleMetaProgress = {
    ...currentProgress,
    completedRuns: nextCompletedRuns,
    achievementCount: unlockedAchievementIds.length,
    unlockedAchievementIds,
    achievementSnapshots: nextAchievementSnapshots,
    historyBest: nextHistoryBest,
  };

  if (
    nextProgress.completedRuns === currentProgress.completedRuns
    && nextProgress.achievementCount === currentProgress.achievementCount
    && nextProgress.unlockedAchievementIds.length === currentProgress.unlockedAchievementIds.length
    && isSameAchievementSnapshots(nextProgress.achievementSnapshots, currentProgress.achievementSnapshots)
    && isSameHistoryBest(nextProgress.historyBest, currentProgress.historyBest)
  ) {
    return account;
  }

  return {
    ...account,
    roleProgress: {
      ...account.roleProgress,
      [roleId]: nextProgress,
    },
  };
}
