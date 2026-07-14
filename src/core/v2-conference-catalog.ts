import type { PaperTarget } from "./v2-types";
import {
  CONFERENCES,
  CONFERENCE_LOCATIONS,
  MAINLAND_LOCATIONS,
  MAINLAND_ONLY_CONFERENCES,
  type ConferenceInfo,
  type ConferenceLocation,
} from "./v2-conference-catalog-data";

function getGradeSeedOffset(target: PaperTarget): number {
  if (target === "A") return 0;
  if (target === "B") return 1;
  return 2;
}

function getDeterministicLocation(locations: ConferenceLocation[], gameMonth: number, gameYear: number, target: PaperTarget): ConferenceLocation {
  if (locations.length === 0) {
    return { city: "未知", country: "未知", region: "west" };
  }
  const seed = gameYear * 997 + gameMonth * 131 + getGradeSeedOffset(target) * 37;
  const index = ((seed % locations.length) + locations.length) % locations.length;
  return locations[index];
}

export function getRealConferenceYear(gameYear: number, gameMonth: number): number {
  return 2029 + Number(gameYear || 0) + (Number(gameMonth || 0) >= 5 ? 1 : 0);
}

export function getConferenceInfo(gameMonth: number, target: PaperTarget, gameYear: number): ConferenceInfo {
  const month = Number(gameMonth || 0);
  const year = Number(gameYear || 1);
  if (month === 0 || !CONFERENCES[month]) {
    return { name: "-", fullName: "入学前无会议", field: "-", year, month };
  }

  const conference = CONFERENCES[month][target] ?? CONFERENCES[month].C;
  const realYear = getRealConferenceYear(year, month);
  if (conference.alternates) {
    const selected = realYear % 2 === 1 ? conference.alternates.odd : conference.alternates.even;
    return { name: selected.name, fullName: selected.fullName, field: conference.field, year: realYear, month };
  }
  return {
    name: conference.name,
    fullName: conference.fullName ?? conference.name,
    field: conference.field,
    year: realYear,
    month,
  };
}

export function getConferenceLocation(gameMonth: number, target: PaperTarget, gameYear: number): ConferenceLocation {
  const month = Number(gameMonth || 1);
  const year = Number(gameYear || 1);
  const isMainlandOnly = MAINLAND_ONLY_CONFERENCES[month]?.includes(target) === true;
  const pool = isMainlandOnly ? MAINLAND_LOCATIONS : CONFERENCE_LOCATIONS;
  return getDeterministicLocation(pool, month, year, target);
}
