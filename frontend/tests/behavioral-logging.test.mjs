import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBehaviorLogChanges,
  behaviorDayKey,
  dateKeyInZone,
  episodeResolvedOutcome,
  metadataForEditedTimestamp,
  minutesToCravingResolution,
  outcomeForCraving,
  removeBehaviorLogRecord,
  recordPostEngagementSatisfaction,
  recordUrgeFollowUp,
  resolvedEpisodeOutcome,
  summarizeDay,
  withoutSampleBehaviorLogs,
} from '../app/behavioral-logging.ts';
import {
  compareRecordedPeriods,
  isOccurrenceDayConfirmed,
  isPeriodOccurrenceCoverageComplete,
  primaryRecordedValue,
  resistancePercentage,
  techniqueOutcomePercentages,
  techniqueApplicationsByName,
  techniquePracticeNote,
  triggerInsightSentence,
} from '../app/period-checkin.ts';
import {
  buildStrategyGap,
  buildSuggestedExperiment,
  buildTechniquePracticeStats,
  mostCommonTrigger,
  mostPracticedTechnique,
  summarizeCuePatterns,
  summarizeUrgeCheckIns,
} from '../app/insights.ts';

const insightLog = (id, type, fields = {}) => ({
  id,
  habitId: 'habit-a',
  type,
  at: '2026-11-15T16:00:00.000Z',
  localDate: '2026-11-15',
  timezone: 'America/New_York',
  ...fields,
});
const insightChoice = (id, name, laws, extra = {}) => ({ key: `technique:${id}`, name, techniqueId: id, laws, ...extra });
const insightLaws = [
  { id: 'cue', break: 'Make It Invisible' },
  { id: 'craving', break: 'Make It Unattractive' },
  { id: 'response', break: 'Make It Difficult' },
  { id: 'reward', break: 'Make It Unsatisfying' },
];

const craving = (id, episodeId, outcome = 'pending', at = '2026-11-15T16:00:00.000Z') => ({
  id, habitId: 'habit-a', type: 'craving', episodeId, outcome, at, localDate: '2026-11-15', timezone: 'America/New_York',
});
const occurrence = (id, episodeId, quantity = 1, at = '2026-11-15T16:10:00.000Z') => ({
  id, habitId: 'habit-a', type: 'habit_occurrence', episodeId, quantity, at, localDate: '2026-11-15', timezone: 'America/New_York',
});

test('daily counts use occurrence quantities and do not count cravings as cigarettes', () => {
  const logs = [craving('c1', 'ep1', 'smoked'), occurrence('o1', 'ep1', 3)];
  const summary = summarizeDay(logs, 'habit-a', '2026-11-15', []);
  assert.equal(summary.cravings, 1);
  assert.equal(summary.occurrenceEvents, 1);
  assert.equal(summary.quantity, 3);
  assert.equal(summary.resolvedCravings, 1);
});

test('an occurrence resolves its episode as engaged even if a craving has stale resisted state', () => {
  const logs = [craving('c1', 'ep1', 'resisted'), occurrence('o1', 'ep1', 2)];
  assert.equal(resolvedEpisodeOutcome(logs, 'ep1'), 'smoked');
  assert.equal(outcomeForCraving(logs, logs[0]), 'smoked');
});

test('techniques in one episode share its outcome without assigning exclusive credit', () => {
  const logs = [craving('c1', 'ep1', 'resisted'),
    { id: 't1', habitId: 'habit-a', type: 'technique_applied', episodeId: 'ep1', techniqueId: 'delay', timing: 'responsive', at: '2026-11-15T16:01:00Z' },
    { id: 't2', habitId: 'habit-a', type: 'technique_applied', episodeId: 'ep1', techniqueId: 'walk', timing: 'responsive', at: '2026-11-15T16:02:00Z' }];
  assert.equal(episodeResolvedOutcome(logs, logs[1]), 'resisted');
  assert.equal(episodeResolvedOutcome(logs, logs[2]), 'resisted');
});

test('unknown outcomes stay out of the resolved daily denominator', () => {
  const logs = [craving('c1', 'ep1', 'pending'), craving('c2', 'ep2', 'resisted')];
  const summary = summarizeDay(logs, 'habit-a', '2026-11-15', []);
  assert.equal(summary.cravings, 2);
  assert.equal(summary.resolvedCravings, 1);
  assert.equal(summary.resistedCravings, 1);
});

test('no occurrence data is unknown unless the user explicitly confirms the day', () => {
  const missing = summarizeDay([], 'habit-a', '2026-11-15', []);
  assert.equal(missing.knownOccurrenceCount, false);
  const confirmed = summarizeDay([], 'habit-a', '2026-11-15', [{ habitId: 'habit-a', date: '2026-11-15', status: 'no_occurrence', updatedAt: '2026-11-15T23:00:00Z' }]);
  assert.equal(confirmed.knownOccurrenceCount, true);
  assert.equal(confirmed.explicitNoOccurrence, true);
});

test('a conflicting no occurrence confirmation is surfaced without erasing the event', () => {
  const logs = [occurrence('o1', 'ep1', 1)];
  const summary = summarizeDay(logs, 'habit-a', '2026-11-15', [{ habitId: 'habit-a', date: '2026-11-15', status: 'no_occurrence', updatedAt: '2026-11-15T23:00:00Z' }]);
  assert.equal(summary.conflict, true);
  assert.equal(summary.occurrenceEvents, 1);
  assert.equal(summary.knownOccurrenceCount, true);
});

test('a confirmation that occurrences were recorded conflicts when the day has none', () => {
  const summary = summarizeDay([], 'habit-a', '2026-11-15', [{ habitId: 'habit-a', date: '2026-11-15', status: 'occurred_recorded', updatedAt: '2026-11-15T23:00:00Z' }]);
  assert.equal(summary.conflict, true);
  assert.equal(summary.knownOccurrenceCount, false);
});

test('stored local dates and timezone boundaries preserve historical day grouping', () => {
  assert.equal(behaviorDayKey({ at: '2026-11-16T04:30:00Z', timezone: 'America/New_York' }), '2026-11-15');
  assert.equal(behaviorDayKey({ at: '2026-11-16T04:30:00Z', localDate: '2026-11-14', timezone: 'America/New_York' }), '2026-11-14');
  assert.equal(dateKeyInZone('2026-11-16T04:30:00Z', 'America/New_York'), '2026-11-15');
});

test('editing event details without changing its instant preserves its original local date and timezone', () => {
  const original = craving('c1', 'ep1');
  const metadata = metadataForEditedTimestamp(original, original.at, 'Asia/Tokyo');
  assert.deepEqual(metadata, { localDate: '2026-11-15', timezone: 'America/New_York' });
  assert.deepEqual(metadataForEditedTimestamp(original, '2026-11-15T16:30:00.000Z', 'Asia/Tokyo'), { localDate: '2026-11-16', timezone: 'Asia/Tokyo' });
});

test('new craving records keep optional fields empty and retain backdated local time', () => {
  const entry = { id: 'c1', habitId: 'habit-a', type: 'craving', episodeId: 'ep1', at: '2026-04-03T18:21:00.000Z', createdAt: '2026-11-15T16:00:00.000Z', localDate: '2026-04-03', timezone: 'America/New_York', outcome: 'pending' };
  const saved = applyBehaviorLogChanges([], [entry]);
  assert.equal(saved[0].at, '2026-04-03T18:21:00.000Z');
  assert.equal(saved[0].localDate, '2026-04-03');
  assert.equal(saved[0].trigger, undefined);
  assert.equal(saved[0].context, undefined);
});

test('a real log for a sample habit survives while seeded sample logs are excluded', () => {
  const realUseOfSampleHabit = craving('behavior-real-1', 'ep1');
  const seededSample = craving('sample-log-old', 'ep2');
  assert.deepEqual(withoutSampleBehaviorLogs([realUseOfSampleHabit, seededSample]), [realUseOfSampleHabit]);
});

test('technique applications preserve the configured technique, law and usage context', () => {
  const entry = { id: 't1', habitId: 'habit-a', type: 'technique_applied', episodeId: 'ep1', technique: 'Increase Friction', techniqueId: 'increase-friction', law: 'response', laws: ['response'], timing: 'preventive', at: '2026-11-15T16:00:00.000Z' };
  const saved = applyBehaviorLogChanges([], [entry]);
  assert.equal(saved[0].techniqueId, 'increase-friction');
  assert.equal(saved[0].law, 'response');
  assert.equal(saved[0].timing, 'preventive');
  assert.equal(episodeResolvedOutcome(saved, saved[0]), 'unknown');
});

test('occurrence saves update the linked craving and preserve its explicit quantity', () => {
  const pending = craving('c1', 'ep1');
  const logged = occurrence('o1', 'ep1', 4);
  const saved = applyBehaviorLogChanges([pending], [logged]);
  assert.equal(saved.find(log => log.id === 'c1').outcome, 'smoked');
  assert.equal(saved.find(log => log.id === 'o1').quantity, 4);
  assert.equal(saved.find(log => log.id === 'c1').resolvedAt, logged.at);
  assert.equal(saved.filter(log => log.type === 'habit_occurrence').length, 1);
});

test('time to resolution is reported only when a resolved timestamp is known', () => {
  const resisted = { ...craving('c1', 'ep1', 'resisted'), resolvedAt: '2026-11-15T16:12:00.000Z' };
  assert.equal(minutesToCravingResolution([resisted], resisted), 12);
  assert.equal(minutesToCravingResolution([craving('c2', 'ep2', 'resisted')], craving('c2', 'ep2', 'resisted')), undefined);
  const smoked = craving('c3', 'ep3');
  assert.equal(minutesToCravingResolution([smoked, occurrence('o3', 'ep3', 1, '2026-11-15T16:10:00.000Z')], smoked), 10);
});

test('updating an event with the same stable ID replaces it instead of duplicating it', () => {
  const first = occurrence('o1', 'ep1', 1);
  const updated = { ...first, quantity: 3, at: '2026-11-15T16:30:00.000Z' };
  const saved = applyBehaviorLogChanges([first], [updated]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].quantity, 3);
  assert.equal(saved[0].at, '2026-11-15T16:30:00.000Z');
});

test('removing an occurrence keeps the craving and reopens its unresolved episode', () => {
  const logs = [craving('c1', 'ep1', 'smoked'), occurrence('o1', 'ep1', 1)];
  const remaining = removeBehaviorLogRecord(logs, 'o1');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].outcome, 'pending');
  assert.equal(remaining[0].resolvedAt, undefined);
});

test('conflicting resisted outcome cannot be saved over a linked occurrence', () => {
  const logs = [craving('c1', 'ep1', 'smoked'), occurrence('o1', 'ep1', 1)];
  assert.throws(() => applyBehaviorLogChanges(logs, [{ ...logs[0], outcome: 'resisted' }]), /cannot be marked resisted/);
});

test('reapplying a stable craving and linked occurrence transaction does not double count', () => {
  const first = craving('c1', 'ep1', 'smoked');
  const cigarette = occurrence('o1', 'ep1', 1);
  const saved = applyBehaviorLogChanges(applyBehaviorLogChanges([], [first, cigarette]), [first, cigarette]);
  assert.equal(saved.filter(log => log.type === 'craving').length, 1);
  assert.equal(saved.filter(log => log.type === 'habit_occurrence').length, 1);
  assert.equal(saved.reduce((sum, log) => sum + (log.type === 'habit_occurrence' ? log.quantity : 0), 0), 1);
});

test('cue analytics include physical state, habit accessibility, and underlying motive with valid denominators', () => {
  const first = { ...craving('c1', 'ep1'), context: { bodilyState: 'tired', accessibility: 'in_hand', motives: ['relief', 'comfort'] } };
  const second = craving('c2', 'ep2');
  const summary = summarizeCuePatterns([first, second], ['2026-11-15']);
  assert.equal(summary.cravings, 2);
  for (const dimension of ['Physical state', 'Access to the habit', 'Underlying motive']) {
    assert.ok(summary.patterns.some(pattern => pattern.dimension === dimension));
  }
  assert.deepEqual(summary.patterns.find(pattern => pattern.dimension === 'Physical state'), {
    dimension: 'Physical state', value: 'Tired or short on sleep', count: 1, recorded: 1, days: 1,
  });
  assert.equal(summary.patterns.find(pattern => pattern.dimension === 'Access to the habit').recorded, 1);
  assert.equal(summary.patterns.find(pattern => pattern.dimension === 'Underlying motive').recorded, 1);
});

test('follow-up answers persist on the craving without replacing its cue data', () => {
  const original = { ...craving('c1', 'ep1', 'resisted'), context: { bodilyState: 'tired', accessibility: 'nearby', motives: ['relief'] }, urgeFollowUpDueAt: '2026-11-15T16:15:00.000Z' };
  const withFollowUp = recordUrgeFollowUp([original], 'c1', 'stayed_gone', '2026-11-15T16:16:00.000Z');
  assert.equal(withFollowUp.length, 1);
  assert.deepEqual(withFollowUp[0].context, original.context);
  assert.equal(withFollowUp[0].urgeFollowUpStatus, 'stayed_gone');
  assert.equal(withFollowUp[0].urgeFollowUpAt, '2026-11-15T16:16:00.000Z');
  const rated = recordPostEngagementSatisfaction(withFollowUp, 'c1', 'worse_than_expected', '2026-11-15T16:17:00.000Z');
  assert.equal(rated[0].postEngagementSatisfaction, 'worse_than_expected');
  assert.equal(rated[0].urgeFollowUpStatus, 'stayed_gone');
});

test('engagement before the delayed prompt cancels an unanswered urge follow-up', () => {
  const pending = { ...craving('c1', 'ep1', 'resisted'), urgeFollowUpDueAt: '2026-11-15T16:15:00.000Z' };
  const saved = applyBehaviorLogChanges([pending], [occurrence('o1', 'ep1', 1)]);
  assert.equal(saved.find(log => log.id === 'c1').outcome, 'smoked');
  assert.equal(saved.find(log => log.id === 'c1').urgeFollowUpDueAt, undefined);
});

test('check-in analytics keep skipped and unanswered entries out of answer denominators', () => {
  const logs = [
    { ...craving('c1', 'ep1', 'resisted'), urgeFollowUpDueAt: '2026-11-15T16:15:00Z', urgeFollowUpStatus: 'stayed_gone' },
    { ...craving('c2', 'ep2', 'resisted'), urgeFollowUpDueAt: '2026-11-15T16:15:00Z', urgeFollowUpStatus: 'lingering_or_returned' },
    { ...craving('c3', 'ep3', 'resisted'), urgeFollowUpDueAt: '2026-11-15T16:15:00Z', urgeFollowUpStatus: 'skipped' },
    { ...craving('c4', 'ep4', 'resisted'), urgeFollowUpDueAt: '2026-11-15T16:15:00Z' },
    { ...craving('c5', 'ep5', 'smoked'), questionnaireVersion: 1, postEngagementSatisfaction: 'worse_than_expected' },
    { ...craving('c6', 'ep6', 'smoked'), questionnaireVersion: 1, postEngagementSatisfaction: 'neutral' },
    { ...craving('c7', 'ep7', 'smoked'), questionnaireVersion: 1, postEngagementSatisfaction: 'as_expected' },
    { ...craving('c8', 'ep8', 'smoked'), questionnaireVersion: 1, postEngagementSatisfaction: 'skipped' },
    { ...craving('c9', 'ep9', 'smoked'), questionnaireVersion: 1 },
  ];
  assert.deepEqual(summarizeUrgeCheckIns(logs), {
    scheduled: 4, answered: 2, stayedGone: 1, lingeringOrReturned: 1, skipped: 1, awaiting: 1,
    engaged: 5, satisfactionAnswered: 3, satisfactionWorse: 1, satisfactionNeutral: 1,
    satisfactionAsExpected: 1, satisfactionSkipped: 1, satisfactionAwaiting: 1,
  });
});

test('pre-questionnaire sample engagements do not become a backlog of unanswered satisfaction checks', () => {
  const older = craving('c-old', 'ep-old', 'smoked');
  const newEngagement = { ...craving('c-new', 'ep-new', 'smoked'), questionnaireVersion: 1 };
  const sample = { ...craving('sample-log-old', 'ep-sample', 'smoked'), questionnaireVersion: 1 };
  const summary = summarizeUrgeCheckIns([older, newEngagement, sample]);
  assert.equal(summary.engaged, 1);
  assert.equal(summary.satisfactionAwaiting, 1);
});

test('engagement analytics resolve an episode using linked events outside the selected date range', () => {
  const inPeriod = { ...craving('c1', 'ep1'), questionnaireVersion: 1 };
  const linkedOccurrence = occurrence('o1', 'ep1', 1, '2026-11-16T00:05:00.000Z');
  const summary = summarizeUrgeCheckIns([inPeriod], [inPeriod, linkedOccurrence]);
  assert.equal(summary.engaged, 1);
  assert.equal(summary.satisfactionAwaiting, 1);
});

test('recording a synthetic sample occurrence does not make it eligible for new follow-up prompts', () => {
  const sample = craving('sample-log-c1', 'ep1', 'pending');
  const saved = applyBehaviorLogChanges([sample], [{ ...occurrence('sample-log-o1', 'ep1'), habitId: 'habit-a' }]);
  assert.equal(saved.find(log => log.id === sample.id).questionnaireVersion, undefined);
  assert.equal(summarizeUrgeCheckIns(saved).engaged, 0);
});

test('primary smoking outcome uses cigarette quantity while other habits use occurrence count', () => {
  assert.equal(primaryRecordedValue(true, 6, 3, false), 6);
  assert.equal(primaryRecordedValue(false, 9, 3, false), 3);
});

test('an explicit smoke-free day can confirm zero while an unconfirmed empty day stays unknown', () => {
  const confirmedZero = { knownOccurrenceCount: true, occurrenceEvents: 0, conflict: false, confirmation: { status: 'no_occurrence' } };
  const unknownZero = { knownOccurrenceCount: false, occurrenceEvents: 0, conflict: false };
  assert.equal(isOccurrenceDayConfirmed(confirmedZero), true);
  assert.equal(isOccurrenceDayConfirmed(unknownZero), false);
  assert.equal(primaryRecordedValue(true, 0, 0, true), 0);
  assert.equal(primaryRecordedValue(true, 0, 0, false), undefined);
});

test('incomplete, skipped, or conflicting days cannot establish reliable occurrence coverage', () => {
  const incomplete = { knownOccurrenceCount: true, occurrenceEvents: 1, conflict: false, confirmation: { status: 'incomplete' } };
  const skipped = { knownOccurrenceCount: false, occurrenceEvents: 0, conflict: false, confirmation: { status: 'skip' } };
  const conflict = { knownOccurrenceCount: true, occurrenceEvents: 1, conflict: true, confirmation: { status: 'no_occurrence' } };
  assert.equal(isOccurrenceDayConfirmed(incomplete), false);
  assert.equal(isOccurrenceDayConfirmed(skipped), false);
  assert.equal(isOccurrenceDayConfirmed(conflict), false);
  assert.equal(isPeriodOccurrenceCoverageComplete([incomplete]), false);
});

test('rolling 24 hour comparisons require explicit daily confirmations for every date touched', () => {
  const confirmedEventDay = { knownOccurrenceCount: true, occurrenceEvents: 1, conflict: false, confirmation: { status: 'occurred_recorded' } };
  const loggedButUnconfirmedDay = { knownOccurrenceCount: true, occurrenceEvents: 1, conflict: false };
  assert.equal(isOccurrenceDayConfirmed(confirmedEventDay, true), true);
  assert.equal(isOccurrenceDayConfirmed(loggedButUnconfirmedDay, true), false);
  assert.equal(isPeriodOccurrenceCoverageComplete([confirmedEventDay, loggedButUnconfirmedDay], true), false);
});

test('craving resistance percentage only exists with a nonzero resolved denominator', () => {
  assert.equal(resistancePercentage(9, 12), 75);
  assert.equal(resistancePercentage(0, 0), undefined);
  assert.equal(resistancePercentage(0, 3), 0);
});

test('a habit with no configured strategies reports that state without implying successful resistance', () => {
  assert.equal(techniquePracticeNote(0, 0), 'No techniques are configured for this habit.');
  assert.equal(techniquePracticeNote(2, 0), 'No technique applications recorded in this period.');
  assert.equal(techniquePracticeNote(2, 0, true), 'No technique applications matched these filters.');
  assert.equal(techniquePracticeNote(2, 1), '1 distinct technique practiced.');
});

test('technique usage names and application counts come from technique logs only', () => {
  assert.deepEqual(techniqueApplicationsByName([
    { type: 'technique_applied', technique: 'Reframe Your Mindset' },
    { type: 'craving', technique: 'Not a technique' },
    { type: 'technique_applied', technique: 'Increase Friction' },
    { type: 'technique_applied', technique: 'Reframe Your Mindset' },
    { type: 'technique_applied' },
  ]), [['Reframe Your Mindset', 2], ['Increase Friction', 1], ['Technique', 1]]);
  assert.deepEqual(techniqueApplicationsByName([]), []);
});

test('trigger insight has a real empty state and preserves long trigger names', () => {
  const longName = 'Social pressure during long late night commutes with friends';
  assert.equal(triggerInsightSentence(undefined, '7 days'), 'No triggers were recorded during the selected 7 days.');
  assert.equal(triggerInsightSentence({ name: longName, count: 2 }, '7 days'), `${longName} was your most frequently recorded trigger during this period. 2 entries included this trigger.`);
});

test('recorded comparisons show an absolute difference and avoid a percent when the previous count is zero', () => {
  assert.deepEqual(compareRecordedPeriods(6, 12, true), { reliable: true, difference: -6, percentage: -50 });
  assert.deepEqual(compareRecordedPeriods(5, 0, true), { reliable: true, difference: 5, percentage: undefined });
  assert.deepEqual(compareRecordedPeriods(0, 0, true), { reliable: true, difference: 0, percentage: undefined });
});

test('incomplete previous period suppresses the comparative progress claim', () => {
  assert.deepEqual(compareRecordedPeriods(6, 12, false), { reliable: false });
});

test('empty insight periods show no trigger or practice and do not invent a recommendation', () => {
  assert.equal(mostCommonTrigger([]), undefined);
  assert.equal(mostPracticedTechnique([], []), undefined);
  assert.deepEqual(buildSuggestedExperiment([], [], []), {
    trigger: undefined,
    technique: undefined,
    action: 'No entries were logged in this period. Record a trigger and what happened next to build a useful pattern.',
    untestedForTrigger: false,
  });
  const summary = buildTechniquePracticeStats([], [], [], [], [], insightLaws.map(law => law.id));
  assert.deepEqual(summary.lawCounts.map(item => item.count), [0, 0, 0, 0]);
  assert.deepEqual(summary.techniques, []);
});

test('a single trigger is counted as a logged appearance and a selected period scopes the summary', () => {
  const selectedPeriod = [insightLog('c1', 'craving', { trigger: 'Commute' })];
  assert.deepEqual(mostCommonTrigger(selectedPeriod), {
    name: 'Commute', appearances: 1, episodes: 1, unfavorable: 0, resolved: 0, hasTechniqueApplication: false,
  });
  assert.equal(mostCommonTrigger([insightLog('c2', 'craving', { trigger: 'Older trigger' })])?.name, 'Older trigger');
});

test('tied most common triggers sort alphabetically regardless of record order', () => {
  const commute = insightLog('c1', 'craving', { trigger: 'Commute' });
  const boredom = insightLog('c2', 'craving', { trigger: 'Boredom' });
  assert.equal(mostCommonTrigger([commute, boredom])?.name, 'Boredom');
  assert.equal(mostCommonTrigger([boredom, commute])?.name, 'Boredom');
});

test('tied most practiced techniques sort alphabetically regardless of record order', () => {
  const logs = [
    insightLog('t1', 'technique_applied', { technique: 'Increase Friction', techniqueId: 'increase-friction' }),
    insightLog('t2', 'technique_applied', { technique: 'Implementation Intentions', techniqueId: 'implementation-intentions' }),
  ];
  assert.equal(mostPracticedTechnique(logs, [])?.name, 'Implementation Intentions');
  assert.equal(mostPracticedTechnique([...logs].reverse(), [])?.name, 'Implementation Intentions');
});

test('practice counts are applications, and a technique linked to two laws counts once under each', () => {
  const choice = insightChoice('habit-automation', 'Habit Automation', ['cue', 'response']);
  const applications = [
    insightLog('t1', 'technique_applied', { technique: choice.name, techniqueId: choice.techniqueId, laws: choice.laws }),
    insightLog('t2', 'technique_applied', { technique: choice.name, techniqueId: choice.techniqueId, laws: choice.laws }),
  ];
  const summary = buildTechniquePracticeStats(applications, applications, applications, [choice], [choice], insightLaws.map(law => law.id));
  assert.equal(summary.techniques.length, 1);
  assert.equal(summary.techniques[0].total, 2);
  assert.deepEqual(summary.lawCounts.map(item => item.count), [1, 0, 1, 0]);
});

test('multiple techniques sharing one episode each show the same outcome without exclusive credit', () => {
  const first = insightChoice('increase-friction', 'Increase Friction', ['response']);
  const second = insightChoice('reframe-mindset', 'Reframe Your Mindset', ['craving']);
  const logs = [
    insightLog('c1', 'craving', { episodeId: 'ep1', trigger: 'Stress', outcome: 'resisted' }),
    insightLog('t1', 'technique_applied', { episodeId: 'ep1', technique: first.name, techniqueId: first.techniqueId, laws: first.laws, timing: 'responsive', trigger: 'Stress' }),
    insightLog('t2', 'technique_applied', { episodeId: 'ep1', technique: second.name, techniqueId: second.techniqueId, laws: second.laws, timing: 'responsive', trigger: 'Stress' }),
  ];
  const summary = buildTechniquePracticeStats(logs.filter(log => log.type === 'technique_applied'), logs, logs, [first, second], [first, second], insightLaws.map(law => law.id));
  assert.deepEqual(summary.techniques.map(item => [item.resolved, item.resisted, item.engaged]), [[1, 1, 0], [1, 1, 0]]);
});

test('preventive use is kept separate from responsive outcomes', () => {
  const choice = insightChoice('increase-friction', 'Increase Friction', ['response']);
  const logs = [
    insightLog('t1', 'technique_applied', { episodeId: 'ep1', technique: choice.name, techniqueId: choice.techniqueId, laws: choice.laws, timing: 'preventive' }),
    insightLog('t2', 'technique_applied', { episodeId: 'ep2', technique: choice.name, techniqueId: choice.techniqueId, laws: choice.laws, timing: 'responsive' }),
    insightLog('c2', 'craving', { episodeId: 'ep2', outcome: 'resisted' }),
  ];
  const stat = buildTechniquePracticeStats(logs.filter(log => log.type === 'technique_applied'), logs, logs, [choice], [choice], ['response']).techniques[0];
  assert.equal(stat.total, 2);
  assert.equal(stat.preventive, 1);
  assert.equal(stat.responsive, 1);
  assert.equal(stat.resolved, 1);
  assert.equal(stat.resisted, 1);
});

test('preventive occurrence details stay inside the selected period', () => {
  const choice = insightChoice('increase-friction', 'Increase Friction', ['response']);
  const application = insightLog('t1', 'technique_applied', { technique: choice.name, techniqueId: choice.techniqueId, laws: choice.laws, timing: 'preventive' });
  const outsidePeriodOccurrence = insightLog('o1', 'habit_occurrence', { localDate: '2026-11-14' });
  const stat = buildTechniquePracticeStats([application], [application, outsidePeriodOccurrence], [application], [choice], [choice], ['response']).techniques[0];
  assert.equal(stat.preventiveDays, 1);
  assert.equal(stat.occurrencesOnPreventiveDays, 0);
});

test('unknown and unresolved responsive outcomes do not enter the resolved denominator', () => {
  const choice = insightChoice('increase-friction', 'Increase Friction', ['response']);
  const logs = [
    insightLog('t1', 'technique_applied', { episodeId: 'ep1', technique: choice.name, techniqueId: choice.techniqueId, laws: choice.laws, timing: 'responsive' }),
    insightLog('c1', 'craving', { episodeId: 'ep1', outcome: 'pending' }),
    insightLog('t2', 'technique_applied', { episodeId: 'ep2', technique: choice.name, techniqueId: choice.techniqueId, laws: choice.laws, timing: 'responsive' }),
  ];
  const stat = buildTechniquePracticeStats(logs.filter(log => log.type === 'technique_applied'), logs, logs, [choice], [choice], ['response']).techniques[0];
  assert.equal(stat.responsive, 2);
  assert.equal(stat.resolved, 0);
  assert.equal(stat.unknown, 2);
  assert.equal(stat.resisted, 0);
  assert.equal(stat.engaged, 0);
  assert.equal(techniqueOutcomePercentages(stat.resisted, stat.engaged, stat.resolved), undefined);
});

test('technique outcome percentages compare only resolved responsive episodes', () => {
  const choice = insightChoice('increase-friction', 'Increase Friction', ['response']);
  const logs = [
    insightLog('t1', 'technique_applied', { episodeId: 'ep1', technique: choice.name, techniqueId: choice.techniqueId, timing: 'responsive' }),
    insightLog('c1', 'craving', { episodeId: 'ep1', outcome: 'resisted' }),
    insightLog('t2', 'technique_applied', { episodeId: 'ep2', technique: choice.name, techniqueId: choice.techniqueId, timing: 'responsive' }),
    insightLog('o2', 'habit_occurrence', { episodeId: 'ep2' }),
    insightLog('t3', 'technique_applied', { episodeId: 'ep3', technique: choice.name, techniqueId: choice.techniqueId, timing: 'responsive' }),
    insightLog('c3', 'craving', { episodeId: 'ep3', outcome: 'pending' }),
  ];
  const stat = buildTechniquePracticeStats(logs.filter(log => log.type === 'technique_applied'), logs, logs, [choice], [choice], ['response']).techniques[0];
  assert.equal(stat.resolved, 2);
  assert.equal(stat.unknown, 1);
  assert.deepEqual(techniqueOutcomePercentages(stat.resisted, stat.engaged, stat.resolved), { worked: 50, didNotWork: 50 });
});

test('a contextually relevant strategy is suggested instead of the most used unrelated technique', () => {
  const tracking = insightChoice('habit-tracking', 'Habit Tracking', ['reward']);
  const plan = insightChoice('implementation-intentions', 'Implementation Intentions', ['cue']);
  const logs = [
    insightLog('c1', 'craving', { episodeId: 'ep1', trigger: 'Social pressure', outcome: 'pending' }),
    insightLog('c2', 'craving', { episodeId: 'ep2', trigger: 'Social pressure', outcome: 'pending' }),
    insightLog('t1', 'technique_applied', { technique: tracking.name, techniqueId: tracking.techniqueId, laws: tracking.laws, trigger: 'Other routine' }),
    insightLog('t2', 'technique_applied', { technique: tracking.name, techniqueId: tracking.techniqueId, laws: tracking.laws, trigger: 'Other routine' }),
    insightLog('t3', 'technique_applied', { technique: tracking.name, techniqueId: tracking.techniqueId, laws: tracking.laws, trigger: 'Other routine' }),
  ];
  const suggestion = buildSuggestedExperiment(logs, logs, [tracking, plan]);
  assert.equal(suggestion.trigger?.name, 'Social pressure');
  assert.equal(suggestion.technique?.name, 'Implementation Intentions');
  assert.match(suggestion.action, /decide when and where/);
  assert.match(suggestion.action, /log whether the habit happened/);
  assert.equal(suggestion.untestedForTrigger, true);
});

test('commute suggestions require a commute relevant technique and never default to tracking', () => {
  const tracking = insightChoice('habit-tracking', 'Habit Tracking', ['reward']);
  const friction = insightChoice('increase-friction', 'Increase Friction', ['response']);
  const logs = [insightLog('c1', 'craving', { episodeId: 'ep1', trigger: 'Commute', outcome: 'pending' })];
  const suggestion = buildSuggestedExperiment(logs, logs, [tracking, friction]);
  assert.equal(suggestion.technique?.name, 'Increase Friction');
  assert.match(suggestion.action, /add one deliberate step/);
});

test('an unrelated configured technique leads to a Strategy page experiment, not an invented technique', () => {
  const tracking = insightChoice('habit-tracking', 'Habit Tracking', ['reward']);
  const logs = [insightLog('c1', 'craving', { episodeId: 'ep1', trigger: 'Commute', outcome: 'pending' })];
  const suggestion = buildSuggestedExperiment(logs, logs, [tracking]);
  assert.equal(suggestion.technique, undefined);
  assert.match(suggestion.action, /No configured technique clearly matches Commute/);
});

test('repeated unfavorable triggers are prioritized without labeling frequency as danger', () => {
  const plan = insightChoice('implementation-intentions', 'Implementation Intentions', ['cue']);
  const logs = [
    insightLog('c1', 'craving', { episodeId: 'ep1', trigger: 'Commute', outcome: 'smoked' }),
    insightLog('c2', 'craving', { episodeId: 'ep2', trigger: 'Commute', outcome: 'smoked' }),
    insightLog('c3', 'craving', { episodeId: 'ep3', trigger: 'Social pressure', outcome: 'pending' }),
    insightLog('c4', 'craving', { episodeId: 'ep4', trigger: 'Social pressure', outcome: 'pending' }),
    insightLog('c5', 'craving', { episodeId: 'ep5', trigger: 'Social pressure', outcome: 'pending' }),
  ];
  const suggestion = buildSuggestedExperiment(logs, logs, [plan]);
  assert.equal(mostCommonTrigger(logs)?.name, 'Social pressure');
  assert.equal(suggestion.trigger?.name, 'Commute');
});

test('repeated unaddressed triggers are offered before an unrelated frequently used strategy', () => {
  const tracking = insightChoice('habit-tracking', 'Habit Tracking', ['reward']);
  const logs = [
    insightLog('c1', 'craving', { episodeId: 'ep1', trigger: 'Commute', outcome: 'pending' }),
    insightLog('c2', 'craving', { episodeId: 'ep2', trigger: 'Commute', outcome: 'pending' }),
    insightLog('t1', 'technique_applied', { technique: tracking.name, techniqueId: tracking.techniqueId, trigger: 'Other routine' }),
  ];
  const gap = buildStrategyGap(logs, logs, [tracking], insightLaws);
  assert.equal(gap.title, 'Untested trigger');
  assert.match(gap.description, /Commute appeared in 2 logged entries/);
});

test('an earlier application does not mark a trigger as practiced in the selected period', () => {
  const tracking = insightChoice('habit-tracking', 'Habit Tracking', ['reward']);
  const periodLogs = [
    insightLog('c1', 'craving', { episodeId: 'ep1', trigger: 'Commute', outcome: 'pending' }),
    insightLog('c2', 'craving', { episodeId: 'ep2', trigger: 'Commute', outcome: 'pending' }),
  ];
  const history = [
    ...periodLogs,
    insightLog('old-use', 'technique_applied', { technique: tracking.name, techniqueId: tracking.techniqueId, trigger: 'Commute', localDate: '2026-11-01' }),
  ];
  const gap = buildStrategyGap(periodLogs, history, [tracking], insightLaws);
  assert.equal(gap.title, 'Untested trigger');
});

test('missing law configuration is surfaced as one concise strategy gap', () => {
  const choice = insightChoice('increase-friction', 'Increase Friction', ['response']);
  const gap = buildStrategyGap([], [], [choice], insightLaws);
  assert.deepEqual(gap, { title: 'Strategy gap', description: 'No Make It Invisible technique is configured for this habit.' });
});

test('long technique names and recorded context remain available in expanded practice data', () => {
  const name = 'A Very Long Contextual Technique Name That Should Wrap on a Small Screen';
  const choice = insightChoice('implementation-intentions', name, ['cue']);
  const application = insightLog('t1', 'technique_applied', {
    technique: name,
    techniqueId: choice.techniqueId,
    laws: choice.laws,
    trigger: 'Social pressure',
    context: { environments: ['Community center'], social: ['With friends'] },
  });
  const stat = buildTechniquePracticeStats([application], [application], [application], [choice], [choice], ['cue']).techniques[0];
  assert.equal(stat.name, name);
  assert.deepEqual(stat.contexts, ['Community center', 'With friends']);
  assert.deepEqual(stat.triggers, [['Social pressure', 1]]);
});

test('filtering application records limits technique rows and law counts to filtered data', () => {
  const cueTechnique = insightChoice('implementation-intentions', 'Implementation Intentions', ['cue']);
  const rewardTechnique = insightChoice('habit-tracking', 'Habit Tracking', ['reward']);
  const allApplications = [
    insightLog('t1', 'technique_applied', { technique: cueTechnique.name, techniqueId: cueTechnique.techniqueId, laws: cueTechnique.laws }),
    insightLog('t2', 'technique_applied', { technique: rewardTechnique.name, techniqueId: rewardTechnique.techniqueId, laws: rewardTechnique.laws }),
  ];
  const filtered = allApplications.filter(log => log.techniqueId === cueTechnique.techniqueId);
  const summary = buildTechniquePracticeStats(filtered, allApplications, allApplications, [cueTechnique, rewardTechnique], [cueTechnique, rewardTechnique], insightLaws.map(law => law.id));
  assert.deepEqual(summary.techniques.map(item => item.name), ['Implementation Intentions']);
  assert.deepEqual(summary.lawCounts.map(item => item.count), [1, 0, 0, 0]);
});
