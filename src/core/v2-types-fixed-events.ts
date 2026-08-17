export type FixedEventResolutionKind =
  | "advisor-confirm"
  | "advisor-reroll"
  | "teachers-day-message"
  | "teachers-day-tea"
  | "teachers-day-flower"
  | "teachers-day-stamp"
  | "winter-vacation-rest"
  | "summer-vacation-home"
  | "summer-vacation-research"
  | "summer-vacation-travel"
  | "year-summary-open"
  | "year-summary-sleep"
  | "year-summary-social"
  | "year-summary-favor"
  | "year-summary-intern"
  | "ccig-open"
  | "ccig-skip"
  | "ccig-advisor"
  | "ccig-self"
  | "ccig-activity-listen"
  | "ccig-activity-travel"
  | "ccig-activity-food"
  | "mentor-assign-candidate";

export interface FixedEventJuniorCandidate {
  name: string;
  research: number;
  affinity: number;
}

export interface FixedEventAdvisorCandidate {
  advisorName: string;
  researchResource: number;
  affinity: number;
  taskMultiplier: number;
}

export interface FixedEventAdvisorIntel {
  reporting: string;
  projects: string;
  internship: string;
  guidance: string;
  computing: string;
  temperament: string;
  atmosphere: string;
  focus: string;
  pace: string;
}

export interface FixedEventResolution {
  kind: FixedEventResolutionKind;
  juniorCandidate?: FixedEventJuniorCandidate;
  advisorCandidate?: FixedEventAdvisorCandidate;
  advisorIntel?: FixedEventAdvisorIntel;
}
