import { behaviorDayKey, dateKeyInZone } from './behavioral-logging.ts';
import type { BehaviorLog, DailyConfirmation } from './behavioral-logging';

const TIMEZONE = 'America/New_York';

const triggers = [
  'After a meal', 'Work stress', 'Coffee break', 'Commute', 'Social pressure',
  'Boredom', 'Finishing a task', 'Waiting around', 'Alcohol nearby', 'Feeling restless',
];
const emotions = ['stressed', 'restless', 'bored', 'tense', 'frustrated', 'lonely', 'calm', 'hopeful'];
const environments = ['at home', 'outside the office', 'on the sidewalk', 'in the car', 'at a café', 'near the train'];
const activities = ['after lunch', 'working', 'commuting', 'drinking coffee', 'socializing', 'taking a break'];
const social = ['alone', 'with coworkers', 'with friends', 'around smokers', 'with family'];
const bodilyStates = ['tired', 'hungry_thirsty', 'restless', 'typical', 'unsure'];
const accessibilities = ['in_hand', 'nearby', 'out_of_reach', 'not_applicable'];
const motives = ['relief', 'distraction', 'stimulation', 'connection', 'comfort', 'something_else'];
const thoughts = [
  'One cigarette will take the edge off.',
  'I can wait a few minutes and see if the urge changes.',
  'Everyone else is taking a break.',
  'I want a pause more than I want a cigarette.',
  'A craving can pass without me acting on it.',
  'I already had one, so the day is ruined.',
  'I can return to my plan with the next choice.',
  'The urge feels strong, but it will not stay this strong forever.',
];
const reframings = [
  'A short walk can give me the pause I need.',
  'I am choosing a clearer afternoon, one decision at a time.',
  'I can step away from the group and still stay connected.',
  'This urge is temporary. I will check again in ten minutes.',
  'One lapse does not decide what I do next.',
  'I can make this break about fresh air instead.',
];
const techniques = [
  { id: 'increase-friction', name: 'Increase Friction', law: 'response', laws: ['response'] },
  { id: 'reframe-mindset', name: 'Reframe Your Mindset', law: 'craving', laws: ['craving'] },
  { id: 'habit-tracking', name: 'Habit Tracking', law: 'reward', laws: ['reward'] },
  { id: 'commitment-device', name: 'Commitment Device', law: 'response', laws: ['response', 'reward'] },
];
const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

function dateKeyDaysAgo(todayKey: string, daysAgo: number): string {
  const [year, month, day] = todayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - daysAgo)).toISOString().slice(0, 10);
}

function newYorkTimestamp(dateKey: string, hour: number, minute: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const desiredLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const guess = new Date(desiredLocalAsUtc);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(guess);
  const pick = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  const representedLocalAsUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'));
  return new Date(desiredLocalAsUtc + desiredLocalAsUtc - representedLocalAsUtc).toISOString();
}

function addMinutes(timestamp: string, minutes: number): string {
  return new Date(new Date(timestamp).getTime() + minutes * 60_000).toISOString();
}

/** Eight weeks of synthetic Smoking events for the unconnected sample workspace only. */
export function createSampleSmokingLogs(referenceDate = new Date()): BehaviorLog[] {
  const todayKey = dateKeyInZone(referenceDate, TIMEZONE);
  const referenceHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, hour: '2-digit', hourCycle: 'h23',
  }).format(referenceDate));
  const resistedPerTwelve = [2, 3, 4, 5, 6, 7, 8, 9];
  const records: BehaviorLog[] = [];
  let episodeNumber = 0;

  for (let daysAgo = 56; daysAgo >= 0; daysAgo -= 1) {
    const localDate = dateKeyDaysAgo(todayKey, daysAgo);
    const dayNumber = 56 - daysAgo;
    const weekNumber = Math.min(7, Math.floor(dayNumber / 7));
    const episodeCount = dayNumber % 3 === 0 ? 3 : dayNumber % 3 === 1 ? 1 : 2;
    const availableHours = daysAgo === 0 ? hours.filter(hour => hour < referenceHour - 2) : hours;
    if (!availableHours.length) continue;

    for (let withinDay = 0; withinDay < episodeCount; withinDay += 1) {
      const number = episodeNumber++;
      const episodeId = `sample-smoking-episode-${localDate}-${withinDay + 1}`;
      const baseId = `sample-log-smoking-${localDate}-${withinDay + 1}`;
      const triggerIndex = (number * 3 + dayNumber) % triggers.length;
      const emotionIndex = (number * 5 + dayNumber) % emotions.length;
      const hour = availableHours[(number * 7 + dayNumber * 2) % availableHours.length];
      const minute = (number * 13 + dayNumber * 7) % 60;
      const cravingAt = newYorkTimestamp(localDate, hour, minute);
      const trigger = triggers[triggerIndex];
      const context = {
        emotions: [emotions[emotionIndex]],
        environments: [environments[(number * 2 + dayNumber) % environments.length]],
        activities: [activities[(number + dayNumber * 2) % activities.length]],
        social: [social[(number * 3 + dayNumber) % social.length]],
        bodilyState: bodilyStates[(number * 2 + dayNumber) % bodilyStates.length],
        accessibility: accessibilities[(number + dayNumber * 3) % accessibilities.length],
        motives: number % 11 === 0
          ? ['unsure']
          : [motives[(number + dayNumber) % motives.length], ...(number % 3 === 0 ? [motives[(number + dayNumber + 2) % motives.length]] : [])],
        tags: ['sample analytics', ['after work', 'routine cue', 'strong urge', 'social setting'][number % 4]],
      };
      const isUnknown = number % 29 === 0;
      const resistanceSlot = (number * 5 + dayNumber * 3 + weekNumber) % 12;
      const outcome: BehaviorLog['outcome'] = isUnknown
        ? 'pending'
        : resistanceSlot < resistedPerTwelve[weekNumber] ? 'resisted' : 'smoked';
      const intensity = 2 + ((number * 7 + dayNumber) % 9);
      const thought = thoughts[(number * 3 + emotionIndex) % thoughts.length];
      const resolvedAt = outcome === 'resisted' ? addMinutes(cravingAt, 6 + (number * 11) % 34) : undefined;
      const urgeFollowUpDueAt = resolvedAt ? addMinutes(resolvedAt, 15) : undefined;
      const urgeFollowUpStatus: BehaviorLog['urgeFollowUpStatus'] = resolvedAt
        ? number % 7 === 0 ? 'skipped' : number % 3 === 0 ? 'lingering_or_returned' : 'stayed_gone'
        : undefined;
      const urgeFollowUpAt = urgeFollowUpDueAt && urgeFollowUpStatus ? addMinutes(urgeFollowUpDueAt, 2 + number % 8) : undefined;
      const occurrenceAt = outcome === 'smoked' ? addMinutes(cravingAt, 5 + (number * 7) % 18) : undefined;
      const satisfactionRatings = ['worse_than_expected', 'neutral', 'as_expected', 'skipped'] as const;
      const postEngagementSatisfaction = occurrenceAt ? satisfactionRatings[number % satisfactionRatings.length] : undefined;
      const postEngagementSatisfactionAt = occurrenceAt ? addMinutes(occurrenceAt, 3 + number % 6) : undefined;

      records.push({
        id: baseId + '-craving', habitId: 'demo-smoking', type: 'craving',
        questionnaireVersion: 1, at: cravingAt, createdAt: cravingAt, localDate, timezone: TIMEZONE,
        episodeId, trigger, intensity, outcome,
        resolvedAt,
        urgeFollowUpDueAt, urgeFollowUpStatus, urgeFollowUpAt,
        postEngagementSatisfaction, postEngagementSatisfactionAt,
        context, automaticThought: thought,
        belief: thought,
        confidence: 35 + ((number * 17) % 66),
        reframing: outcome === 'resisted' || number % 2 === 0 ? reframings[(number + dayNumber) % reframings.length] : undefined,
        intensityAfter: outcome === 'resisted' ? Math.max(0, intensity - 2 - (number % 4)) : undefined,
        note: 'Synthetic sample for analytics preview.',
      });

      if (outcome === 'smoked') {
        records.push({
          id: baseId + '-occurrence', habitId: 'demo-smoking', type: 'habit_occurrence',
          at: occurrenceAt!, createdAt: occurrenceAt!, localDate, timezone: TIMEZONE,
          episodeId, trigger, quantity: 1 + ((number * 3 + dayNumber) % 4), context,
          outcome: 'smoked', note: 'Synthetic sample for analytics preview.',
        });
      }

      if (number % 4 !== 0) {
        const technique = techniques[(number + dayNumber) % techniques.length];
        const timing = number % 5 === 0 ? 'preventive' : 'responsive';
        const techniqueAt = timing === 'preventive' ? addMinutes(cravingAt, -8) : addMinutes(cravingAt, 2 + number % 5);
        records.push({
          id: baseId + '-technique-1', habitId: 'demo-smoking', type: 'technique_applied',
          at: techniqueAt, createdAt: techniqueAt, localDate, timezone: TIMEZONE,
          episodeId, trigger, intensity, technique: technique.name, techniqueId: technique.id,
          law: technique.law, laws: technique.laws, timing, context,
          note: 'Synthetic sample for analytics preview.',
        });
        if (number % 9 === 0) {
          const secondTechnique = techniques[(number + dayNumber + 1) % techniques.length];
          const secondAt = addMinutes(cravingAt, timing === 'preventive' ? -4 : 5 + number % 4);
          records.push({
            id: baseId + '-technique-2', habitId: 'demo-smoking', type: 'technique_applied',
            at: secondAt, createdAt: secondAt, localDate, timezone: TIMEZONE,
            episodeId, trigger, intensity, technique: secondTechnique.name, techniqueId: secondTechnique.id,
            law: secondTechnique.law, laws: secondTechnique.laws, timing, context,
            note: 'Synthetic sample for analytics preview.',
          });
        }
      }
    }
  }

  return records.sort((left, right) => right.at.localeCompare(left.at));
}

export function createSampleSmokingConfirmations(logs: BehaviorLog[]): DailyConfirmation[] {
  const dates = [...new Set(logs.filter(log => log.type === 'craving').map(behaviorDayKey))].sort();
  return dates.map(date => ({
    habitId: 'demo-smoking',
    date,
    status: logs.some(log => log.habitId === 'demo-smoking' && log.type === 'habit_occurrence' && behaviorDayKey(log) === date)
      ? 'occurred_recorded'
      : 'no_occurrence',
    updatedAt: newYorkTimestamp(date, 22, 0),
  }));
}
