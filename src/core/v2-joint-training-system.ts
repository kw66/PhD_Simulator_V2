export function getJointTrainingCitationCapBonus(totalCitations: number): number {
  return Math.min(1 + Math.floor(Math.max(0, totalCitations) / 300), 5);
}
