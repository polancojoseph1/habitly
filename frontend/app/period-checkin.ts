import { isRecoveryPrincipleApplication } from './behavioral-logging';

type DayConfirmation = { status: 'no_occurrence' | 'occurred_recorded' | 'incomplete' | 'skip' };

export type OccurrenceDayEvidence = {
  knownOccurrenceCount: boolean;
  occurrenceEvents: number;
  conflict: boolean;
  confirmation?: DayConfirmation;
};

export function isOccurrenceDayConfirmed(day: OccurrenceDayEvidence, rollingWindow = false): boolean {
  if (day.conflict || day.confirmation?.status === 'incomplete' || day.confirmation?.status === 'skip') return false;

  if (rollingWindow) {
    return (day.confirmation?.status === 'no_occurrence' && day.occurrenceEvents === 0)
      || (day.confirmation?.status === 'occurred_recorded' && day.occurrenceEvents > 0);
  }

  return day.knownOccurrenceCount;
}

export function isPeriodOccurrenceCoverageComplete(days: OccurrenceDayEvidence[], rollingWindow = false): boolean {
  return days.length > 0 && days.every(day => isOccurrenceDayConfirmed(day, rollingWindow));
}

export function primaryRecordedValue(isSmoking: boolean, quantity: number, occurrences: number, periodConfirmed: boolean): number | undefined {
  const value = isSmoking ? quantity : occurrences;
  return value > 0 || periodConfirmed ? value : undefined;
}

export function resistancePercentage(resisted: number, resolved: number): number | undefined {
  return resolved > 0 ? Math.round((resisted / resolved) * 100) : undefined;
}

export function techniqueOutcomePercentages(resisted: number, engaged: number, resolved: number): { worked: number; didNotWork: number } | undefined {
  if (resolved <= 0) return undefined;
  return {
    worked: Math.round((resisted / resolved) * 100),
    didNotWork: Math.round((engaged / resolved) * 100),
  };
}

export function techniquePracticeNote(configuredTechniques: number, distinctTechniques: number, hasTechniqueFilters = false): string {
  if (distinctTechniques > 0) return `${distinctTechniques} distinct technique${distinctTechniques === 1 ? '' : 's'} practiced.`;
  if (hasTechniqueFilters) return 'No technique applications matched these filters.';
  return configuredTechniques === 0
    ? 'No techniques are configured for this habit.'
    : 'No technique applications recorded in this period.';
}

export type TechniqueUseRecord = { type: string; technique?: string; techniqueId?: string };

export function techniqueApplicationsByName(logs: TechniqueUseRecord[]): [string, number][] {
  const counts = new Map<string, number>();
  logs.forEach(log => {
    if (log.type !== 'technique_applied' || isRecoveryPrincipleApplication(log)) return;
    const name = log.technique || 'Technique';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function triggerInsightSentence(trigger: { name: string; count: number } | undefined, periodLabel: string): string {
  if (!trigger) return `No triggers were recorded during the selected ${periodLabel}.`;
  const entries = trigger.count === 1 ? 'entry' : 'entries';
  return `${trigger.name} was your most frequently recorded trigger during this period. ${trigger.count} ${entries} included this trigger.`;
}

export type RecordedComparison =
  | { reliable: false }
  | { reliable: true; difference: number; percentage?: number };

export function compareRecordedPeriods(current: number, previous: number, reliable: boolean): RecordedComparison {
  if (!reliable) return { reliable: false };
  const difference = current - previous;
  return {
    reliable: true,
    difference,
    percentage: previous > 0 ? Math.round((difference / previous) * 100) : undefined,
  };
}
