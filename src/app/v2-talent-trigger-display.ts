import type { GameState } from "../core/v2-types";

type HistoryEntry = GameState["eventHistory"][number];

/** Old replay evidence stays intact; only correct the inherited reading reward's presentation. */
export function getTalentTriggerDisplay(record: HistoryEntry, history: readonly HistoryEntry[]) {
  const trigger = record.stages.find(stage => stage.talentTrigger)?.talentTrigger;
  if (!trigger || !record.chainId.startsWith("talent:reading-growth:")) return trigger;
  const index = history.findIndex(entry => entry.id === record.id);
  const inherited = history.slice(0, index).some(entry => {
    // Confirmation advances the calendar before recording the growth transition.
    if (entry.completedAtTotalMonths + 1 !== record.completedAtTotalMonths) return false;
    return entry.stages.some(stage => {
      const annual = stage.rewinderPresentation;
      if (!annual) return false;
      const before = annual.before.growth.growth.readCount;
      const after = annual.after.growth.growth.readCount;
      return Math.floor(after / 10) > Math.floor(before / 10)
        && trigger.reason === `累计阅读${after}次`;
    });
  });
  if (!inherited) return trigger;
  return { ...trigger, effects: trigger.effects.map(effect => effect.startsWith("科研奖励 +")
    ? "继承阅读积累，不重复发放科研奖励" : effect) };
}
