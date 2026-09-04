import { getRoleDefinition, getRoleOptions } from "./v2-progression";
import {
  getRoleAchievementDefinitions,
  getRoleLobbyAchievementDefinitions,
  getRoleProfileSummary,
} from "./v2-role-lobby-meta";
import type {
  AccountProfile,
  LobbySelectedRoleHistoryStatViewModel,
  LobbySelectedRoleAchievementViewModel,
  LobbySelectedRolePassiveViewModel,
  LobbySelectedRoleStatViewModel,
  LobbySelectedRoleViewModel,
  RoleHistoryBest,
  RoleGrowthStatId,
  RoleId,
  RoleLobbyDefinition,
  RoleMetaProgress,
  RoleUnlockState,
  DateDisplayMode,
  RolePassiveDefinition,
} from "./v2-types";

export const LOBBY_ROLE_PAGE_SIZE = 10;
export const LOBBY_ROLE_PAGE_ROW_COUNT = Math.max(1, Math.floor(LOBBY_ROLE_PAGE_SIZE / 2));
export const ROLE_ACHIEVEMENT_PAGE_SIZE = 8;
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

function createZeroHistoryBest(): RoleHistoryBest {
  return {
    researchScore: 0,
    totalCitations: 0,
    natureCount: 0,
    representativeCitations: 0,
    representativeScore: 0,
  };
}

function createPassiveDefinitions(roleId: RoleId): RolePassiveDefinition[] {
  const role = getRoleDefinition(roleId);
  const passiveDefinitions: RolePassiveDefinition[] = [
    {
      id: "trait",
      name: "角色特性",
      description: role.bonus,
    },
    {
      id: "awakening",
      name: role.awakenName,
      description: role.awakenDesc,
    },
  ];

  if (role.hiddenAwakenName && role.hiddenAwakenDesc) {
    passiveDefinitions.push({
      id: "hidden-awaken",
      name: role.hiddenAwakenName,
      description: role.hiddenAwakenDesc,
    });
  }

  return passiveDefinitions;
}

const ROLE_LOBBY_DEFINITIONS: Record<RoleId, RoleLobbyDefinition> = Object.fromEntries(
  getRoleOptions().map((role) => [
    role.id,
    {
      summary: getRoleProfileSummary(role.id),
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

export function createDefaultRoleMetaProgress(roleId: RoleId): RoleMetaProgress {
  const unlocked = roleId === "normal";

  return {
    level: 0,
    exp: 0,
    completedRuns: 0,
    unlockedAchievementIds: [],
    passiveLevels: createPassiveLevelMap(roleId),
    historyBest: createZeroHistoryBest(),
    unlocked,
  };
}

export function createDefaultAccountProfile(): AccountProfile {
  const roleProgress = Object.fromEntries(
    getRoleOptions().map((role) => [role.id, createDefaultRoleMetaProgress(role.id)]),
  ) as Record<RoleId, RoleMetaProgress>;

  return {
    dateDisplayMode: "calendar",
    selectedLobbyRoleId: "normal",
    lobbyRolePage: 0,
    lobbyRoleAchievementPage: 0,
    roleProgress,
  };
}

export function setDateDisplayMode(account: AccountProfile, dateDisplayMode: DateDisplayMode): AccountProfile {
  if (account.dateDisplayMode === dateDisplayMode) return account;
  return {
    ...account,
    dateDisplayMode,
  };
}

export function isRoleOwned(account: AccountProfile, roleId: RoleId): boolean {
  return account.roleProgress[roleId]?.unlocked === true;
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
  return Math.max(1, Math.ceil(getRoleLobbyAchievementDefinitions(roleId).length / pageSize));
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

export function getLobbyRolePageRows(
  account: AccountProfile,
  pageSize = LOBBY_ROLE_PAGE_SIZE,
): RoleId[][] {
  const pageRowCount = pageSize === LOBBY_ROLE_PAGE_SIZE ? LOBBY_ROLE_PAGE_ROW_COUNT : Math.max(1, Math.floor(pageSize / 2));
  const pageStart = account.lobbyRolePage * pageRowCount;
  return LOBBY_ROLE_ROWS.slice(pageStart, pageStart + pageRowCount).map((row) => [...row]);
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
  };
}

function buildRoleStatsViewModel(roleId: RoleId): LobbySelectedRoleStatViewModel[] {
  const role = getRoleDefinition(roleId);

  return getRoleLobbyDefinition(roleId).growthStatIds.map((statId) => ({
    id: statId,
    label: getStatLabel(statId),
    total: role.startingStats[statId],
  }));
}

function buildRoleHistoryStatsViewModel(progress: RoleMetaProgress): LobbySelectedRoleHistoryStatViewModel[] {
  return [
    { id: "research-score", label: "科研分", value: String(progress.historyBest.researchScore) },
    { id: "total-citations", label: "引用", value: String(progress.historyBest.totalCitations) },
    { id: "nature-count", label: "Nature", value: String(progress.historyBest.natureCount) },
    {
      id: "representative",
      label: "代表作",
      value: `${progress.historyBest.representativeScore}分 | ${progress.historyBest.representativeCitations}引`,
    },
    { id: "completed-runs", label: "通关次数", value: String(progress.completedRuns) },
  ];
}

function buildRolePassivesViewModel(roleId: RoleId, progress: RoleMetaProgress): LobbySelectedRolePassiveViewModel[] {
  return getRoleLobbyDefinition(roleId).passiveDefinitions.map((definition) => ({
    definition,
    level: progress.passiveLevels[definition.id] ?? 0,
  }));
}

function buildRoleAchievementsViewModel(
  roleId: RoleId,
  progress: RoleMetaProgress,
): LobbySelectedRoleAchievementViewModel[] {
  const unlockedIds = new Set(progress.unlockedAchievementIds);
  return getRoleAchievementDefinitions(roleId).map((definition) => ({
    definition,
    unlocked: unlockedIds.has(definition.id),
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
    stats: buildRoleStatsViewModel(roleId),
    historyStats: buildRoleHistoryStatsViewModel(progress),
    passives: buildRolePassivesViewModel(roleId, progress),
    roleAchievements: buildRoleAchievementsViewModel(roleId, progress),
  };
}
