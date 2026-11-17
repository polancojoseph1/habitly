const smokingText = /smok|cigarette|tobacco/i;

function isSmokingHabit(habit: Record<string, any>) {
  if (habit.id === 'demo-smoking') return true;
  return smokingText.test(`${habit.name ?? ''} ${habit.target ?? ''} ${habit.display_name ?? ''} ${habit.target_action ?? ''}`);
}

export function removeSmokingWorkspaceData<T extends Record<string, any>>(workspace: T): T {
  const cleaned = { ...workspace };
  const habits = Array.isArray(cleaned.habits) ? cleaned.habits : [];
  const smokingIds = new Set<string>(['demo-smoking']);
  for (const habit of habits) {
    if (habit && typeof habit === 'object' && isSmokingHabit(habit) && habit.id) smokingIds.add(String(habit.id));
  }
  if (Array.isArray(cleaned.habits)) cleaned.habits = habits.filter((habit: any) => !isSmokingHabit(habit ?? {}));

  const belongsToRemovedHabit = (row: any) => {
    if (!row || typeof row !== 'object') return false;
    const habitId = String(row.habitId ?? row.habit_id ?? '');
    const recordId = String(row.id ?? '');
    return smokingIds.has(habitId) || recordId.startsWith('sample-log-smoking-');
  };
  for (const key of ['behaviorLogs', 'habitEvents', 'variations', 'dailyConfirmations', 'rewards']) {
    if (Array.isArray(cleaned[key])) cleaned[key] = cleaned[key].filter((row: any) => !belongsToRemovedHabit(row));
  }
  if (Array.isArray(cleaned.habitOrder)) {
    cleaned.habitOrder = cleaned.habitOrder.filter((id: unknown) => !smokingIds.has(String(id)));
  }
  if (cleaned.preppedHabits && typeof cleaned.preppedHabits === 'object') {
    cleaned.preppedHabits = Object.fromEntries(
      Object.entries(cleaned.preppedHabits).filter(([id]) => !smokingIds.has(id)),
    );
  }
  if (cleaned.history && typeof cleaned.history === 'object') {
    cleaned.history = Object.fromEntries(Object.entries(cleaned.history).flatMap(([day, rows]) => {
      if (!Array.isArray(rows)) return [[day, rows]];
      const filtered = rows.filter((id: unknown) => !smokingIds.has(String(id).replace(/^missed:/, '')));
      return filtered.length ? [[day, filtered]] : [];
    }));
  }
  if (Array.isArray(cleaned.scorecard)) {
    cleaned.scorecard = cleaned.scorecard.filter((row: any) => !smokingText.test(String(row?.behavior ?? '')));
  }
  if (Array.isArray(cleaned.diagnostics)) {
    cleaned.diagnostics = cleaned.diagnostics.filter((row: any) =>
      !smokingText.test(`${row?.routine ?? ''} ${row?.craving ?? ''} ${row?.rewardExperiment ?? ''} ${row?.plan ?? ''}`),
    );
  }
  if (Array.isArray(cleaned.customContextTags)) {
    cleaned.customContextTags = cleaned.customContextTags.filter((tag: unknown) => !smokingText.test(String(tag)));
  }
  return cleaned;
}
