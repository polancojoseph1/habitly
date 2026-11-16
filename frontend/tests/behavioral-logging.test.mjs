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
  resolvedEpisodeOutcome,
  summarizeDay,
  withoutSampleBehaviorLogs,
} from '../app/behavioral-logging.ts';

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
