export function getJointTrainingCitationCapBonus(totalCitations: number): number {
  return Math.min(Math.floor(Math.max(0, totalCitations) / 500) * 2, 10);
}
