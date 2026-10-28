import { pickStableRandomName, RANDOM_ADVISOR_GIVEN_CHARS, RANDOM_ADVISOR_SURNAMES } from "./v2-random-name";
import type { GameState } from "./v2-types";

type PersonNameState = Partial<Pick<GameState, "playerName" | "selectedAdvisorName" | "fellowProgressState"
  | "loverState" | "conferenceEncounterState" | "fellowFinanceAccounts" | "papers" | "externalPublications" | "fellowPapers">>;

/** Names belong to people, including retained authors who have left the lab. */
export function getKnownPersonNames(state: PersonNameState, excludedIds: readonly string[] = []): string[] {
  const excluded = new Set(excludedIds);
  const names = new Set<string>();
  const add = (id: string, name?: string | null) => {
    if (!excluded.has(id) && name?.trim()) names.add(name.trim());
  };
  add("player", state.playerName);
  add("advisor", state.selectedAdvisorName);
  for (const fellow of state.fellowProgressState ?? []) add(fellow.id, fellow.name ?? pickStableRandomName(`fellow:${fellow.id}`));
  for (const [id, account] of Object.entries(state.fellowFinanceAccounts ?? {})) add(id, account.name);
  const lover = state.loverState;
  if (lover?.active && !excluded.has("lover")) add(lover.contactId ?? "lover", lover.name);
  const encounter = state.conferenceEncounterState;
  if (encounter?.bigBull) add(encounter.bigBull.id, encounter.bigBull.name);
  for (const contact of Object.values(encounter?.scholars ?? {})) if (contact) add(contact.id, contact.name);
  for (const paper of [...(state.papers ?? []), ...(state.externalPublications ?? []), ...(state.fellowPapers ?? [])]) {
    if (paper.leadAuthorName) add(paper.leadAuthorId ?? `paper-author:${paper.id}`, paper.leadAuthorName);
    for (const author of paper.collaborators ?? []) add(author.id, author.name);
  }
  return [...names];
}

/** Collision recovery never consumes gameplay randomness and has a finite fallback. */
export function getUniquePersonName(candidate: string, usedNames: readonly string[], seed: string): string {
  const occupied = new Set(usedNames.map(name => name.trim()).filter(Boolean));
  if (candidate.trim() && !occupied.has(candidate.trim())) return candidate.trim();
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const name = pickStableRandomName(`person:${seed}:${attempt}`);
    if (!occupied.has(name)) return name;
  }
  for (const surname of new Set(RANDOM_ADVISOR_SURNAMES)) {
    for (const first of new Set(RANDOM_ADVISOR_GIVEN_CHARS)) {
      for (const second of new Set(RANDOM_ADVISOR_GIVEN_CHARS)) {
        const name = surname + first + second;
        if (!occupied.has(name)) return name;
      }
    }
  }
  let suffix = 1;
  while (occupied.has(`新同学${suffix}`)) suffix += 1;
  return `新同学${suffix}`;
}
