import type { GameState } from "./v2-types";

export interface TalentTriggerRecord {
  name: string;
  recipient: string;
  reason: string;
  effects: string[];
  details?: string[];
}

export function recordTalentTrigger(state: GameState, key: string, trigger: TalentTriggerRecord): GameState {
  const id = `talent:${key}`;
  if (state.eventHistory.some((record) => record.id === id)) return state;
  const title = `🌱 天赋·${trigger.name}`;
  const result = `${trigger.recipient}；${trigger.effects.join("；")}`;
  return {
    ...state,
    eventHistory: [...state.eventHistory, {
      id, chainId: id, source: "system", completedAtTotalMonths: state.totalMonths,
      completedAtYear: state.year, completedAtMonth: state.month,
      stages: [{
        title, description: [trigger.reason, ...trigger.effects, ...(trigger.details ?? [])].join("\n\n"),
        talentTrigger: trigger, choices: [], selectedChoiceId: "",
      }],
    }],
    log: [{ id, month: state.totalMonths, text: `${title}：${result}`, eventHistoryId: id }, ...state.log],
  };
}

export function describeTalentChange(label: string, before: number, after: number): string {
  const delta = after - before;
  return `${label}${delta > 0 ? "+" : ""}${delta}（${before}→${after}）`;
}
