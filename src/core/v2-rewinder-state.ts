import type { RewinderGrowthSnapshot } from "./v2-rewinder-growth";
import type { RewinderRelationshipsSnapshot } from "./v2-rewinder-relationships";

export interface RewinderYearRecord {
  growth: RewinderGrowthSnapshot;
  relationships: RewinderRelationshipsSnapshot;
}
export interface RewinderArchive { years: Partial<Record<number, RewinderYearRecord>> }
export interface RewinderPresentation { year: number; before: RewinderYearRecord; after: RewinderYearRecord }
export interface RewinderRunState {
  /** Frozen when starting a life; never reread the account while playing or replaying. */
  history: RewinderArchive;
  records: RewinderArchive;
  restoredKeys: string[];
  completedYears: number[];
  monthEndProcessed?: number;
  pending?: { year: number; selectedKeys: string[] };
}
