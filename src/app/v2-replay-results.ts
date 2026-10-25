import { verifyReplayRecording, type ReplayRecording, type ReplayExecutionOptions } from "../core/v2-local-replay";
import { getPlayerAttributeCap } from "../core/v2-player-attributes";
import { withGameplayRuleset } from "../core/v2-rule-context";
import type { GameState } from "../core/v2-types";

export function deriveReplayResults(state: GameState) {
  return {
    researchScore: state.totalResearchScore,
    money: state.player.money,
    attributes: [
      { label: "SAN", value: state.player.san, cap: state.sanCap },
      ...(["research", "social", "favor"] as const).map((stat, index) => ({
        label: ["科研能力", "社交能力", "导师好感"][index]!,
        value: state.player[stat], cap: getPlayerAttributeCap(state, stat),
      })),
    ],
  };
}

export type ReplayResults = ReturnType<typeof deriveReplayResults>;

export type ReplayMetrics = Pick<ReplayResults, "money" | "attributes">;

export async function getReplayResults(recording: ReplayRecording, options: ReplayExecutionOptions = {}): Promise<ReplayResults> {
  const state = await verifyReplayRecording(recording, options);
  const finalAction = [...recording.replay.commands].reverse().find(command => command.kind === "action");
  return withGameplayRuleset(finalAction?.kind === "action" && finalAction.ruleset || recording.replay.ruleset,
    () => deriveReplayResults(state));
}
