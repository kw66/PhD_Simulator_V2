import type { AccountProfile, CoffeeMachineUpgradeId, ShopUpgradeId } from "../core/v2-types";
import type { ShopTabId } from "./v2-render-shop-panel";

export type PlayTabId = "events" | "workstation" | "relationship" | "shop" | "research" | "talent" | "settings";
export type LobbyViewId = "roles" | "info" | "messages";
export type LobbyInfoSectionId = "overview" | "mechanics" | "values" | "guide" | "events" | "systems" | "endings" | "updates";
export type TalentPanelTabId = "character" | "relation" | "equip" | "growth" | "publication";
export type ShopUpgradeNoticeTab = Extract<ShopTabId, "ai" | "coffee">;
export type ResearchSortMode = "year" | "citations";
export type ResearchAuthorshipFilter = "all" | "first" | "coauthor";
export interface PlayRenderUiState {
  activeLobbyView?: LobbyViewId;
  activeLobbyInfoSection?: LobbyInfoSectionId;
  isFeedbackOpen?: boolean;
  dateDisplayMode?: AccountProfile["dateDisplayMode"];
  showDebugEventRail?: boolean;
  showDebugBottomBar?: boolean;
  activePlayTab?: PlayTabId;
  isEventContentOpen?: boolean;
  activeEventId?: string | null;
  activeEventHistoryId?: string | null;
  activeEventHistoryIndex?: number | null;
  activeLogPage?: number | null;
  activePendingPage?: number | null;
  activeRelationshipIndex?: number | null;
  activeShopTab?: ShopTabId;
  showShopUpgradeNotice?: boolean;
  shopUpgradeNoticeTabs?: readonly ShopUpgradeNoticeTab[];
  selectedChairUpgradeId?: ShopUpgradeId | null;
  selectedCoffeeUpgradeId?: Exclude<CoffeeMachineUpgradeId, null> | null;
  activeTalentTab?: TalentPanelTabId;
  currentResearchPaperIndex?: number | null;
  researchSortMode?: ResearchSortMode;
  researchAuthorshipFilter?: ResearchAuthorshipFilter;
}
