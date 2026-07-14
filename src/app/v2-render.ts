import { createDefaultAccountProfile } from "../core/v2-account";
import type { AccountProfile, GameState } from "../core/v2-types";
import { renderPlayScreen } from "./v2-render-play";
import type { ShopTabId } from "./v2-render-shop-panel";
import { renderSetupScreen } from "./v2-render-setup-screen";

export type ResearchPaperFilterId = "S" | "A" | "B" | "C";
export type TalentPanelTabId = "character" | "relation" | "equip";
export const WORKSTATION_CONFERENCE_PANEL_INDEX = -1;
export const WORKSTATION_GRADUATION_PANEL_INDEX = 4;

export interface PlayRenderUiState {
  isEventContentOpen?: boolean;
  activeEventId?: string | null;
  activeLogPage?: number | null;
  activeRelationshipIndex?: number | null;
  activeShopTab?: ShopTabId;
  activeTalentTab?: TalentPanelTabId;
  activeWorkstationPanelIndex?: number | null;
  conferenceMonthOffset?: number;
  currentResearchPaperFilter?: ResearchPaperFilterId;
  currentResearchPaperIndex?: number | null;
}

export function renderApp(
  state: GameState,
  accountProfile: AccountProfile = createDefaultAccountProfile(),
  playUiState: PlayRenderUiState = {},
): string {
  return state.phase === "setup" ? renderSetupScreen(state, accountProfile) : renderPlayScreen(state, playUiState);
}
