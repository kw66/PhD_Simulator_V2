import type { FellowProgressProfile, GameState, RoleId } from "./v2-types";

export const CAPTAIN_TAG_IDS = ["normal", "rich", "genius", "social", "teacher-child", "chosen"] as const;
export type CaptainTag = typeof CAPTAIN_TAG_IDS[number];
export interface CaptainFellowHelpQueue { player: number[]; fellow: number[] }
export interface CaptainLoverHelp { amount: number; collaboratorId: string; name: string }
export interface CaptainRunState {
  levels: Record<CaptainTag, number>;
  tags: Record<string, CaptainTag>;
  initializedMembers: string[];
  actionRemainders: Record<string, number>;
  cooperationRemainders: Record<string, number>;
  loverAdvanceRemainder: number;
  /** Completed rewards retain their original amounts until eligible papers exist. */
  pendingFellowHelp?: Record<string, CaptainFellowHelpQueue>;
  pendingLoverHelp?: Record<string, CaptainLoverHelp[]>;
  lastMonthlySettlement?: number;
}

export function isCaptain(state: Pick<GameState, "selectedRoleId" | "captainState">): boolean {
  return state.selectedRoleId === "research-captain" && Boolean(state.captainState);
}
export function getCaptainTag(state: Pick<GameState, "selectedRoleId" | "captainState">, id: string): CaptainTag | undefined {
  return isCaptain(state) ? state.captainState?.tags[id] : undefined;
}
export function getCaptainLevel(state: Pick<GameState, "selectedRoleId" | "captainState">, id: string, tag: CaptainTag): number {
  return getCaptainTag(state, id) === tag ? state.captainState!.levels[tag] : 0;
}
export function getCaptainLoverId(state: GameState): string {
  return `lover:${state.loverState.startTotalMonths ?? 0}:${state.loverState.name ?? ""}`;
}
export function getCaptainFellowHelpQueue(state: GameState, profile: FellowProgressProfile): CaptainFellowHelpQueue {
  return state.captainState?.pendingFellowHelp?.[profile.id] ?? {
    player: profile.pendingHelpToPlayer == null ? [] : [profile.pendingHelpToPlayer],
    fellow: profile.pendingHelpToFellow == null ? [] : [profile.pendingHelpToFellow],
  };
}
export function getCaptainLoverHelpQueue(state: GameState): CaptainLoverHelp[] {
  return state.captainState?.pendingLoverHelp?.[getCaptainLoverId(state)]
    ?? (state.loverProgressState.pendingPaperHelp ? [state.loverProgressState.pendingPaperHelp] : []);
}
export function setCaptainLoverHelpQueue(state: GameState, queue: CaptainLoverHelp[]): GameState {
  return { ...state, captainState: { ...state.captainState!, pendingLoverHelp: {
    ...state.captainState!.pendingLoverHelp, [getCaptainLoverId(state)]: queue,
  } }, loverProgressState: { ...state.loverProgressState, pendingPaperHelp: queue[0] ?? null } };
}
export function getCaptainActiveMembers(state: GameState): string[] {
  return [...(state.selectedAdvisorName ? ["advisor"] : []),
    ...(state.loverState.active && state.loverProgressState.active ? [getCaptainLoverId(state)] : []),
    ...state.fellowProgressState.map((profile) => profile.id)];
}
export function getCaptainTagCount(state: GameState, tag: CaptainTag): number {
  return getCaptainActiveMembers(state).filter((id) => getCaptainTag(state, id) === tag).length;
}
export function getCaptainResearchCap(state: GameState, profile: FellowProgressProfile): number {
  return 20 + getCaptainLevel(state, profile.id, "genius");
}
export function getCaptainAffinityCap(state: GameState, profile: FellowProgressProfile): number {
  return 20 + getCaptainLevel(state, profile.id, "social");
}
export function getCaptainLoverResearchCap(state: GameState): number {
  return 20 + getCaptainLevel(state, getCaptainLoverId(state), "genius");
}
export function getCaptainLoverIntimacyCap(state: GameState): number {
  return 20 + getCaptainLevel(state, getCaptainLoverId(state), "social");
}
export function getCaptainCooperationMax(state: GameState, profile: FellowProgressProfile): number {
  return Math.max(1, (isCaptain(state) ? 100 : profile.taskMax) - 10 * getCaptainTagCount(state, "chosen"));
}
export function getCaptainGuidanceMultiplier(state: GameState, profile: FellowProgressProfile): number {
  return 1 + 0.2 * getCaptainLevel(state, profile.id, "teacher-child");
}
export function getCaptainLoverRouteMax(state: GameState): number {
  return Math.max(1, 100 - 5 * getCaptainLevel(state, getCaptainLoverId(state), "normal"));
}
export function getCaptainProjectMax(state: GameState, type: "horizontal" | "vertical"): number {
  return Math.max(1, 100 - 5 * getCaptainLevel(state, "advisor", type === "horizontal" ? "social" : "teacher-child"));
}
export function getCaptainAdvisorGuidanceBonus(state: GameState): number {
  return 5 * getCaptainTagCount(state, "teacher-child");
}
export function getCaptainAdvisorCitationMultiplier(state: GameState, paper: GameState["papers"][number]): number {
  return paper.collaborators?.some((person) => person.id === "advisor")
    ? 1 + 0.1 * getCaptainLevel(state, "advisor", "chosen") : 1;
}
export function createCaptainRunState(levels: Partial<Record<RoleId, number>> = {}): CaptainRunState {
  return { levels: Object.fromEntries(CAPTAIN_TAG_IDS.map((id) => [id,
    Number.isFinite(levels[id]) ? Math.max(0, Math.min(10, Math.floor(levels[id]!))) : 0])) as Record<CaptainTag, number>,
    tags: {}, initializedMembers: [], actionRemainders: {}, cooperationRemainders: {}, loverAdvanceRemainder: 0,
    pendingFellowHelp: {}, pendingLoverHelp: {} };
}
