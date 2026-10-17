import { captureRewinderGrowth, mergeRewinderGrowth, applyRewinderGrowth, REWINDER_ATTRIBUTE_KEYS, getRewinderGrowthCounterKeys } from "./v2-rewinder-growth";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import { captureRewinderRelationships, mergeRewinderRelationships, applyRewinderAdvisor, restoreRewinderRelationship, isRewinderRelationshipsSnapshot } from "./v2-rewinder-relationships";
import { enqueuePendingEvents } from "./v2-event-enqueue";
import { getEffectiveSocial } from "./v2-effective-attributes";
import { syncRelationshipState } from "./v2-relationship-rules";
import { getFellowName, getFellowRoleLabel } from "./v2-fellow-progression";
import { getFellowAcademicLabel } from "./v2-fellow-academic";
import { getLoverName } from "./v2-lover-system";
import { formatMoney } from "./v2-money";
import type { RewinderArchive, RewinderPresentation, RewinderYearRecord } from "./v2-rewinder-state";
import type { AccountProfile, GameState, PendingEvent } from "./v2-types";

export interface RewinderCandidate { key: string; name: string; kind: "fellow" | "lover"; detail: string; selected: boolean; disabledReason?: string }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const validNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e12;

/** One independent record per academic year, with no executable or unrelated state. */
export function normalizeRewinderArchive(value: unknown): RewinderArchive {
  const archive: RewinderArchive = { years: {} };
  if (!object(value) || !object(value.years)) return archive;
  for (let year = 1; year <= 6; year++) {
    const record = value.years[year];
    if (!object(record) || !object(record.growth) || !object(record.growth.attributes) || !object(record.growth.growth)
      || !isRewinderRelationshipsSnapshot(record.relationships)) continue;
    const { attributes } = record.growth;
    const modernGrowth = usesGameplayRulesFrom("20261018-r7");
    const counterKeys = getRewinderGrowthCounterKeys();
    const growth: Record<string, unknown> = modernGrowth
      ? { ...record.growth.growth, paperMasteryCount: record.growth.growth.paperMasteryCount ?? 0 } : record.growth.growth;
    if (!REWINDER_ATTRIBUTE_KEYS.every(key => validNumber(attributes[key]))
      || !counterKeys.every(key => validNumber(growth[key]) && Number.isSafeInteger(growth[key]))
      || (!modernGrowth && (typeof growth.hasInternshipExperience !== "boolean" || typeof growth.hasJointTrainingExperience !== "boolean"))) continue;
    archive.years[year] = {
      growth: {
        attributes: Object.fromEntries(REWINDER_ATTRIBUTE_KEYS.map(key => [key, attributes[key]])) as RewinderYearRecord["growth"]["attributes"],
        growth: { ...Object.fromEntries(counterKeys.map(key => [key, growth[key]])), ...(!modernGrowth ? {
          hasInternshipExperience: growth.hasInternshipExperience, hasJointTrainingExperience: growth.hasJointTrainingExperience,
        } : {}) } as RewinderYearRecord["growth"]["growth"],
      },
      relationships: structuredClone(record.relationships),
    };
  }
  return archive;
}

export function initializeRewinder(state: GameState, history?: RewinderArchive): GameState {
  if (state.selectedRoleId !== "rewinder") return state;
  return { ...state, rewinderState: { history: normalizeRewinderArchive(history), records: { years: {} }, restoredKeys: [], completedYears: [] } };
}

function capture(state: GameState): RewinderYearRecord {
  return { growth: captureRewinderGrowth(state), relationships: captureRewinderRelationships(state) };
}
function merge(current: RewinderYearRecord, previous?: RewinderYearRecord): RewinderYearRecord {
  return { growth: mergeRewinderGrowth(current.growth, previous?.growth),
    relationships: previous ? mergeRewinderRelationships(previous.relationships, current.relationships) : current.relationships };
}
function applyAutomatic(state: GameState, record: RewinderYearRecord): GameState {
  const next = applyRewinderAdvisor(applyRewinderGrowth(state, record.growth), record.relationships);
  return { ...next, relationshipState: syncRelationshipState(next.relationshipState, getEffectiveSocial(next)) };
}
function applySelected(state: GameState, historical: RewinderYearRecord | undefined, keys: readonly string[]): GameState {
  if (!historical) return state;
  for (const key of keys) {
    if (state.rewinderState!.restoredKeys.includes(key)) continue;
    state = restoreRewinderRelationship(state, historical.relationships, key).state;
  }
  return state;
}

export function getRewinderPreview(state: GameState): (RewinderPresentation & { candidates: RewinderCandidate[] }) | null {
  const run = state.rewinderState;
  if (state.selectedRoleId !== "rewinder" || !run?.pending) return null;
  const { year, selectedKeys } = run.pending;
  const before = capture(state);
  const historical = run.history.years[year];
  const record = merge(before, historical);
  const automatic = applyAutomatic(state, record);
  const after = capture(applySelected(automatic, historical, selectedKeys));
  const candidates: RewinderCandidate[] = historical ? [
    ...historical.relationships.fellows.map(person => ({ key: person.key, name: getFellowName(person.profile), kind: "fellow" as const,
      detail: `${getFellowRoleLabel(person.profile.type, person.profile.gender)} · ${getFellowAcademicLabel({ year: person.capturedYear }, person.profile)} · 科研 ${formatMoney(person.profile.research)} · 默契 ${formatMoney(person.profile.affinity)} · 科研分 ${formatMoney(person.profile.initialResearchScore ?? 0)} · 协作 ${formatMoney(person.profile.taskProgress)}/${formatMoney(person.profile.taskMax)}` })),
    ...historical.relationships.lovers.map(person => ({ key: person.key, name: getLoverName(person.lover), kind: "lover" as const,
      detail: `${person.lover.type === "beautiful" ? "活泼" : "聪慧"} · 科研 ${formatMoney(person.progress.research)} · 亲密 ${formatMoney(person.progress.intimacy)} · ${([['play', '玩耍'], ['study', '学习'], ['shopping', '购物']] as const).map(([route, label]) => `${label} ${formatMoney(person.progress.routes?.[route].progress ?? 0)}/100（${person.progress.routes?.[route].completed ?? 0}次）`).join(' · ')}` })),
  ].map(candidate => {
    const selected = selectedKeys.includes(candidate.key);
    const occupied = applySelected(automatic, historical, selectedKeys.filter(key => key !== candidate.key));
    const reason = run.restoredKeys.includes(candidate.key) ? "本世已重逢" : restoreRewinderRelationship(occupied, historical.relationships, candidate.key).reason;
    return { ...candidate, selected, ...(reason ? { disabledReason: reason } : {}) };
  }) : [];
  return { year, before, after, candidates };
}

export function toggleRewinderPerson(state: GameState, key?: string): GameState {
  const preview = getRewinderPreview(state);
  const candidate = preview?.candidates.find(item => item.key === key);
  if (!candidate || (candidate.disabledReason && !candidate.selected)) return state;
  const run = state.rewinderState!;
  const selectedKeys = candidate.selected ? run.pending!.selectedKeys.filter(item => item !== key) : [...run.pending!.selectedKeys, candidate.key];
  return { ...state, rewinderState: { ...run, pending: { ...run.pending!, selectedKeys } } };
}

export function isRewinderYearEnd(state: GameState): boolean {
  return state.selectedRoleId === "rewinder" && state.phase === "playing" && state.totalMonths > 0
    && (state.month === 12 || state.totalMonths >= state.maxMonths)
    && !state.rewinderState?.completedYears.includes(state.year);
}

export function prepareRewinderYear(state: GameState): GameState {
  if (!isRewinderYearEnd(state) || state.rewinderState?.pending) return state;
  const base = state.rewinderState ? state : initializeRewinder(state);
  const next = { ...base, rewinderState: { ...base.rewinderState!, monthEndProcessed: state.totalMonths,
    pending: { year: state.year, selectedKeys: [] as string[] } } };
  const preview = getRewinderPreview(next)!;
  const event: PendingEvent = {
    id: `rewinder-year-${state.year}-${state.totalMonths}`, chainId: `rewinder-year-${state.year}`,
    title: `第${state.year}学年 · 轮回`, description: "这一学年走到尽头，往世的积累再次与你相遇。",
    source: "system", stage: "result", deadlineMonths: 0, blocking: true,
    rewinderPresentation: { year: preview.year, before: preview.before, after: preview.after },
    choices: [{ id: "confirm-rewinder-year", label: "完成轮回", outcome: `保存第${state.year}学年轮回记录`, effects: {} }],
  };
  return enqueuePendingEvents(next, [event]).nextState;
}

/** Apply once before the ordinary event confirmation writes its history. */
export function completeRewinderYear(state: GameState): GameState {
  const preview = getRewinderPreview(state);
  if (!preview) return state;
  const run = state.rewinderState!;
  const history = run.history.years[preview.year];
  const record = merge(preview.before, history);
  let next = applyAutomatic(state, record);
  const restoredKeys = [...run.restoredKeys];
  for (const candidate of preview.candidates) {
    if (!candidate.selected || candidate.disabledReason || !history) continue;
    const restoration = restoreRewinderRelationship(next, history.relationships, candidate.key);
    if (restoration.restored) { next = restoration.state; restoredKeys.push(candidate.key); }
  }
  const after = capture(next);
  const saved = merge(after, record);
  return { ...next,
    rewinderState: { ...run, pending: undefined, restoredKeys, completedYears: [...run.completedYears, preview.year],
      records: { years: { ...run.records.years, [preview.year]: saved } } },
    eventQueue: next.eventQueue.map(event => event.chainId !== `rewinder-year-${preview.year}` ? event : {
      ...event, rewinderPresentation: { year: preview.year, before: preview.before, after },
    }),
  };
}

/** Called only inside the existing atomic, non-debug, replay-verified finalization. */
export function settleRewinderArchive(account: AccountProfile, state: GameState): AccountProfile {
  if (state.phase !== "finished" || state.selectedRoleId !== "rewinder" || !state.rewinderState) return account;
  const archive = normalizeRewinderArchive(account.rewinderArchive);
  const records = normalizeRewinderArchive(state.rewinderState.records);
  for (const [key, record] of Object.entries(records.years)) {
    if (record) archive.years[Number(key)] = merge(record, archive.years[Number(key)]);
  }
  return { ...account, rewinderArchive: archive };
}
