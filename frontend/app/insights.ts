import { behaviorDayKey, episodeKey, episodeResolvedOutcome, isRecoveryPrincipleApplication, type BehaviorLog } from './behavioral-logging.ts';

export type InsightTechniqueChoice = {
  key: string;
  name: string;
  techniqueId?: string;
  variationId?: string;
  laws: string[];
  detail?: string;
  description?: string;
  example?: string;
};

export type InsightLaw = { id: string; break: string };

export type TriggerInsight = {
  name: string;
  appearances: number;
  episodes: number;
  unfavorable: number;
  resolved: number;
  hasTechniqueApplication: boolean;
};

export type CueDimension = 'Time of day' | 'Location' | 'Emotional state' | 'Other people' | 'Immediately preceding action';
export type CuePattern = { dimension: CueDimension; value?: string; count: number; recorded: number; days: number };
export type CuePatternSummary = { cravings: number; observationDays: number; patterns: CuePattern[] };

export type TechniquePractice = InsightTechniqueChoice & {
  configured: boolean;
  applications: BehaviorLog[];
  total: number;
  preventive: number;
  responsive: number;
  preventiveDays: number;
  occurrencesOnPreventiveDays: number;
  resolved: number;
  resisted: number;
  engaged: number;
  unknown: number;
  triggers: [string, number][];
  contexts: string[];
};

export type StrategyGap = {
  title: string;
  description: string;
};

export type SuggestedExperiment = {
  trigger?: TriggerInsight;
  technique?: InsightTechniqueChoice;
  action: string;
  untestedForTrigger: boolean;
};

const normalize = (value: string | undefined) => (value ?? '').trim().toLocaleLowerCase();

export function matchesInsightTechnique(log: BehaviorLog, choice: InsightTechniqueChoice): boolean {
  if (choice.variationId) return log.variationId === choice.variationId;
  if (choice.techniqueId) {
    return (log.techniqueId === choice.techniqueId && !log.variationId)
      || (!log.techniqueId && log.technique === choice.name);
  }
  return !log.techniqueId && log.technique === choice.name;
}

function configuredChoiceFor(log: BehaviorLog, choices: InsightTechniqueChoice[]) {
  return choices.find(choice => matchesInsightTechnique(log, choice));
}

function techniqueIdentity(log: BehaviorLog, choice?: InsightTechniqueChoice) {
  if (choice) return choice.key;
  if (log.variationId) return `variation:${log.variationId}`;
  if (log.techniqueId) return `technique:${log.techniqueId}`;
  return `name:${normalize(log.technique) || 'technique'}`;
}

function stableByName<T extends { name: string }>(a: T, b: T) {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.name.localeCompare(b.name, 'en');
}

export function mostCommonTrigger(logs: BehaviorLog[]): TriggerInsight | undefined {
  return summarizeTriggers(logs, logs).sort((a, b) => b.appearances - a.appearances || stableByName(a, b))[0];
}

function localHour(log: BehaviorLog): number {
  if (!log.timezone) return new Date(log.at).getHours();
  try {
    const value = new Intl.DateTimeFormat('en-US', { timeZone: log.timezone, hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(log.at)).find(part => part.type === 'hour')?.value;
    return Number(value ?? new Date(log.at).getHours());
  } catch {
    return new Date(log.at).getHours();
  }
}

function timeOfDay(log: BehaviorLog): string {
  const hour = localHour(log);
  if (hour >= 5 && hour <= 11) return 'Morning';
  if (hour >= 12 && hour <= 16) return 'Afternoon';
  if (hour >= 17 && hour <= 20) return 'Evening';
  return 'Night';
}

export function summarizeCuePatterns(logs: BehaviorLog[], dateKeys: string[]): CuePatternSummary {
  const window = new Set(dateKeys);
  const cravings = logs.filter(log => log.type === 'craving' && window.has(behaviorDayKey(log)));
  const observationDays = new Set(cravings.map(behaviorDayKey)).size;
  const dimensions: { dimension: CueDimension; values: (log: BehaviorLog) => string[] }[] = [
    { dimension: 'Time of day', values: log => [timeOfDay(log)] },
    { dimension: 'Location', values: log => log.context?.environments ?? [] },
    { dimension: 'Emotional state', values: log => log.context?.emotions ?? [] },
    { dimension: 'Other people', values: log => log.context?.social ?? [] },
    { dimension: 'Immediately preceding action', values: log => log.context?.activities ?? [] },
  ];

  const patterns = dimensions.map(({ dimension, values }) => {
    const counts = new Map<string, { label: string; count: number; days: Set<string> }>();
    let recorded = 0;
    for (const log of cravings) {
      const entryValues = [...new Set(values(log).map(value => value.trim()).filter(Boolean))];
      if (entryValues.length) recorded += 1;
      for (const value of entryValues) {
        const key = value.toLocaleLowerCase();
        const entry = counts.get(key) ?? { label: value, count: 0, days: new Set<string>() };
        entry.count += 1;
        entry.days.add(behaviorDayKey(log));
        counts.set(key, entry);
      }
    }
    const top = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }))[0];
    return { dimension, value: top?.label, count: top?.count ?? 0, recorded, days: top?.days.size ?? 0 };
  });

  return { cravings: cravings.length, observationDays, patterns };
}

export function summarizeTriggers(logs: BehaviorLog[], allLogs: BehaviorLog[]): TriggerInsight[] {
  const groups = new Map<string, BehaviorLog[]>();
  for (const log of logs) {
    const name = log.trigger?.trim();
    if (!name) continue;
    groups.set(name, [...(groups.get(name) ?? []), log]);
  }

  return [...groups.entries()].map(([name, entries]) => {
    const episodes = new Map<string, BehaviorLog>();
    for (const log of entries) {
      const key = episodeKey(log);
      if (!episodes.has(key)) episodes.set(key, log);
    }
    const outcomes = [...episodes.values()].map(log => episodeResolvedOutcome(allLogs, log));
    return {
      name,
      appearances: entries.length,
      episodes: episodes.size,
      unfavorable: outcomes.filter(outcome => outcome === 'smoked').length,
      resolved: outcomes.filter(outcome => outcome !== 'unknown').length,
      hasTechniqueApplication: logs.some(log => log.type === 'technique_applied' && !isRecoveryPrincipleApplication(log) && log.trigger?.trim() === name),
    };
  }).sort((a, b) => b.appearances - a.appearances || stableByName(a, b));
}

export function mostPracticedTechnique(logs: BehaviorLog[], choices: InsightTechniqueChoice[]) {
  const groups = new Map<string, { name: string; applications: number }>();
  for (const log of logs) {
    if (log.type !== 'technique_applied' || isRecoveryPrincipleApplication(log)) continue;
    const choice = configuredChoiceFor(log, choices);
    const key = techniqueIdentity(log, choice);
    const name = choice?.name ?? log.technique?.trim() ?? 'Technique';
    const previous = groups.get(key);
    groups.set(key, { name, applications: (previous?.applications ?? 0) + 1 });
  }
  return [...groups.values()].sort((a, b) => b.applications - a.applications || stableByName(a, b))[0];
}

export function buildTechniquePracticeStats(
  applicationLogs: BehaviorLog[],
  allLogs: BehaviorLog[],
  periodLogs: BehaviorLog[],
  metadataChoices: InsightTechniqueChoice[],
  configuredChoices: InsightTechniqueChoice[],
  lawIds: string[],
): { techniques: TechniquePractice[]; lawCounts: { id: string; count: number }[] } {
  const groups = new Map<string, { choice?: InsightTechniqueChoice; applications: BehaviorLog[] }>();
  for (const log of applicationLogs) {
    if (log.type !== 'technique_applied' || isRecoveryPrincipleApplication(log)) continue;
    const choice = configuredChoiceFor(log, metadataChoices);
    const key = techniqueIdentity(log, choice);
    const group = groups.get(key) ?? { choice, applications: [] };
    group.applications.push(log);
    if (!group.choice) group.choice = choice;
    groups.set(key, group);
  }

  const techniques = [...groups.entries()].map(([key, group]) => {
    const choice = group.choice;
    const applications = group.applications;
    const laws = [...new Set([
      ...(choice?.laws ?? []),
      ...applications.flatMap(log => [...(log.laws ?? []), ...(log.law ? [log.law] : [])]),
    ])];
    const responsiveApplications = applications.filter(log => log.timing !== 'preventive');
    const episodes = new Map<string, ReturnType<typeof episodeResolvedOutcome>>();
    for (const log of responsiveApplications) {
      const key = episodeKey(log);
      if (!episodes.has(key)) episodes.set(key, episodeResolvedOutcome(allLogs, log));
    }
    const outcomes = [...episodes.values()];
    const resolved = outcomes.filter(outcome => outcome !== 'unknown');
    const preventive = applications.filter(log => log.timing === 'preventive');
    const preventiveDates = new Set(preventive.map(behaviorDayKey));
    const triggerCounts = new Map<string, number>();
    const contexts = new Set<string>();
    for (const log of applications) {
      if (log.trigger?.trim()) triggerCounts.set(log.trigger.trim(), (triggerCounts.get(log.trigger.trim()) ?? 0) + 1);
      for (const values of Object.values(log.context ?? {})) {
        for (const value of values ?? []) if (value.trim()) contexts.add(value.trim());
      }
    }
    const configured = configuredChoices.some(configuredChoice =>
      choice ? configuredChoice.key === choice.key : applications.some(log => matchesInsightTechnique(log, configuredChoice)),
    );

    return {
      key,
      name: choice?.name ?? applications[0].technique?.trim() ?? 'Technique',
      detail: choice?.detail ?? choice?.example ?? choice?.description,
      techniqueId: choice?.techniqueId ?? applications.find(log => log.techniqueId)?.techniqueId,
      variationId: choice?.variationId ?? applications.find(log => log.variationId)?.variationId,
      laws,
      configured,
      applications,
      total: applications.length,
      preventive: preventive.length,
      responsive: responsiveApplications.length,
      preventiveDays: preventiveDates.size,
      occurrencesOnPreventiveDays: periodLogs.filter(log => log.type === 'habit_occurrence' && preventiveDates.has(behaviorDayKey(log))).length,
      resolved: resolved.length,
      resisted: resolved.filter(outcome => outcome === 'resisted').length,
      engaged: resolved.filter(outcome => outcome === 'smoked').length,
      unknown: outcomes.length - resolved.length,
      triggers: [...triggerCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en', { sensitivity: 'base' })),
      contexts: [...contexts].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    };
  }).sort((a, b) => stableByName(a, b));

  const lawSets = new Map(lawIds.map(id => [id, new Set<string>()]));
  for (const technique of techniques) {
    for (const law of technique.laws) lawSets.get(law)?.add(technique.key);
  }
  return { techniques, lawCounts: lawIds.map(id => ({ id, count: lawSets.get(id)?.size ?? 0 })) };
}

const triggerTechniqueIds: { pattern: RegExp; ids: string[] }[] = [
  { pattern: /\b(social|friend|friends|people|coworker|colleague|party|family|group|pressure)\b/i, ids: ['group-norms', 'implementation-intentions', 'reframe-mindset', 'decisive-moment', 'reduce-exposure', 'commitment-device', 'pointing-calling'] },
  { pattern: /\b(commute|commuting|drive|driving|car|train|bus|transit|travel|route|trip)\b/i, ids: ['implementation-intentions', 'habit-stacking', 'decisive-moment', 'prime-environment', 'environment-design', 'reduce-exposure', 'increase-friction', 'activity-zones'] },
  { pattern: /\b(stress|stressed|anxious|anxiety|overwhelm|overwhelmed|anger|angry|frustrat(?:ed|ion))\b/i, ids: ['reframe-mindset', 'decisive-moment', 'implementation-intentions', 'habit-stacking', 'pointing-calling', 'commitment-device'] },
  { pattern: /\b(bored|boredom|idle|waiting|lonely)\b/i, ids: ['decisive-moment', 'implementation-intentions', 'activity-zones', 'environment-design', 'reduce-exposure', 'habit-stacking'] },
  { pattern: /\b(phone|screen|scroll|scrolling|app|gaming|game|internet|online)\b/i, ids: ['reduce-exposure', 'increase-friction', 'activity-zones', 'environment-design', 'implementation-intentions', 'decisive-moment'] },
  { pattern: /\b(coffee|caffeine|meal|eating|food|lunch|dinner|breakfast|snack)\b/i, ids: ['habit-stacking', 'implementation-intentions', 'decisive-moment', 'pointing-calling', 'prime-environment', 'environment-design'] },
  { pattern: /\b(night|late|bed|bedtime|sleep|morning|wake|waking)\b/i, ids: ['reduce-exposure', 'increase-friction', 'activity-zones', 'implementation-intentions', 'decisive-moment', 'prime-environment'] },
  { pattern: /\b(work|office|desk|study|school|class)\b/i, ids: ['environment-design', 'prime-environment', 'implementation-intentions', 'decisive-moment', 'activity-zones', 'reduce-exposure'] },
  { pattern: /\b(home|house|room|bedroom|kitchen)\b/i, ids: ['environment-design', 'prime-environment', 'activity-zones', 'reduce-exposure', 'increase-friction'] },
];

function relevantChoices(trigger: string, choices: InsightTechniqueChoice[]) {
  const ids = new Set(triggerTechniqueIds.filter(group => group.pattern.test(trigger)).flatMap(group => group.ids));
  const words = normalize(trigger).match(/[\p{L}\p{N}]+/gu)?.filter(word => word.length > 3) ?? [];
  return choices.filter(choice => {
    if (choice.techniqueId && ids.has(choice.techniqueId)) return true;
    if (ids.size) return false;
    const contentWords = new Set(normalize(`${choice.name} ${choice.description ?? ''} ${choice.example ?? ''}`).match(/[\p{L}\p{N}]+/gu) ?? []);
    return words.some(word => contentWords.has(word));
  }).filter(choice => actionForTechnique(choice, trigger));
}

function actionForTechnique(choice: InsightTechniqueChoice, trigger: string): string | undefined {
  const actions: Record<string, (value: string) => string> = {
    'implementation-intentions': value => `Before the next ${value} situation, decide when and where you will use a specific alternative action.`,
    'habit-stacking': value => `Pair one small alternative action with a routine that happens during ${value}.`,
    'reduce-exposure': value => `Before ${value} next occurs, change one cue connected to it.`,
    'environment-design': value => `Before ${value} next occurs, arrange the space so the action you want is easier to start.`,
    'prime-environment': value => `Before ${value} next occurs, put one item you need for your chosen action within reach.`,
    'increase-friction': value => `Before ${value} next occurs, add one deliberate step between the cue and the habit.`,
    'reframe-mindset': value => `Before the next ${value} situation, write one personal reason for changing this habit and read it when the cue appears.`,
    'decisive-moment': value => `Decide now on the small action you will take when ${value} next appears.`,
    'group-norms': value => `For the next ${value} situation, choose one person or setting that supports the behavior you want.`,
    'pointing-calling': value => `When ${value} appears, name the cue and your next choice out loud.`,
    'activity-zones': value => `Before ${value} next occurs, give one nearby space or device a clear purpose that supports your chosen action.`,
    'commitment-device': value => `Before the next ${value} situation, make one voluntary change that makes your chosen action easier to follow.`,
  };
  return choice.techniqueId ? actions[choice.techniqueId]?.(trigger) : undefined;
}

export function buildSuggestedExperiment(logs: BehaviorLog[], allLogs: BehaviorLog[], choices: InsightTechniqueChoice[]): SuggestedExperiment {
  const triggers = summarizeTriggers(logs, allLogs);
  const unfavorable = triggers.filter(trigger => trigger.unfavorable > 0)
    .sort((a, b) => b.appearances - a.appearances || b.unfavorable - a.unfavorable || stableByName(a, b));
  const unaddressedRepeated = triggers.filter(trigger => trigger.appearances > 1 && !trigger.hasTechniqueApplication)
    .sort((a, b) => b.appearances - a.appearances || stableByName(a, b));
  const focus = unfavorable[0] ?? unaddressedRepeated[0] ?? triggers[0];

  if (!focus) {
    return {
      trigger: undefined,
      technique: undefined,
      action: logs.length
        ? 'No clear trigger pattern is recorded for this period yet. Log a trigger, what you tried, and what happened afterward.'
        : 'No entries were logged in this period. Record a trigger and what happened next to build a useful pattern.',
      untestedForTrigger: false,
    };
  }

  const relevant = relevantChoices(focus.name, choices);
  const triggerUses = (choice: InsightTechniqueChoice) => logs.filter(log =>
    log.type === 'technique_applied' && !isRecoveryPrincipleApplication(log) && log.trigger?.trim() === focus.name && matchesInsightTechnique(log, choice),
  ).length;
  const technique = relevant.sort((a, b) => (triggerUses(a) > 0 ? 1 : 0) - (triggerUses(b) > 0 ? 1 : 0)
    || triggerUses(a) - triggerUses(b) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))[0];

  return {
    trigger: focus,
    technique,
    action: technique
      ? `${actionForTechnique(technique, focus.name)} Then log whether the habit happened and what you tried. The outcome is unknown until you record it.`
      : `No configured technique clearly matches ${focus.name}. Add a relevant technique to your strategy, then try one specific action when this trigger next appears and log what happened.`,
    untestedForTrigger: Boolean(technique && triggerUses(technique) === 0),
  };
}

export function buildStrategyGap(
  logs: BehaviorLog[],
  allLogs: BehaviorLog[],
  configuredChoices: InsightTechniqueChoice[],
  laws: InsightLaw[],
): StrategyGap {
  const triggers = summarizeTriggers(logs, allLogs);
  const unaddressed = triggers.filter(trigger => trigger.appearances > 1 && !trigger.hasTechniqueApplication)
    .sort((a, b) => b.unfavorable - a.unfavorable || b.appearances - a.appearances || stableByName(a, b))[0];
  if (unaddressed) {
    return {
      title: 'Untested trigger',
      description: `${unaddressed.name} appeared in ${unaddressed.appearances} logged entries with no technique application linked to it.`,
    };
  }

  const missingLaw = laws.find(law => !configuredChoices.some(choice => choice.laws.includes(law.id)));
  if (missingLaw) return { title: 'Strategy gap', description: `No ${missingLaw.break} technique is configured for this habit.` };

  const hasTechniqueUse = logs.some(log => log.type === 'technique_applied' && !isRecoveryPrincipleApplication(log));
  if (configuredChoices.length && !hasTechniqueUse) {
    return { title: 'Practice gap', description: 'No configured technique was recorded as practiced during this period.' };
  }

  return {
    title: 'Next step',
    description: 'Keep linking technique applications to triggers and recording what happened afterward.',
  };
}
