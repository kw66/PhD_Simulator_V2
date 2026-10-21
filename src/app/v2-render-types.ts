import type { AccountProfile, CoffeeMachineUpgradeId, RoleExperienceAward, ShopUpgradeId } from "../core/v2-types";
import type { TalentAllocation } from "../core/v2-role-talent-definitions";
import type { RunSaveSummary } from "../core/v2-run-saves";
import type { ShopTabId } from "./v2-render-shop-panel";
import type { RewinderAct } from "./v2-render-rewinder-event";
import type { AcademicArchiveAct } from "./v2-render-rewinder-academic";

export type PlayTabId = "events" | "workstation" | "relationship" | "shop" | "research" | "talent" | "settings";
export type RoleRailViewId = "achievements" | "messages" | "announcements";
export type TalentPanelTabId = "character" | "relation" | "equip" | "growth" | "publication";
export type ShopUpgradeNoticeTab = Extract<ShopTabId, "ai" | "coffee">;
export type ResearchSortMode = "year" | "citations";
export type ResearchAuthorshipFilter = "all" | "first" | "coauthor";
/** Controls rendered in the play page's compact hint slot while viewing a replay. */
export interface ReplayTransportUiState {
  roleName: string;
  monthLabel: string;
  currentStep: number;
  totalSteps: number;
  playing: boolean;
  busy: boolean;
  speed: number;
  monthOptions: string;
}
export interface PlayRenderUiState {
  runSaves?: readonly RunSaveSummary[];
  saveStatus?: string;
  isRunSavePanelOpen?: boolean;
  hasRoleSave?: boolean;
  isSaveLoading?: boolean;
  activeRoleRailView?: RoleRailViewId;
  announcementPageIndex?: number;
  roleHistoryPageIndex?: number;
  rewinderStartYear?: number;
  talentTreePageIndex?: number;
  talentTreeSelectedNodeByPage?: readonly number[];
  talentAllocation?: TalentAllocation;
  roleLevel?: number;
  captainTagRoleProgress?: AccountProfile["roleProgress"];
  isFeedbackOpen?: boolean;
  isQuitConfirmationOpen?: boolean;
  dateDisplayMode?: AccountProfile["dateDisplayMode"];
  roleExperienceAward?: RoleExperienceAward;
  activePlayTab?: PlayTabId;
  helpPageByContext?: Readonly<Record<string, number>>;
  isHelpOpen?: boolean;
  /** The standalone replay player replaces normal help with inline transport controls. */
  isReplay?: boolean;
  isEventContentOpen?: boolean;
  isEndingContentOpen?: boolean;
  activeEventId?: string | null;
  activeEventHistoryId?: string | null;
  activeEventHistoryIndex?: number | null;
  activeRewinderAct?: RewinderAct;
  academicArchiveAct?: AcademicArchiveAct;
  activeLogPage?: number | null;
  isSanChartOpen?: boolean;
  activePendingPage?: number | null;
  activeRelationshipIndex?: number | null;
  activeShopTab?: ShopTabId;
  showShopUpgradeNotice?: boolean;
  shopUpgradeNoticeTabs?: readonly ShopUpgradeNoticeTab[];
  selectedChairUpgradeId?: ShopUpgradeId | null;
  selectedCoffeeUpgradeId?: Exclude<CoffeeMachineUpgradeId, null> | null;
  activeTalentTab?: TalentPanelTabId;
  advisorSalaryStartIndex?: number | null;
  labInheritancePage?: number;
  loverRewardPage?: number;
  internshipPage?: number;
  gameGrowthPage?: number;
  currentResearchPaperIndex?: number | null;
  researchPageIndex?: number;
  researchSortMode?: ResearchSortMode;
  researchAuthorshipFilter?: ResearchAuthorshipFilter;
  replayTransport?: ReplayTransportUiState;
}
