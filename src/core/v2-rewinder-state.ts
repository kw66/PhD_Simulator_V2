import type { RewinderGrowthSnapshot } from "./v2-rewinder-growth";
import type { RewinderRelationshipsSnapshot } from "./v2-rewinder-relationships";

export interface RewinderYearRecord {
  growth: RewinderGrowthSnapshot;
  relationships: RewinderRelationshipsSnapshot;
}
export interface RewinderArchive { years: Partial<Record<number, RewinderYearRecord>> }
export interface RewinderPresentation { year: number; cycleNumber?: number; before: RewinderYearRecord; after: RewinderYearRecord }
export interface RewinderRunState {
  /** New starts use isolated academic chapters. Older ongoing lives keep their own rules. */
  academic?: import("./v2-rewinder-academic").AcademicRunState;
  /** Frozen from settled lives + 1 at start; old replay states omit it. */
  cycleNumber?: number;
  /** Frozen when starting a life; never reread the account while playing or replaying. */
  history: RewinderArchive;
  records: RewinderArchive;
  restoredKeys: string[];
  completedYears: number[];
  monthEndProcessed?: number;
  pending?: { year: number; selectedKeys: string[] };
}
