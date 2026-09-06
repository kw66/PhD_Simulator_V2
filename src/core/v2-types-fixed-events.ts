export type FixedEventResolutionKind =
  | "student-name-confirm"
  | "student-name-reroll"
  | "advisor-confirm"
  | "advisor-reroll"
  | "teachers-day-message"
  | "teachers-day-gift"
  | "teachers-day-stamp"
  | "winter-vacation-rest"
  | "summer-vacation-home"
  | "summer-vacation-research"
  | "summer-vacation-travel"
  | "year-summary-open"
  | "year-summary-sleep"
  | "year-summary-social"
  | "year-summary-favor"
  | "year-summary-part-time"
  | "ccig-open"
  | "ccig-skip"
  | "ccig-advisor"
  | "ccig-self"
  | "ccig-activity-listen"
  | "ccig-activity-poster"
  | "ccig-activity-travel"
  | "ccig-activity-food";

export type TeachersDayGiftId = "tea" | "mooncake" | "flower";

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
  studentName?: string;
  ccigAttendanceSummary?: string;
  ccigPaperId?: string;
  teachersDayGift?: TeachersDayGiftId;
  advisorCandidate?: FixedEventAdvisorCandidate;
  advisorIntel?: FixedEventAdvisorIntel;
}
