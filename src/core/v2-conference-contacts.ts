import { pickStableRandomName } from "./v2-random-name";
import { getRoleDefinition } from "./v2-progression";
import type { ConferenceEncounterState, ConferenceMentorContact, ConferenceScholarContact, Gender, LoverTypeId, RoleId } from "./v2-types";

export interface ContactSeed {
  id: string;
  roll?: number;
  levelRoll?: number;
  selectedRoleId?: RoleId;
  playerGender?: Gender;
}

const defaultSeed: ContactSeed = { id: "conference-contact" };

function normalizeRoll(roll = 0.5): number {
  return Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0.5;
}

function contactId(kind: string, seed: ContactSeed, previousId = ""): string {
  const source = JSON.stringify([seed.id, kind, seed.selectedRoleId ?? "normal", normalizeRoll(seed.roll), previousId]);
  let firstHash = 2166136261;
  let secondHash = 5381;
  for (const character of source) {
    firstHash = Math.imul(firstHash ^ character.charCodeAt(0), 16777619);
    secondHash = Math.imul(secondHash, 33) ^ character.charCodeAt(0);
  }
  const id = `conference:${kind}:${(firstHash >>> 0).toString(36)}-${(secondHash >>> 0).toString(36)}`;
  return id === previousId ? `${id}:next` : id;
}

function contactName(id: string, previousName?: string): string {
  let attempt = 0;
  let name = pickStableRandomName(id);
  while (name === previousName) {
    attempt += 1;
    name = pickStableRandomName(`${id}:${attempt}`);
  }
  return name;
}

export function createConferenceMentorContact(seed: ContactSeed = defaultSeed): ConferenceMentorContact {
  const id = contactId("mentor", seed);
  return { id, name: contactName(id), level: Math.floor(normalizeRoll(seed.levelRoll) * 3) as 0 | 1 | 2, cooperationCount: 0 };
}

export function createConferenceScholarContact(type: LoverTypeId, seed: ContactSeed = defaultSeed): ConferenceScholarContact {
  const id = contactId(`scholar:${type}`, seed);
  const playerGender = seed.playerGender ?? getRoleDefinition(seed.selectedRoleId ?? "normal").gender;
  return { id, name: contactName(id), gender: playerGender === "female" ? "male" : "female", encounterCount: 0 };
}

export function getConferenceMentorContact(encounter: ConferenceEncounterState, seed: ContactSeed = defaultSeed): ConferenceMentorContact {
  return encounter.bigBull ?? createConferenceMentorContact(seed);
}

export function getConferenceScholarContact(encounter: ConferenceEncounterState, type: LoverTypeId, seed: ContactSeed = defaultSeed): ConferenceScholarContact {
  return encounter.scholars?.[type] ?? createConferenceScholarContact(type, seed);
}

export function replaceConferenceMentorContact(previous: ConferenceMentorContact, seed: ContactSeed = defaultSeed): ConferenceMentorContact {
  const id = contactId("mentor", seed, previous.id);
  return { ...createConferenceMentorContact(seed), id, name: contactName(id, previous.name) };
}

export function replaceConferenceScholarContact(previous: ConferenceScholarContact, type: LoverTypeId, seed: ContactSeed = defaultSeed): ConferenceScholarContact {
  const id = contactId(`scholar:${type}`, seed, previous.id);
  return { ...createConferenceScholarContact(type, seed), id, name: contactName(id, previous.name), gender: previous.gender };
}
