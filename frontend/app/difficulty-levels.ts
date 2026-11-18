export type DifficultyLevel = {
  id: string;
  order: number;
  name: string;
  activity: string;
  target: string;
  criteria: string;
};

export type DifficultySnapshot = DifficultyLevel & { level_number: number };

export const suggestedLevelNames = ['Very Easy', 'Easy', 'Moderate', 'Hard', 'Very Hard'];

export function createSuggestedLevels(): DifficultyLevel[] {
  return suggestedLevelNames.map((name, order) => ({
    id: newRecordId(), order, name, activity: '', target: '', criteria: '',
  }));
}

export function newRecordId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `level-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function orderedLevels(levels: DifficultyLevel[]): DifficultyLevel[] {
  return levels.map((level, order) => ({ ...level, order }));
}

export function snapshotForLevel(levels: DifficultyLevel[], activeId?: string): DifficultySnapshot | null {
  const ordered = orderedLevels(levels);
  const index = ordered.findIndex(level => level.id === activeId);
  return index < 0 ? null : { ...ordered[index], level_number: index + 1 };
}
