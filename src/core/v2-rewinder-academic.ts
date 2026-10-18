import { captureAcademicYear, mergeAcademicYear, restoreAcademicYear, normalizeAcademicArchive,
  buildAcademicCandidates, type AcademicArchive, type AcademicYearRecord } from "./v2-rewinder-academic-record";
import type { GameState } from "./v2-types";

export interface AcademicSelection {
  paperSource: "current" | "previous";
  coffeeSource?: "current" | "previous";
  personKeys: string[];
}
export interface AcademicRunState {
  startYear: number;
  /** Immutable copy for this attempt and its deterministic replay. */
  history: AcademicArchive;
  pending?: AcademicSelection;
  completed?: AcademicYearRecord;
}

export function getAvailableAcademicYears(value?: AcademicArchive): number[] {
  const archive = normalizeAcademicArchive(value);
  return [1, 2, 3, 4, 5, 6].filter(year => year === 1 || !!archive.years[year - 1]
    && archive.years[year - 1]!.identity.maxMonths > (year - 1) * 12);
}

export function initializeAcademicRun(state: GameState, value?: AcademicArchive, requestedYear = 1): GameState | null {
  if (state.selectedRoleId !== "rewinder") return state;
  const history = normalizeAcademicArchive(value);
  if (!Number.isInteger(requestedYear) || !getAvailableAcademicYears(history).includes(requestedYear)) return null;
  const restored = requestedYear === 1 ? state : restoreAcademicYear(state, history.years[requestedYear - 1]!);
  return { ...restored, rewinderState: {
    ...state.rewinderState!, history: { years: {} }, records: { years: {} }, restoredKeys: [], completedYears: [],
    academic: { startYear: requestedYear, history },
  } };
}

export function isAcademicArchivePending(state: GameState): boolean {
  return state.selectedRoleId === "rewinder" && state.phase === "playing" && !!state.rewinderState?.academic?.pending;
}

export function isAcademicYearEnd(state: GameState): boolean {
  const run = state.rewinderState?.academic;
  return state.selectedRoleId === "rewinder" && state.phase === "playing" && !!run
    && state.year === run.startYear && state.year <= 5 && state.month === 12
    && state.totalMonths === state.year * 12 && state.totalMonths < state.maxMonths && !run.pending && !run.completed;
}

function samePersonKey(record: AcademicYearRecord, key: string): string | undefined {
  const id = key.slice(key.indexOf(":") + 1);
  if (id === "advisor" || id === "lover") return id;
  const fellow = record.people.fellows.find(person => `fellow:${person.profile.id}` === id);
  return fellow ? `fellow:${fellow.profile.gender}:${fellow.profile.name ?? fellow.profile.id}` : undefined;
}

export function getAcademicArchivePreview(state: GameState) {
  const run = state.rewinderState?.academic;
  if (!isAcademicArchivePending(state) || !run?.pending) return null;
  const current = captureAcademicYear(state);
  const previous = run.history.years[state.year];
  const selection = run.pending;
  const choices = buildAcademicCandidates(current, previous);
  const selected = choices.filter(candidate => selection.personKeys.includes(candidate.key));
  const candidates = choices.map(candidate => {
    const source = candidate.key.startsWith("previous:") ? previous : current;
    const identity = source && samePersonKey(source, candidate.key);
    const isSelected = selection.personKeys.includes(candidate.key);
    const repeated = !isSelected && candidate.kind === "fellow" && selected.some(person => {
      const otherSource = person.key.startsWith("previous:") ? previous : current;
      return otherSource && (samePersonKey(otherSource, person.key) === identity
        || person.key.slice(person.key.indexOf(":") + 1) === candidate.key.slice(candidate.key.indexOf(":") + 1));
    });
    const full = !isSelected && candidate.kind === "fellow" && selected.filter(person => person.kind === "fellow").length >= 4;
    return { ...candidate, selected: isSelected,
      ...(repeated ? { disabledReason: "已选择这位同学的另一份记录" } : full ? { disabledReason: "请先移除一张同伴卡" } : {}) };
  });
  const valid = selection.personKeys.every(key => choices.some(candidate => candidate.key === key))
    && new Set(selection.personKeys).size === selection.personKeys.length
    && selected.filter(candidate => candidate.kind === "advisor").length === 1
    && selected.filter(candidate => candidate.kind === "lover").length <= 1
    && selected.filter(candidate => candidate.kind === "fellow").length <= 4;
  return { year: state.year, cycleNumber: state.rewinderState?.cycleNumber ?? 1,
    current, previous, best: mergeAcademicYear(current, previous, selection),
    paperSource: selection.paperSource, coffeeSource: selection.coffeeSource ?? "current", candidates, canConfirm: valid };
}

export function prepareAcademicArchive(state: GameState): GameState {
  if (!isAcademicYearEnd(state)) return state;
  const current = captureAcademicYear(state);
  const pending: AcademicSelection = { paperSource: "current", coffeeSource: "current",
    personKeys: buildAcademicCandidates(current).map(candidate => candidate.key) };
  return { ...state, rewinderState: { ...state.rewinderState!, monthEndProcessed: state.totalMonths,
    academic: { ...state.rewinderState!.academic!, pending } } };
}

export function toggleAcademicPerson(state: GameState, key?: string): GameState {
  const preview = getAcademicArchivePreview(state);
  const candidate = preview?.candidates.find(person => person.key === key);
  if (!preview || !candidate || candidate.disabledReason || state.rewinderState?.academic?.completed) return state;
  const run = state.rewinderState!.academic!;
  let personKeys = [...run.pending!.personKeys];
  if (candidate.selected) {
    if (candidate.kind === "advisor") return state;
    personKeys = personKeys.filter(item => item !== key);
  } else {
    if (candidate.kind !== "fellow") personKeys = personKeys.filter(item => preview.candidates.find(person => person.key === item)?.kind !== candidate.kind);
    personKeys.push(candidate.key);
  }
  return { ...state, rewinderState: { ...state.rewinderState!, academic: { ...run, pending: { ...run.pending!, personKeys } } } };
}

export function selectAcademicSource(state: GameState, field: "paperSource" | "coffeeSource", source?: "current" | "previous"): GameState {
  if (!isAcademicArchivePending(state) || state.rewinderState?.academic?.completed
    || (source !== "current" && source !== "previous")) return state;
  const run = state.rewinderState!.academic!;
  if (source === "previous" && !run.history.years[state.year] || run.pending![field] === source) return state;
  return { ...state, rewinderState: { ...state.rewinderState!, academic: { ...run,
    pending: { ...run.pending!, [field]: source } } } };
}

/** Selection is replayed before the store commits the account in one transaction. */
export function completeAcademicArchive(state: GameState): GameState {
  if (state.rewinderState?.academic?.completed) return state;
  const preview = getAcademicArchivePreview(state);
  if (!preview?.canConfirm) return state;
  return { ...state, rewinderState: { ...state.rewinderState!, academic: { ...state.rewinderState!.academic!, completed: preview.best } } };
}

export function storeAcademicArchive(value: AcademicArchive | undefined, record: AcademicYearRecord): AcademicArchive {
  const archive = normalizeAcademicArchive(value);
  return { ...archive, years: { ...archive.years, [record.year]: structuredClone(record) },
    attempts: { ...archive.attempts, [record.year]: (archive.attempts?.[record.year] ?? 0) + 1 } };
}
