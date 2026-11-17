export type BehaviorType = 'craving' | 'habit_occurrence' | 'technique_applied';
export type BehaviorOutcome = 'resisted' | 'smoked' | 'pending';
export type UrgeFollowUpStatus = 'stayed_gone' | 'lingering_or_returned' | 'skipped';
export type PostEngagementSatisfaction = 'worse_than_expected' | 'neutral' | 'as_expected' | 'skipped';
export type ContextFields = {
  emotions?: string[];
  environments?: string[];
  activities?: string[];
  social?: string[];
  tags?: string[];
  bodilyState?: string;
  accessibility?: string;
  motives?: string[];
};
export type BehaviorLog = {
  id: string;
  habitId: string;
  type: BehaviorType;
  questionnaireVersion?: 1;
  at: string;
  createdAt?: string;
  resolvedAt?: string;
  localDate?: string;
  timezone?: string;
  episodeId?: string;
  trigger?: string;
  intensity?: number;
  outcome?: BehaviorOutcome;
  technique?: string;
  techniqueId?: string;
  law?: string;
  laws?: string[];
  variationId?: string;
  timing?: 'preventive' | 'responsive';
  quantity?: number;
  /** Synthetic analytics row from the older HabitEvent OLD_HABIT stream. */
  legacyEvent?: boolean;
  context?: ContextFields;
  automaticThought?: string;
  belief?: string;
  confidence?: number;
  reframing?: string;
  intensityAfter?: number;
  urgeFollowUpDueAt?: string;
  urgeFollowUpStatus?: UrgeFollowUpStatus;
  urgeFollowUpAt?: string;
  postEngagementSatisfaction?: PostEngagementSatisfaction;
  postEngagementSatisfactionAt?: string;
  note?: string;
};

export function isRecoveryPrincipleApplication(log: { type: string; technique?: string; techniqueId?: string }): boolean {
  return log.type === 'technique_applied'
    && (log.techniqueId === 'never-miss-twice' || log.technique?.trim().toLocaleLowerCase() === 'never miss twice');
}

export type EpisodeOutcome = 'resisted' | 'smoked' | 'unknown';
export type DailyConfirmationStatus = 'no_occurrence' | 'occurred_recorded' | 'incomplete' | 'skip';
export type DailyConfirmation = { habitId: string; date: string; status: DailyConfirmationStatus; updatedAt: string };

/** Prepare personal records attached to a starter habit for a one-time account import. */
export function prepareBehavioralWorkspaceImport<
  THabit extends { id: string },
  TEvent extends { habitId: string; at?: string },
>(
  habits: THabit[],
  behaviorLogs: BehaviorLog[],
  habitEvents: TEvent[],
  dailyConfirmations: DailyConfirmation[],
  createHabitId: (sourceId: string) => string,
) {
  const realLogs = behaviorLogs.filter(log => !log.id.startsWith('sample-log-'));
  const sampleDates = new Map<string, Set<string>>();
  for (const log of behaviorLogs) {
    if (!log.id.startsWith('sample-log-')) continue;
    const dates = sampleDates.get(log.habitId) ?? new Set<string>();
    dates.add(behaviorDayKey(log));
    sampleDates.set(log.habitId, dates);
  }
  const hasPersonalConfirmation = (confirmation: DailyConfirmation) => {
    if (!confirmation.habitId.startsWith('demo-')) return true;
    if (realLogs.some(log => log.habitId === confirmation.habitId && behaviorDayKey(log) === confirmation.date)) return true;
    if (habitEvents.some(event => event.habitId === confirmation.habitId && event.at?.slice(0, 10) === confirmation.date)) return true;
    return !sampleDates.get(confirmation.habitId)?.has(confirmation.date);
  };
  const personalDemoIds = new Set(habits
    .filter(habit => habit.id.startsWith('demo-') && (
      realLogs.some(log => log.habitId === habit.id)
      || habitEvents.some(event => event.habitId === habit.id)
      || dailyConfirmations.some(confirmation => confirmation.habitId === habit.id && hasPersonalConfirmation(confirmation))
    ))
    .map(habit => habit.id));
  const remappedIds = new Map([...personalDemoIds].map(id => [id, createHabitId(id)]));
  const mapHabitId = (id: string) => remappedIds.get(id) ?? id;
  const importHabitIds = new Set(habits
    .filter(habit => !habit.id.startsWith('demo-') || personalDemoIds.has(habit.id))
    .map(habit => mapHabitId(habit.id)));

  return {
    personalDemoIds,
    mapHabitId,
    habits: habits
      .filter(habit => !habit.id.startsWith('demo-') || personalDemoIds.has(habit.id))
      .map(habit => ({ ...habit, id: mapHabitId(habit.id) })),
    behaviorLogs: realLogs
      .filter(log => importHabitIds.has(mapHabitId(log.habitId)))
      .map(log => ({ ...log, habitId: mapHabitId(log.habitId) })),
    habitEvents: habitEvents
      .filter(event => importHabitIds.has(mapHabitId(event.habitId)))
      .map(event => ({ ...event, habitId: mapHabitId(event.habitId) })),
    dailyConfirmations: dailyConfirmations
      .filter(confirmation => importHabitIds.has(mapHabitId(confirmation.habitId)) && hasPersonalConfirmation(confirmation))
      .map(confirmation => ({ ...confirmation, habitId: mapHabitId(confirmation.habitId) })),
  };
}

export type LegacyHabitEvent = {
  id: string;
  habitId: string;
  type: 'ACTION_COMPLETED' | 'URGE_PASSED' | 'REPLACEMENT_USED' | 'OLD_HABIT';
  at: string;
  note?: string;
  strategy?: string;
  variationId?: string;
  variationName?: string;
};
export type LegacyTechniqueVariation = { id: string; law: string; name: string; techniqueId?: string };
export type LegacyTechniqueDefinition = { id: string; name: string; laws: string[] };

/** Adapts older check-ins for analytics without changing or rewriting their stored records. */
export function legacyHabitEventsToBehaviorLogs(
  events: LegacyHabitEvent[],
  habitId: string,
  timezone?: string,
  variations: LegacyTechniqueVariation[] = [],
  techniques: LegacyTechniqueDefinition[] = [],
): BehaviorLog[] {
  return events.flatMap<BehaviorLog>(event => {
    if (event.habitId !== habitId || event.type === 'ACTION_COMPLETED' || !Number.isFinite(new Date(event.at).getTime())) return [];
    const variation = event.variationId ? variations.find(item => item.id === event.variationId) : undefined;
    const recordedTechnique = event.variationName?.trim() || event.strategy?.trim();
    const technique = recordedTechnique
      ? techniques.find(item => item.name.toLocaleLowerCase() === recordedTechnique.toLocaleLowerCase())
      : undefined;
    const common = {
      id: `legacy-event-${event.id}`,
      habitId: event.habitId,
      at: event.at,
      createdAt: event.at,
      localDate: dateKeyInZone(event.at, timezone),
      timezone,
      note: event.note || undefined,
      legacyEvent: true,
    } as const;

    if (event.type === 'OLD_HABIT') {
      return [{ ...common, type: 'habit_occurrence' as const, episodeId: `legacy-episode-${event.id}` }];
    }
    if (event.type === 'URGE_PASSED') {
      return [{ ...common, type: 'craving' as const, outcome: 'resisted' as const, resolvedAt: event.at, episodeId: `legacy-episode-${event.id}` }];
    }
    return [{
      ...common,
      type: 'technique_applied' as const,
      technique: variation?.name || recordedTechnique || 'Replacement action',
      techniqueId: variation?.techniqueId || technique?.id,
      law: variation?.law || technique?.laws[0],
      laws: variation ? [variation.law] : technique?.laws,
      variationId: variation?.id || event.variationId,
      timing: 'responsive' as const,
    }];
  });
}

export function withoutSampleBehaviorLogs(logs: BehaviorLog[]): BehaviorLog[] {
  return logs.filter(log => !log.id.startsWith('sample-log-'));
}

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function dateKeyInZone(at: string | Date, timezone?: string): string {
  const value = typeof at === 'string' ? new Date(at) : at;
  if (!Number.isFinite(value.getTime())) return '';
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(value);
      const pick = (kind: string) => parts.find(part => part.type === kind)?.value ?? '';
      return `${pick('year')}-${pick('month')}-${pick('day')}`;
    } catch {
      // Old entries may contain a timezone removed from the user's device.
    }
  }
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function behaviorDayKey(log: Pick<BehaviorLog, 'at' | 'localDate' | 'timezone'>): string {
  return isDateKey(log.localDate) ? log.localDate : dateKeyInZone(log.at, log.timezone);
}

export function resolvedEpisodeOutcome(logs: BehaviorLog[], episodeId: string): EpisodeOutcome {
  const episode = logs.filter(log => log.episodeId === episodeId);
  if (episode.some(log => log.type === 'habit_occurrence')) return 'smoked';
  const outcome = episode.find(log => log.type === 'craving' && (log.outcome === 'resisted' || log.outcome === 'smoked'))?.outcome;
  return outcome === 'resisted' || outcome === 'smoked' ? outcome : 'unknown';
}

export function episodeKey(log: BehaviorLog): string {
  return log.episodeId || `standalone:${log.id}`;
}

export function episodeResolvedOutcome(logs: BehaviorLog[], log: BehaviorLog): EpisodeOutcome {
  return resolvedEpisodeOutcome(logs, episodeKey(log));
}

export function localDateKeys(count: number, today = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    day.setDate(day.getDate() - (count - index - 1));
    return dateKeyInZone(day);
  });
}

export function summarizeDay(logs: BehaviorLog[], habitId: string, date: string, confirmations: DailyConfirmation[]) {
  const dayLogs = logs.filter(log => log.habitId === habitId && behaviorDayKey(log) === date);
  const occurrences = dayLogs.filter(log => log.type === 'habit_occurrence');
  const cravings = dayLogs.filter(log => log.type === 'craving');
  const resolved = cravings.filter(log => outcomeForCraving(logs, log) !== 'unknown');
  const confirmation = confirmations.find(item => item.habitId === habitId && item.date === date);
  const explicitNoOccurrence = confirmation?.status === 'no_occurrence' && occurrences.length === 0;
  const conflict = (confirmation?.status === 'no_occurrence' && occurrences.length > 0)
    || (confirmation?.status === 'occurred_recorded' && occurrences.length === 0);
  return {
    logs: dayLogs,
    occurrenceEvents: occurrences.length,
    quantity: occurrences.reduce((total, log) => total + (log.legacyEvent ? 0 : (log.quantity ?? 0)), 0),
    cravings: cravings.length,
    resolvedCravings: resolved.length,
    resistedCravings: resolved.filter(log => outcomeForCraving(logs, log) === 'resisted').length,
    techniqueApplications: dayLogs.filter(log => log.type === 'technique_applied' && !isRecoveryPrincipleApplication(log)).length,
    confirmation,
    explicitNoOccurrence,
    conflict,
    knownOccurrenceCount: occurrences.length > 0 || explicitNoOccurrence,
    quantityKnown: occurrences.length > 0
      ? occurrences.every(log => !log.legacyEvent && typeof log.quantity === 'number' && Number.isFinite(log.quantity))
      : explicitNoOccurrence,
    legacyOccurrences: occurrences.filter(log => log.legacyEvent).length,
  };
}

export function outcomeForCraving(logs: BehaviorLog[], craving: BehaviorLog): EpisodeOutcome {
  if (craving.episodeId && logs.some(log => log.episodeId === craving.episodeId && log.type === 'habit_occurrence')) return 'smoked';
  if (craving.outcome === 'resisted' || craving.outcome === 'smoked') return craving.outcome;
  return 'unknown';
}

export function minutesToCravingResolution(logs: BehaviorLog[], craving: BehaviorLog): number | undefined {
  if (outcomeForCraving(logs, craving) === 'unknown') return undefined;
  const occurrence = craving.episodeId
    ? logs.find(log => log.type === 'habit_occurrence' && log.habitId === craving.habitId && log.episodeId === craving.episodeId)
    : undefined;
  const resolvedAt = occurrence?.at ?? craving.resolvedAt;
  if (!resolvedAt) return undefined;
  const minutes = (new Date(resolvedAt).getTime() - new Date(craving.at).getTime()) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : undefined;
}

export function recordUrgeFollowUp(logs: BehaviorLog[], cravingId: string, status: UrgeFollowUpStatus, at = new Date().toISOString()): BehaviorLog[] {
  const craving = logs.find(log => log.id === cravingId && log.type === 'craving');
  if (!craving) return logs;
  return applyBehaviorLogChanges(logs, [{ ...craving, urgeFollowUpStatus: status, urgeFollowUpAt: at }]);
}

export function recordPostEngagementSatisfaction(logs: BehaviorLog[], cravingId: string, rating: PostEngagementSatisfaction, at = new Date().toISOString()): BehaviorLog[] {
  const craving = logs.find(log => log.id === cravingId && log.type === 'craving');
  if (!craving) return logs;
  return applyBehaviorLogChanges(logs, [{ ...craving, postEngagementSatisfaction: rating, postEngagementSatisfactionAt: at }]);
}

export function metadataForEditedTimestamp(previous: BehaviorLog | undefined, occurredAt: string, timezone: string | undefined) {
  const unchanged = previous && new Date(previous.at).getTime() === new Date(occurredAt).getTime();
  return unchanged
    ? { localDate: previous.localDate ?? behaviorDayKey(previous), timezone: previous.timezone }
    : { localDate: dateKeyInZone(occurredAt, timezone), timezone };
}

export function applyBehaviorLogChanges(current: BehaviorLog[], changes: BehaviorLog[]): BehaviorLog[] {
  if (!changes.length) return current;
  const changedIds = new Set<string>();
  for (const change of changes) {
    if (changedIds.has(change.id)) throw new Error('Each event ID can be updated only once per save.');
    changedIds.add(change.id);
  }
  const previousById = new Map(current.map(log => [log.id, log]));
  let next = current.filter(log => !changedIds.has(log.id));
  for (const change of changes) {
    const previous = previousById.get(change.id);
    if (previous?.type === 'habit_occurrence' && previous.episodeId && (change.type !== 'habit_occurrence' || change.episodeId !== previous.episodeId)) {
      const remains = next.some(log => log.type === 'habit_occurrence' && log.habitId === previous.habitId && log.episodeId === previous.episodeId)
        || changes.some(log => log.type === 'habit_occurrence' && log.habitId === previous.habitId && log.episodeId === previous.episodeId);
      if (!remains) next = next.map(log => log.type === 'craving' && log.habitId === previous.habitId && log.episodeId === previous.episodeId ? { ...log, outcome: 'pending' } : log);
    }
    if (change.type === 'craving' && change.outcome === 'resisted' && change.episodeId && next.some(log => log.type === 'habit_occurrence' && log.habitId === change.habitId && log.episodeId === change.episodeId)) {
      throw new Error('A craving cannot be marked resisted while its episode has a habit occurrence.');
    }
  }
  next = [...changes, ...next];
  for (const change of changes) {
    if (change.type === 'habit_occurrence' && change.episodeId) {
      next = next.map(log => log.type === 'craving' && log.habitId === change.habitId && log.episodeId === change.episodeId ? { ...log, outcome: 'smoked', ...(log.id.startsWith('sample-log-') ? {} : { questionnaireVersion: 1 }) } : log);
    }
  }
  next = next.map(log => {
    if (log.type !== 'craving' || !log.episodeId) return log;
    const occurrence = next.find(item => item.type === 'habit_occurrence' && item.habitId === log.habitId && item.episodeId === log.episodeId);
    return occurrence ? { ...log, outcome: 'smoked', resolvedAt: occurrence.at, ...(log.id.startsWith('sample-log-') ? {} : { questionnaireVersion: 1 }), ...(log.urgeFollowUpStatus ? {} : { urgeFollowUpDueAt: undefined }) } : log;
  });
  return next.sort((a, b) => b.at.localeCompare(a.at));
}

export function removeBehaviorLogRecord(current: BehaviorLog[], id: string): BehaviorLog[] {
  const removed = current.find(log => log.id === id);
  let next = current.filter(log => log.id !== id);
  if (removed?.type === 'habit_occurrence' && removed.episodeId && !next.some(log => log.type === 'habit_occurrence' && log.episodeId === removed.episodeId)) {
    next = next.map(log => log.type === 'craving' && log.habitId === removed.habitId && log.episodeId === removed.episodeId ? { ...log, outcome: 'pending', resolvedAt: undefined } : log);
  }
  return next;
}

