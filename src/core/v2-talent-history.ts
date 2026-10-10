import { formatMoney } from "./v2-money";
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
  return `${label} ${delta > 0 ? "+" : ""}${formatMoney(delta)}（${formatMoney(before)}→${formatMoney(after)}）`;
}

export function describeTalentReward(label: string, reward: number, before: number, after: number): string {
  return `${label} ${reward > 0 ? "+" : ""}${formatMoney(reward)}（${formatMoney(before)}→${formatMoney(after)}）`;
}

/** A tier-resisted reward shows what actually landed: "科研 +0（8→8，抵抗1）". */
export function describeResistedTalentReward(
  label: string,
  before: number,
  result: { effectiveChange: number; resistedCount: number; cappedCount?: number },
): string {
  const gain = result.effectiveChange;
  const notes = [result.resistedCount > 0 ? `抵抗${formatMoney(result.resistedCount)}` : "", result.cappedCount ? "上限" : ""].filter(Boolean);
  return `${label} ${gain >= 0 ? "+" : ""}${formatMoney(gain)}（${formatMoney(before)}→${formatMoney(before + gain)}${notes.map((note) => `，${note}`).join("")}）`;
}
