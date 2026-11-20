'use client';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { buildStrategyGap, buildSuggestedExperiment, buildTechniquePracticeStats, mostCommonTrigger, mostPracticedTechnique, summarizeCuePatterns, summarizeUrgeCheckIns } from './insights';
import { isPeriodOccurrenceCoverageComplete } from './period-checkin';
import { PeriodCheckin } from './period-checkin-view';
import notebookLMContent from './notebooklm-content.json';
import { lawGroups, techniques, techniqueMap } from './techniques';
import { createSuggestedLevels, newRecordId as newDifficultyLevelId, orderedLevels, snapshotForLevel, suggestedLevelNames } from './difficulty-levels';
import type { DifficultyLevel } from './difficulty-levels';
import type { ChangeMode, Law } from './techniques';
import { applyBehaviorLogChanges, behaviorDayKey, dateKeyInZone, episodeKey, episodeResolvedOutcome, isRecoveryPrincipleApplication, legacyHabitEventsToBehaviorLogs, localDateKeys, metadataForEditedTimestamp, minutesToCravingResolution, outcomeForCraving, prepareBehavioralWorkspaceImport, recordPostEngagementSatisfaction, recordUrgeFollowUp, removeBehaviorLogRecord, resolvedEpisodeOutcome, summarizeDay, trackerDayKey, withoutSampleBehaviorLogs } from './behavioral-logging';
import type { BehaviorLog, BehaviorType, DailyConfirmation, DailyConfirmationStatus, PostEngagementSatisfaction, UrgeFollowUpStatus } from './behavioral-logging';

type CueType = 'TIME_LOCATION' | 'STACK';
type ReplacementMode = 'STACK' | 'OPTIONS' | 'BOTH';
type BreakPlanAnswers = {
  cueTriggers: string[];
  cueTimes: string[];
  cueLocations: string[];
  cuesToHide: string[];
  underlyingNeeds: string[];
  reframes: string[];
  frictionIdeas: string[];
  oldPayoffs: string[];
  agreements: string[];
  customCue: string[];
  customCraving: string[];
  customResponse: string[];
  customReward: string[];
};
type LawAnswerTab = 'GUIDED' | 'CUSTOM';
type HabitLaw = 'cue' | 'craving' | 'response' | 'reward';
type CustomLawAnswerKey = 'customCue' | 'customCraving' | 'customResponse' | 'customReward';
const customLawAnswerKeys: Record<HabitLaw, CustomLawAnswerKey> = {
  cue: 'customCue', craving: 'customCraving', response: 'customResponse', reward: 'customReward',
};
const defaultLawAnswerTabs: Record<HabitLaw, LawAnswerTab> = {
  cue: 'GUIDED', craving: 'GUIDED', response: 'GUIDED', reward: 'GUIDED',
};
type Habit = {
  id: string; name: string; target: string; gateway: string; cueType: CueType;
  gatewayMinutes: number;
  cue: string; time?: string; location?: string; motive: string; reward: string;
  prep: string; completed: boolean; missedYesterday: boolean; streak: number;
  dailyTarget?: number; completionCount?: number;
  dailySteps?: DailyStep[]; completedDailySteps?: string[];
  kind: 'BUILD' | 'BREAK'; hideCue?: string; friction?: string; contract?: string; aversionReminder?: string; frictionVotes?: number; rewardBundle?: string;
  alternativeRoutine?: string; replacementActions?: string[]; replacementOptions?: string[]; replacementMode?: ReplacementMode; breakPlanAnswers?: Partial<BreakPlanAnswers>;
  ritual?: string; milestones?: string[]; milestoneIndex?: number; accountabilityPartner?: string; accountabilityEmail?: string; accountabilityCost?: string; inviteLink?: string;
  difficultyLevels?: DifficultyLevel[]; activeDifficultyLevelId?: string;
  techniqueIds?: string[]; techniqueNotes?: Record<string, string>; baselineDaily?: number;
};
type DailyStep = { id: string; label: string };
type PendingHabitDeletion = { id: string; habit: Habit; restoreBeforeId?: string; serverBacked: boolean };
type HabitEvent = { id: string; habitId: string; type: 'ACTION_COMPLETED' | 'URGE_PASSED' | 'REPLACEMENT_USED' | 'OLD_HABIT'; at: string; note?: string; actualMinutes?: number; strategy?: string; variationId?: string; variationName?: string; dailySlotId?: string };
type HabitVariation = { id: string; habitId: string; law: Law; name: string; techniqueId?: string; setup: string; isActive: boolean; triedAt?: string; helped?: boolean | null; outcomeNote?: string; createdAt: string };
type ScorecardEntry = { id: string; behavior: string; rating: '+' | '-' | '=' };
type Diagnostic = { id: string; routine: string; craving: string; rewardExperiment: string; cueTime: string; cueLocation: string; cueEmotion: string; cuePeople: string; plan: string };
type Circle = { id: string; name: string; category: string; members: number; detail: string };
type Reward = { id: string; name: string; habitId: string; detail: string };
type Tab = 'Today' | 'Logging' | 'Journal' | 'Tracker' | 'History' | 'My habits' | 'Habit scorecard' | 'Community' | 'Recovery' | 'Reward vault' | 'Habit to break' | 'Playbook' | 'Settings';
type Palette = 'lavender' | 'ocean' | 'rose' | 'amber' | 'sage';
const palettes: { id: Palette; name: string; colors: [string, string, string] }[] = [
  { id: 'lavender', name: 'Lavender', colors: ['#6256c8', '#b8adff', '#efedff'] },
  { id: 'ocean', name: 'Ocean', colors: ['#287c9b', '#77c2d5', '#e3f5f8'] },
  { id: 'rose', name: 'Rose', colors: ['#b65d78', '#ec9cab', '#fff0f2'] },
  { id: 'amber', name: 'Amber', colors: ['#a96b25', '#e3ad62', '#fff3dc'] },
  { id: 'sage', name: 'Sage', colors: ['#527e70', '#91b6a2', '#e6f2eb'] },
];
function makeDailySteps(count: number, existing: DailyStep[] = []): DailyStep[] {
  return Array.from({ length: Math.max(0, Math.min(20, count)) }, (_, index) => existing[index] ?? ({
    id: `daily-step-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    label: `Completion ${index + 1}`,
  }));
}
const bodilyStateOptions = [
  ['tired', 'Tired or short on sleep'],
  ['hungry_thirsty', 'Hungry or thirsty'],
  ['restless', 'Restless or high energy'],
  ['typical', 'Comfortable or typical'],
  ['unsure', 'Not sure'],
] as const;
const accessibilityOptions = [
  ['in_hand', 'In hand or already open'],
  ['nearby', 'Nearby or one step away'],
  ['out_of_reach', 'Out of reach or takes effort'],
  ['not_applicable', 'Not applicable or unsure'],
] as const;
const motiveOptions = [
  ['relief', 'Relief from stress or anxiety'],
  ['distraction', 'Distraction or a mental break'],
  ['stimulation', 'Stimulation or energy'],
  ['connection', 'Connection or belonging'],
  ['comfort', 'Physical pleasure or comfort'],
  ['something_else', 'Something else'],
  ['unsure', 'Not sure'],
] as const;

const STORAGE = 'habitly-workspace-v2';
const RECOVERY_STORAGE = 'habitly-workspace-before-account-sync-v1';
const REFRESH_VIEW_STORAGE = 'habitly-refresh-view-v1';
function preserveLocalWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return;
    const data = JSON.parse(raw);
    const logs = data.behaviorLogs ?? [];
    const hasLocalData = logs.some((log: BehaviorLog) => !log.id.startsWith('sample-log-'))
      || (data.habitEvents ?? []).length > 0
      || (data.dailyConfirmations ?? []).length > 0
      || (data.habits ?? []).some((habit: Habit) => !habit.id.startsWith('demo-'))
      || (data.variations ?? []).length > 0
      || (data.customContextTags ?? []).length > 0;
    if (!hasLocalData) return;

    const previous = JSON.parse(localStorage.getItem(RECOVERY_STORAGE) ?? '{}');
    const merged = { ...previous, ...data };
    const mergeById = (before: any[] = [], current: any[] = []) => {
      const rows = new Map<string, any>();
      for (const row of before) if (row?.id) rows.set(row.id, row);
      for (const row of current) if (row?.id) rows.set(row.id, row);
      return [...rows.values()];
    };
    merged.habits = mergeById(previous.habits, data.habits);
    merged.rewards = mergeById(previous.rewards, data.rewards);
    merged.habitEvents = mergeById(previous.habitEvents, data.habitEvents);
    merged.behaviorLogs = mergeById(previous.behaviorLogs, data.behaviorLogs);
    merged.variations = mergeById(previous.variations, data.variations);
    const confirmations = new Map<string, DailyConfirmation>();
    for (const row of previous.dailyConfirmations ?? []) confirmations.set(`${row.habitId}:${row.date}`, row);
    for (const row of data.dailyConfirmations ?? []) confirmations.set(`${row.habitId}:${row.date}`, row);
    merged.dailyConfirmations = [...confirmations.values()];
    merged.customContextTags = [...new Set([...(previous.customContextTags ?? []), ...(data.customContextTags ?? [])])];
    const history = { ...(previous.history ?? {}) } as Record<string, string[]>;
    for (const [day, rows] of Object.entries(data.history ?? {}) as [string, string[]][]) {
      history[day] = [...new Set([...(history[day] ?? []), ...rows])];
    }
    merged.history = history;
    localStorage.setItem(RECOVERY_STORAGE, JSON.stringify(merged));
  } catch { /* Existing local data remains untouched if a recovery copy cannot be created. */ }
}
function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  let token = '';
  try { token = JSON.parse(localStorage.getItem(STORAGE) ?? '{}').remoteToken ?? ''; } catch { /* no saved account */ }
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const report = (message: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('habitly-api-error', { detail: message })); };
  return fetch(input, { ...init, headers }).then(response => {
    if ([401, 403].includes(response.status) || response.status >= 500) report(`API request failed (${response.status}). Your device copy is retained; reconnect before relying on another browser.`);
    return response;
  }).catch(error => { report('The Habitly API is unreachable. Your device copy is retained; reconnect before relying on another browser.'); throw error; });
}
function expandInviteLink(habit: Habit): Habit {
  const normalized = {
    ...habit,
    techniqueIds: [...new Set((habit.techniqueIds ?? []).filter(id => id !== 'never-miss-twice'))],
    techniqueNotes: { ...(habit.techniqueNotes ?? {}) },
  };
  return normalized.inviteLink?.startsWith('/?') && typeof window !== 'undefined'
    ? { ...normalized, inviteLink: `${window.location.origin}${normalized.inviteLink}` }
    : normalized;
}
const demoHabits: Habit[] = [
  { id: 'demo-write', name: 'Write one sentence', target: 'Write for 30 minutes', gateway: 'Open my journal and write one sentence', gatewayMinutes: 2, cueType: 'STACK', cue: 'I pour my first coffee', motive: 'Feel like a writer before the day gets loud', reward: 'A fresh coffee and a clear head', prep: 'Leave journal open on the desk', ritual: 'Play my focus playlist', techniqueIds: ['two-minute-rule', 'motivation-ritual', 'immediate-reinforcement'], techniqueNotes: { 'two-minute-rule': 'One sentence is enough to begin.' }, completed: true, missedYesterday: false, streak: 5, kind: 'BUILD' },
  { id: 'demo-move', name: 'Move my body', target: 'Go for a run', gateway: 'Put on my running shoes', gatewayMinutes: 2, cueType: 'TIME_LOCATION', cue: '7:30 AM', time: '7:30 AM', location: 'By the front door', motive: 'Have more energy for the day', reward: 'Play my favorite playlist', prep: 'Lay out running clothes tonight', completed: false, missedYesterday: true, streak: 3, kind: 'BUILD' },
  { id: 'demo-read', name: 'Read one page', target: 'Read a chapter', gateway: 'Open my book to the bookmark', gatewayMinutes: 2, cueType: 'TIME_LOCATION', cue: '9:00 PM', time: '9:00 PM', location: 'In bed', motive: 'Wind down without a screen', reward: 'A quiet end to the day', prep: 'Put book on my pillow', completed: false, missedYesterday: false, streak: 8, kind: 'BUILD' },
  { id: 'demo-water', name: 'Drink water after waking', target: 'Drink a full glass of water', gateway: 'Fill my water glass', gatewayMinutes: 1, cueType: 'STACK', cue: 'I turn off my alarm', motive: 'Feel clear and energized', reward: 'Enjoy a cold glass with lemon', prep: 'Fill the glass before bed', completed: false, missedYesterday: false, streak: 2, kind: 'BUILD', techniqueIds: ['habit-stacking', 'prime-environment', 'habit-tracking'] },
  { id: 'demo-study', name: 'Practice Spanish', target: 'Practice for 20 minutes', gateway: 'Open my lesson and say one phrase', gatewayMinutes: 2, cueType: 'TIME_LOCATION', cue: '6:30 PM', time: '6:30 PM', location: 'At my kitchen table', motive: 'Connect with my family language', reward: 'Watch one favorite Spanish clip', prep: 'Leave headphones by the table', ritual: 'Make tea before the lesson', completed: false, missedYesterday: false, streak: 4, kind: 'BUILD', techniqueIds: ['stacking-bundling', 'two-minute-rule', 'immediate-reinforcement'] },
  { id: 'demo-scroll', name: 'Late night scrolling', target: 'Stop scrolling in bed', gateway: 'Put my phone on the charger outside the bedroom', gatewayMinutes: 0, cueType: 'TIME_LOCATION', cue: '10:30 PM', time: '10:30 PM', location: 'Bedroom', motive: '', reward: '', prep: '', completed: false, missedYesterday: false, streak: 0, kind: 'BREAK', hideCue: 'Keep the phone out of the bedroom', friction: 'Charge it in the kitchen', contract: 'Notice how much better I sleep', aversionReminder: 'Scrolling steals the rest I need', alternativeRoutine: 'Read one page when I want to reach for my phone', techniqueIds: ['increase-friction', 'activity-zones', 'enjoy-restraint'], techniqueNotes: { 'increase-friction': 'The charger stays outside the bedroom.' } },
  { id: 'demo-snack', name: 'Stress snacking at my desk', target: 'Pause before eating', gateway: 'Take three breaths and make tea', gatewayMinutes: 0, cueType: 'STACK', cue: 'I notice work stress', motive: '', reward: '', prep: '', completed: false, missedYesterday: false, streak: 0, kind: 'BREAK', hideCue: 'Keep snacks in a cupboard, not on my desk', friction: 'Walk to the kitchen before choosing', aversionReminder: 'A short pause helps me check what I need', alternativeRoutine: 'Make tea and step away from the screen', contract: 'Mark each pause on my calendar', techniqueIds: ['increase-friction', 'habit-tracking'] },
];
const demoRewards: Reward[] = [{ id: 'reward-show', name: 'One episode, guilt-free', habitId: 'demo-move', detail: 'Unlocked after you move your body' }];
const tribes = [
  { id: 'morning-movers', name: 'Morning Movers', category: 'Movement', members: 128, detail: 'Make a little movement part of the morning.' },
  { id: 'daily-readers', name: 'The Daily Readers', category: 'Reading', members: 94, detail: 'A page a day, shared with people who love books.' },
  { id: 'makers-hour', name: 'Makers’ Hour', category: 'Creative work', members: 76, detail: 'Show up for one focused creative session.' },
];
const nav: { title: Tab; icon: string }[] = [
  { title: 'Today', icon: 'grid' }, { title: 'Tracker', icon: 'grid' }, { title: 'Journal', icon: 'spark' }, { title: 'History', icon: 'clock' }, { title: 'My habits', icon: 'leaf' },
  { title: 'Habit to break', icon: 'spark' }, { title: 'Recovery', icon: 'heart' }, { title: 'Habit scorecard', icon: 'check' },
  { title: 'Reward vault', icon: 'lock' }, { title: 'Community', icon: 'heart' },
  { title: 'Playbook', icon: 'spark' }, { title: 'Settings', icon: 'heart' },
];

function todayKey() { return trackerDayKey(); }
function weekDays() {
  const trackerDate = new Date(`${todayKey()}T12:00:00`); const day = (trackerDate.getDay() + 6) % 7; const start = new Date(trackerDate); start.setDate(trackerDate.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); const date = todayKeyFromDate(d); return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), day: d.getDate(), today: date === todayKey(), date }; });
}
function todayKeyFromDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function newRecordId(prefix: string) { return `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
function splitTags(value: string) { return [...new Set(value.split(',').map(tag => tag.trim()).filter(Boolean))]; }
function isSmokingHabit(habit: Habit) { return /smok|cigarette|tobacco/i.test(`${habit.name} ${habit.target}`); }
function createEmptyBreakPlanAnswers(): BreakPlanAnswers {
  return { cueTriggers: [''], cueTimes: [''], cueLocations: [''], cuesToHide: [''], underlyingNeeds: [''], reframes: [''], frictionIdeas: [''], oldPayoffs: [''], agreements: [''], customCue: [''], customCraving: [''], customResponse: [''], customReward: [''] };
}
function getReplacementActions(habit: Habit) {
  if (habit.replacementMode === 'OPTIONS') return [];
  const saved = habit.replacementActions?.map(action => action.trim()).filter(Boolean) ?? [];
  if (saved.length) return saved;
  const fallback = habit.alternativeRoutine?.trim() || habit.gateway?.trim();
  return fallback ? [fallback] : [];
}
function getReplacementOptions(habit: Habit) {
  if (habit.replacementMode === 'STACK') return [];
  const saved = habit.replacementOptions?.map(action => action.trim()).filter(Boolean) ?? [];
  if (saved.length) return saved;
  const fallback = habit.alternativeRoutine?.trim() || habit.gateway?.trim();
  return habit.replacementMode === 'OPTIONS' && fallback ? [fallback] : [];
}
function getBreakPlanAnswers(habit: Habit): BreakPlanAnswers {
  const saved = habit.breakPlanAnswers ?? {};
  const withFallback = (key: keyof BreakPlanAnswers, fallback: string) => {
    const values = saved[key];
    return Array.isArray(values) && values.some(value => value.trim()) ? values : [fallback];
  };
  return {
    cueTriggers: withFallback('cueTriggers', habit.cueType === 'STACK' ? habit.cue ?? '' : ''),
    cueTimes: withFallback('cueTimes', habit.cueType === 'TIME_LOCATION' ? habit.time || habit.cue || '' : ''),
    cueLocations: withFallback('cueLocations', habit.cueType === 'TIME_LOCATION' ? habit.location ?? '' : ''),
    cuesToHide: withFallback('cuesToHide', habit.hideCue ?? ''),
    underlyingNeeds: withFallback('underlyingNeeds', habit.motive ?? ''),
    reframes: withFallback('reframes', habit.aversionReminder ?? ''),
    frictionIdeas: withFallback('frictionIdeas', habit.friction ?? ''),
    oldPayoffs: withFallback('oldPayoffs', habit.reward ?? ''),
    agreements: withFallback('agreements', habit.contract ?? ''),
    customCue: withFallback('customCue', ''),
    customCraving: withFallback('customCraving', ''),
    customResponse: withFallback('customResponse', ''),
    customReward: withFallback('customReward', ''),
  };
}
function occurrenceActionLabel(habit: Habit) {
  if (isSmokingHabit(habit)) return 'I Smoked';
  const name = habit.name.trim();
  if (/^i\s/i.test(name)) return name;
  if (/scroll/i.test(name)) return 'I Scrolled';
  if (/snack|eat/i.test(name)) return 'I Ate';
  if (/vape/i.test(name)) return 'I Vaped';
  return `I engaged in ${name.toLowerCase()}`;
}
function dayOffsetKey(offset: number) { const d = new Date(`${todayKey()}T12:00:00`); d.setDate(d.getDate() + offset); return todayKeyFromDate(d); }
function getResilientStreak(history: Record<string, string[]>, habitId: string) {
  const today = new Date(`${todayKey()}T12:00:00`);
  let cursor = new Date(today);
  const todays = history[todayKeyFromDate(today)] ?? [];
  if (!todays.includes(habitId) && !todays.includes(`missed:${habitId}`)) cursor.setDate(cursor.getDate() - 1);
  let count = 0; let completedDays = 0; let previousWasMissed = false; let graceUsed = false;
  for (let i = 0; i < 366; i++) {
    const key = todayKeyFromDate(cursor); const statuses = history[key] ?? [];
    if (statuses.includes(habitId)) { count++; completedDays++; previousWasMissed = false; }
    else if (statuses.includes(`missed:${habitId}`)) { if (previousWasMissed) return { count: completedDays, warning: false, broken: completedDays === 0, hasHistory: true }; graceUsed = true; previousWasMissed = true; count++; }
    else break;
    cursor.setDate(cursor.getDate() - 1);
  }
  const hasHistory = Object.values(history).some(statuses => statuses.includes(habitId) || statuses.includes(`missed:${habitId}`));
  return { count, warning: graceUsed, broken: false, hasHistory };
}

function MultiAnswerField({ label, helper, values, onChange, optional = false, ordered = false, placeholder = 'Add an answer', addLabel }: {
  label: string; helper?: string; values: string[]; onChange: (values: string[]) => void;
  optional?: boolean; ordered?: boolean; placeholder?: string; addLabel?: string;
}) {
  const rows = values.length ? values : [''];
  const listRef = useRef<HTMLDivElement>(null);
  const rowIdsRef = useRef<string[]>([]);
  const nextRowIdRef = useRef(0);
  const currentRowsRef = useRef(rows);
  const activeDragIdRef = useRef<string | null>(null);
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  currentRowsRef.current = rows;
  while (rowIdsRef.current.length < rows.length) rowIdsRef.current.push(`answer-${nextRowIdRef.current++}`);
  if (rowIdsRef.current.length > rows.length) rowIdsRef.current = rowIdsRef.current.slice(0, rows.length);

  function updateAnswer(index: number, value: string) {
    onChange(rows.map((answer, rowIndex) => rowIndex === index ? value : answer));
  }
  function removeAnswer(index: number) {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    rowIdsRef.current = rowIdsRef.current.filter((_, rowIndex) => rowIndex !== index);
    if (!next.length) rowIdsRef.current = [`answer-${nextRowIdRef.current++}`];
    currentRowsRef.current = next.length ? next : [''];
    onChange(next.length ? next : ['']);
  }
  function moveAnswerTo(index: number, nextIndex: number) {
    const sourceRows = currentRowsRef.current;
    if (index < 0 || nextIndex < 0 || index >= sourceRows.length || nextIndex >= sourceRows.length || index === nextIndex) return;
    const next = [...sourceRows];
    const [answer] = next.splice(index, 1);
    next.splice(nextIndex, 0, answer);
    const nextIds = [...rowIdsRef.current];
    const [rowId] = nextIds.splice(index, 1);
    nextIds.splice(nextIndex, 0, rowId);
    currentRowsRef.current = next;
    rowIdsRef.current = nextIds;
    onChange(next);
  }
  function startAnswerDrag(event: ReactPointerEvent<HTMLButtonElement>, rowId: string) {
    if (rows.length < 2 || event.button !== 0) return;
    event.preventDefault();
    activeDragIdRef.current = rowId;
    setDraggedRowId(rowId);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveAnswerWithPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const activeId = activeDragIdRef.current;
    if (!activeId || !listRef.current) return;
    const fromIndex = rowIdsRef.current.indexOf(activeId);
    const rowElements = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-answer-row]'));
    const targetIndex = rowElements.findIndex(row => {
      const bounds = row.getBoundingClientRect();
      return event.clientY < bounds.top + bounds.height / 2;
    });
    const nextIndex = targetIndex === -1 ? rowIdsRef.current.length - 1 : targetIndex;
    moveAnswerTo(fromIndex, nextIndex);
  }
  function finishAnswerDrag(event?: ReactPointerEvent<HTMLButtonElement>) {
    activeDragIdRef.current = null;
    setDraggedRowId(null);
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function moveAnswerWithKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>, rowId: string) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const index = rowIdsRef.current.indexOf(rowId);
    moveAnswerTo(index, index + (event.key === 'ArrowUp' ? -1 : 1));
  }
  function addAnswer() {
    rowIdsRef.current = [...rowIdsRef.current, `answer-${nextRowIdRef.current++}`];
    const next = [...rows, ''];
    currentRowsRef.current = next;
    onChange(next);
  }
  return <div className="multi-answer-field">
    <div className="multi-answer-heading"><span className="field-label multi-answer-label">{label}</span>{optional && <span className="optional">Optional</span>}</div>
    {helper && <p className="multi-answer-helper">{helper}</p>}
    <div ref={listRef} className={ordered ? 'multi-answer-list multi-answer-list-ordered' : 'multi-answer-list'}>
      {rows.map((answer, index) => {
        const rowId = rowIdsRef.current[index];
        return <div className={`multi-answer-row${draggedRowId === rowId ? ' multi-answer-row-dragging' : ''}`} data-answer-row key={rowId}>
        <span className="multi-answer-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <input value={answer} maxLength={300} required={ordered && index === 0} aria-label={`${label}, ${ordered ? 'step' : 'answer'} ${index + 1}`} placeholder={placeholder} onChange={event => updateAnswer(index, event.target.value)}/>
        {ordered && <button type="button" className="multi-answer-drag-handle" aria-label={`Drag to reorder step ${index + 1}`} aria-roledescription="drag handle" title="Drag to reorder" onPointerDown={event => startAnswerDrag(event, rowId)} onPointerMove={moveAnswerWithPointer} onPointerUp={finishAnswerDrag} onPointerCancel={finishAnswerDrag} onLostPointerCapture={() => { if (activeDragIdRef.current === rowId) finishAnswerDrag(); }} onKeyDown={event => moveAnswerWithKeyboard(event, rowId)}><Icon name="grip" size={18}/></button>}
        <button type="button" className="multi-answer-remove" aria-label={`Remove ${ordered ? 'step' : 'answer'} ${index + 1} from ${label}`} onClick={() => removeAnswer(index)}>×</button>
      </div>;
      })}
    </div>
    <button type="button" className="multi-answer-add" onClick={addAnswer}><span aria-hidden="true">+</span>{addLabel ?? 'Add another answer'}</button>
  </div>;
}
function demoHistory(): Record<string, string[]> {
  const h: Record<string, string[]> = { [todayKey()]: ['demo-write'] };
  const days: [number, string[]][] = [[-6, ['demo-write','demo-move','demo-read']],[-5, ['demo-write','demo-move','demo-read']],[-4, ['demo-write','demo-read']],[-3, ['demo-write','demo-move','demo-read']],[-2, ['demo-write','demo-move','demo-read']],[-1, ['demo-write','demo-read','missed:demo-move']]];
  days.forEach(([offset, ids]) => { h[dayOffsetKey(offset)] = ids; });
  return h;
}
function suggestStarter(action: string) {
  const text = action.toLowerCase();
  if (/run|jog|walk/.test(text)) return 'Put on my running shoes';
  if (/read|book/.test(text)) return 'Open my book to the bookmark';
  if (/write|journal/.test(text)) return 'Open my notebook and write one sentence';
  if (/meditat|breath/.test(text)) return 'Meditate for two minutes';
  if (/workout|gym|exercise|lift/.test(text)) return 'Put on my workout clothes';
  if (/water|drink/.test(text)) return 'Fill one glass of water';
  if (/clean|tidy/.test(text)) return 'Put away one thing';
  if (/study|learn|practice/.test(text)) return 'Open the lesson and do the first two minutes';
  return `Start ${action.trim() ? `with the first two minutes of ${action.toLowerCase()}` : 'with one tiny step'}`;
}
function reframeGoal(outcome: string) {
  const text = outcome.toLowerCase();
  if (/read|book/.test(text)) return 'The Reader';
  if (/write|story/.test(text)) return 'The Writer';
  if (/weight|run|workout|fit|exercise/.test(text)) return 'The Athlete';
  if (/save|debt|budget|money/.test(text)) return 'The Saver';
  if (/learn|study|skill|course/.test(text)) return 'The Learner';
  if (/meditat|calm|stress/.test(text)) return 'The Grounded One';
  if (/clean|organ|tidy/.test(text)) return 'The Person Who Keeps a Clear Space';
  return '';
}

function techniqueNoteFor(notes: Record<string, string>, id: string, law?: Law) {
  const candidates = [law ? notes[`${law}:${id}`] : undefined, notes[id], ...Object.entries(notes)
    .filter(([key]) => key.endsWith(`:${id}`))
    .map(([, value]) => value)];
  return candidates.find(value => value?.trim()) ?? candidates.find(value => value !== undefined) ?? '';
}

export default function Home() {
  const [active, setActive] = useState<Tab>('Today');
  const [habits, setHabits] = useState<Habit[]>(demoHabits);
  const [habitOrder, setHabitOrder] = useState<string[]>([]);
  const [homepageOrder, setHomepageOrder] = useState<string[]>([]);
  const [reorderingHabits, setReorderingHabits] = useState(false);
  const [dragState, setDragState] = useState<{ id: string; offset: number; target: number } | null>(null);
  const dragStart = useRef<{ id: string; y: number; target: number } | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardEntry[]>([]);
  const [scorecardDraft, setScorecardDraft] = useState('');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [diagnosticStep, setDiagnosticStep] = useState(0);
  const [diagnosticDraft, setDiagnosticDraft] = useState<Diagnostic>({ id: '', routine: '', craving: '', rewardExperiment: '', cueTime: '', cueLocation: '', cueEmotion: '', cuePeople: '', plan: '' });
  const [joinedTribes, setJoinedTribes] = useState<string[]>([]);
  const [communityCircles, setCommunityCircles] = useState<Circle[]>(tribes.map(t => ({ id: t.id, name: t.name, category: t.category, members: t.members, detail: t.detail })));
  const [circleName, setCircleName] = useState('');
  const [circleIdentity, setCircleIdentity] = useState('');
  const [circleDescription, setCircleDescription] = useState('');
  const [accountabilityInvite, setAccountabilityInvite] = useState<any>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [labs, setLabs] = useState(false);
  const [rewards, setRewards] = useState<Reward[]>(demoRewards);
  const [identity, setIdentity] = useState('The Writer');
  const [goal, setGoal] = useState('Write a book');
  const [votes, setVotes] = useState(45);
  const [prepped, setPrepped] = useState(false);
  const [preppedHabits, setPreppedHabits] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const historyRef = useRef(history);
  historyRef.current = history;
  const trackerDayRef = useRef(todayKey());
  const [difficultyHistory, setDifficultyHistory] = useState<Record<string, Record<string, { level_number: number; name?: string; activity: string; target?: string; criteria?: string; id: string }>>>({});
  const [habitEvents, setHabitEvents] = useState<HabitEvent[]>([]);
  const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>([]);
  const [quickCueCaptureLogId, setQuickCueCaptureLogId] = useState('');
  const [cueLocation, setCueLocation] = useState('');
  const [cueEmotion, setCueEmotion] = useState('');
  const [cuePeople, setCuePeople] = useState('');
  const [cuePrecedingAction, setCuePrecedingAction] = useState('');
  const [cueBodilyState, setCueBodilyState] = useState('');
  const [cueAccessibility, setCueAccessibility] = useState('');
  const [cueMotives, setCueMotives] = useState<string[]>([]);
  const [logBodilyState, setLogBodilyState] = useState('');
  const [logAccessibility, setLogAccessibility] = useState('');
  const [logMotives, setLogMotives] = useState<string[]>([]);
  const [loggingClock, setLoggingClock] = useState(Date.now());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [loggingHabitId, setLoggingHabitId] = useState('demo-scroll');
  const [loggingView, setLoggingView] = useState<'Log' | 'Insights' | 'History'>('Log');
  const [logType, setLogType] = useState<BehaviorLog['type']>('craving');
  const [logTrigger, setLogTrigger] = useState('');
  const [logReplacement, setLogReplacement] = useState('');
  const [logIntensity, setLogIntensity] = useState('');
  const [logOutcome, setLogOutcome] = useState<BehaviorLog['outcome']>('pending');
  const [logTechnique, setLogTechnique] = useState('');
  const [logTechniqueId, setLogTechniqueId] = useState('');
  const [logVariationId, setLogVariationId] = useState('');
  const [logTiming, setLogTiming] = useState<'preventive' | 'responsive'>('responsive');
  const [logQuantity, setLogQuantity] = useState(1);
  const [logNote, setLogNote] = useState('');
  const [editingLogId, setEditingLogId] = useState('');
  const [logTimestamp, setLogTimestamp] = useState('');
  const [logResolvedTimestamp, setLogResolvedTimestamp] = useState('');
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [logEpisodeId, setLogEpisodeId] = useState('');
  const [logEmotions, setLogEmotions] = useState('');
  const [logEnvironments, setLogEnvironments] = useState('');
  const [logActivities, setLogActivities] = useState('');
  const [logSocial, setLogSocial] = useState('');
  const [logContextTags, setLogContextTags] = useState('');
  const [logAutomaticThought, setLogAutomaticThought] = useState('');
  const [logBelief, setLogBelief] = useState('');
  const [logConfidence, setLogConfidence] = useState('');
  const [logReframing, setLogReframing] = useState('');
  const [logIntensityAfter, setLogIntensityAfter] = useState('');
  const [dailyConfirmations, setDailyConfirmations] = useState<DailyConfirmation[]>([]);
  const [customContextTags, setCustomContextTags] = useState<string[]>([]);
  const [customTagDraft, setCustomTagDraft] = useState('');
  const [insightDays, setInsightDays] = useState<number | '24h' | 'all'>(30);
  const [insightFrom, setInsightFrom] = useState('');
  const [insightTo, setInsightTo] = useState('');
  const [insightLawFilter, setInsightLawFilter] = useState('all');
  const [insightTriggerFilter, setInsightTriggerFilter] = useState('all');
  const [insightIntensityFilter, setInsightIntensityFilter] = useState('all');
  const [insightTimingFilter, setInsightTimingFilter] = useState('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all');
  const [historyTriggerFilter, setHistoryTriggerFilter] = useState('');
  const [historyTechniqueFilter, setHistoryTechniqueFilter] = useState('');
  const [historyLawFilter, setHistoryLawFilter] = useState('all');
  const [historyOutcomeFilter, setHistoryOutcomeFilter] = useState('all');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyLimit, setHistoryLimit] = useState(30);
  const [expandedEpisodes, setExpandedEpisodes] = useState<string[]>([]);
  const [recentSavedLogId, setRecentSavedLogId] = useState('');
  const [strategyFocusId, setStrategyFocusId] = useState('');
  const saveLogLock = useRef(false);
  const [variations, setVariations] = useState<HabitVariation[]>([]);
  const [variationDrafts, setVariationDrafts] = useState<Record<string, { law: Law; name: string; techniqueId: string; setup: string }>>({});
  const [checkinNotes, setCheckinNotes] = useState<Record<string, string>>({});
  const [todayCheckinTab, setTodayCheckinTab] = useState<'BUILD' | 'REPLACEMENT'>('BUILD');
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState('');
  const [toastUndo, setToastUndo] = useState<{ message: string; label: string; onUndo: () => void } | null>(null);
  const [pendingHabitDeletions, setPendingHabitDeletions] = useState<PendingHabitDeletion[]>([]);
  const pendingHabitDeletionsRef = useRef<PendingHabitDeletion[]>([]);
  const pendingHabitDeletionTimers = useRef(new Map<string, number>());
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderReturnTo, setBuilderReturnTo] = useState<Tab>('Today');
  const [infoModal, setInfoModal] = useState<{ type: 'law'; law: Law; mode?: 'BUILD' | 'BREAK' } | { type: 'technique'; id: string; mode?: 'BUILD' | 'BREAK' } | { type: 'suggested'; index: number } | null>(null);
  const [editingHabitId, setEditingHabitId] = useState('');
  const [habitToDelete, setHabitToDelete] = useState<Habit | null>(null);
  const [showIdentity, setShowIdentity] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [habitType, setHabitType] = useState<'BUILD' | 'BREAK'>('BUILD');
  const [cueType, setCueType] = useState<CueType>('TIME_LOCATION');
  const [habitName, setHabitName] = useState('');
  const [targetAction, setTargetAction] = useState('');
  const [dailyTarget, setDailyTarget] = useState('1');
  const [dailySteps, setDailySteps] = useState<DailyStep[]>([]);
  const [dailyStepDragId, setDailyStepDragId] = useState('');
  const [dailyStepDropId, setDailyStepDropId] = useState('');
  const [expandedDailyHabits, setExpandedDailyHabits] = useState<Set<string>>(new Set());
  const [showAllDailySteps, setShowAllDailySteps] = useState<Record<string, boolean>>({});
  const [gatewayAction, setGatewayAction] = useState('');
  const [replacementActions, setReplacementActions] = useState<string[]>([]);
  const [replacementOptions, setReplacementOptions] = useState<string[]>([]);
  const [replacementMode, setReplacementMode] = useState<ReplacementMode>('STACK');
  const [breakPlanAnswers, setBreakPlanAnswers] = useState<BreakPlanAnswers>(createEmptyBreakPlanAnswers);
  const [lawAnswerTabs, setLawAnswerTabs] = useState<Record<HabitLaw, LawAnswerTab>>({ ...defaultLawAnswerTabs });
  const [gatewayMinutes, setGatewayMinutes] = useState(0);
  const [durationDrafts, setDurationDrafts] = useState<Record<string, number>>({});
  const [targetDrafts, setTargetDrafts] = useState<Record<string, number>>({});
  const [cue, setCue] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [motive, setMotive] = useState('');
  const [reward, setReward] = useState('');
  const [prepStep, setPrepStep] = useState('');
  const [bundle, setBundle] = useState('');
  const [hideCue, setHideCue] = useState('');
  const [friction, setFriction] = useState('');
  const [contract, setContract] = useState('');
  const [accountabilityPartner, setAccountabilityPartner] = useState('');
  const [accountabilityCost, setAccountabilityCost] = useState('');
  const [alternativeRoutine, setAlternativeRoutine] = useState('');
  const [aversionReminder, setAversionReminder] = useState('');
  const [accountabilityEmail, setAccountabilityEmail] = useState('');
  const [ritual, setRitual] = useState('');
  const [milestoneDraft, setMilestoneDraft] = useState('');
  const [difficultyEnabled, setDifficultyEnabled] = useState(false);
  const [difficultyLevels, setDifficultyLevels] = useState<DifficultyLevel[]>([]);
  const [activeDifficultyLevelId, setActiveDifficultyLevelId] = useState('');
  const [expandedDifficultyLevelId, setExpandedDifficultyLevelId] = useState('');
  const draggedDifficultyLevelId = useRef('');
  const [techniqueIds, setTechniqueIds] = useState<string[]>([]);
  const [techniqueNotes, setTechniqueNotes] = useState<Record<string, string>>({});
  const [baselineDaily, setBaselineDaily] = useState('');
  const [playbookMode, setPlaybookMode] = useState<ChangeMode>('BUILD');
  const [vaultName, setVaultName] = useState('');
  const [vaultHabit, setVaultHabit] = useState('');
  const [vaultDetail, setVaultDetail] = useState('');
  const [apiUrl, setApiUrl] = useState(process.env.NEXT_PUBLIC_API_URL ?? '');
  const [accountEmail, setAccountEmail] = useState('');
  const [remoteUserId, setRemoteUserId] = useState('');
  const [remoteIdentityId, setRemoteIdentityId] = useState('');
  const [remoteToken, setRemoteToken] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [connectionMode, setConnectionMode] = useState<'create' | 'login'>('create');
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const revisionRef = useRef(0);
  const saveInFlight = useRef(false);
  const queuedWorkspace = useRef<string | null>(null);
  const [serverHasWorkspace, setServerHasWorkspace] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [telegramCommand, setTelegramCommand] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [palette, setPalette] = useState<Palette>('lavender');

  function refreshApp() {
    try {
      sessionStorage.setItem(REFRESH_VIEW_STORAGE, JSON.stringify({
        active,
        loggingView,
        loggingHabitId,
        insightDays,
        insightFrom,
        insightTo,
        insightLawFilter,
        insightTriggerFilter,
        insightIntensityFilter,
        insightTimingFilter,
        historyTypeFilter,
        historyTriggerFilter,
        historyTechniqueFilter,
        historyLawFilter,
        historyOutcomeFilter,
        historyFrom,
        historyTo,
        historyLimit,
        expandedEpisodes,
      }));
    } catch { /* Refresh still works if session storage is unavailable. */ }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.location.reload();
  }

  const modalOpen = !!(habitToDelete || showBuilder || infoModal || diagnosticOpen || showIdentity);
  useEffect(() => {
    if (!modalOpen) return;
    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    const previousOverscroll = root.style.overscrollBehavior;
    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    return () => {
      body.style.overflow = previousBodyOverflow;
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousOverscroll;
    };
  }, [modalOpen]);

  useEffect(() => {
    const updateClock = () => setLoggingClock(Date.now());
    const timer = window.setInterval(updateClock, 15000);
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', updateClock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', updateClock);
      document.removeEventListener('visibilitychange', updateClock);
    };
  }, []);

  useEffect(() => {
    setNotificationsEnabled(typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted');
  }, []);

  useEffect(() => {
    if (!notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const due = behaviorLogs.filter(log => log.type === 'craving' && log.outcome === 'resisted' && log.urgeFollowUpDueAt
      && new Date(log.urgeFollowUpDueAt).getTime() <= loggingClock && !log.urgeFollowUpStatus);
    if (!due.length) return;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem('habitly-urge-reminders-seen-v1') ?? '[]').filter((id: unknown): id is string => typeof id === 'string'); }
    catch { seen = []; }
    const seenIds = new Set(seen);
    let changed = false;
    for (const log of due) {
      if (seenIds.has(log.id)) continue;
      try {
        new Notification('Habitly check-in', { body: 'Did the urge stay gone, or did it linger or return?' });
        seenIds.add(log.id);
        changed = true;
      } catch { /* The in-app check-in remains available if a browser blocks notifications. */ }
    }
    if (changed) {
      try { localStorage.setItem('habitly-urge-reminders-seen-v1', JSON.stringify([...seenIds].slice(-500))); }
      catch { /* The notification may repeat after reload if local storage is unavailable. */ }
    }
  }, [behaviorLogs, loggingClock, notificationsEnabled]);

  useEffect(() => {
    function closeHabitMenus(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      document.querySelectorAll<HTMLDetailsElement>('details.habit-manage-menu[open]').forEach(menu => {
        const clickedMenuControl = menu.contains(target) && !!target.closest('summary, button');
        if (!clickedMenuControl) menu.removeAttribute('open');
      });
    }

    document.addEventListener('pointerdown', closeHabitMenus);
    return () => document.removeEventListener('pointerdown', closeHabitMenus);
  }, []);

  useEffect(() => {
    let hasLocalWorkspace = false;
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        hasLocalWorkspace = true;
        const data = JSON.parse(saved);
        setHabitOrder(Array.isArray(data.habitOrder) ? data.habitOrder : []);
        setHomepageOrder(Array.isArray(data.homepageOrder) ? data.homepageOrder : []);
        const originalHabits: Habit[] = data.habits ?? demoHabits;
        const savedHabits: Habit[] = originalHabits.map(expandInviteLink);
        const savedHistory: Record<string, string[]> = data.history ?? demoHistory();
        if (data.dayKey && data.dayKey !== todayKey()) {
          const missedIds = savedHistory[dayOffsetKey(-1)] ?? [];
          setHabits(savedHabits.map(h => ({ ...h, completed: false, completionCount: 0, missedYesterday: missedIds.includes(`missed:${h.id}`) })));
        } else setHabits(savedHabits);
        const savedBehaviorLogs: BehaviorLog[] = data.behaviorLogs ?? [];
        const loadedBehaviorLogs = withoutSampleBehaviorLogs(savedBehaviorLogs);
        const savedConfirmations: DailyConfirmation[] = data.dailyConfirmations ?? [];
        setHistory(savedHistory); setHabitEvents(data.habitEvents ?? []); setBehaviorLogs(loadedBehaviorLogs); setVariations(data.variations ?? []); setPreppedHabits(data.preppedHabits ?? {}); setRewards(data.rewards ?? demoRewards);
        setDifficultyHistory(data.difficultyHistory ?? {});
        setDailyConfirmations(savedConfirmations); setCustomContextTags(data.customContextTags ?? []);
        setIdentity(data.identity ?? 'The Writer'); setGoal(data.goal ?? 'Write a book');
        setVotes(data.votes ?? 45); setPrepped(data.prepped ?? false);
        setScorecard(data.scorecard ?? []); setJoinedTribes(data.joinedTribes ?? []);
        setDiagnostics(data.diagnostics ?? []);
        if (data.communityCircles) setCommunityCircles(data.communityCircles);
        setDarkMode(data.darkMode ?? true); setLabs(data.labs ?? false);
        if (palettes.some(option => option.id === data.palette)) setPalette(data.palette);
        setApiUrl(data.apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? ''); setAccountEmail(data.accountEmail ?? '');
        setRemoteUserId(data.remoteUserId ?? ''); setRemoteIdentityId(data.remoteIdentityId ?? ''); setTelegramCommand(data.telegramCommand ?? '');
        setRemoteToken(data.remoteToken ?? '');
      }
    } catch { /* Start with the guided sample workspace. */ }
    if (!hasLocalWorkspace) setHistory(demoHistory());
    if (!apiUrl && !process.env.NEXT_PUBLIC_API_URL) setApiUrl(window.location.origin);
    try {
      const savedView = sessionStorage.getItem(REFRESH_VIEW_STORAGE);
      if (savedView) {
        sessionStorage.removeItem(REFRESH_VIEW_STORAGE);
        const view = JSON.parse(savedView) as Record<string, unknown>;
        if (typeof view.active === 'string' && nav.some(item => item.title === view.active)) setActive(view.active as Tab);
        if (view.loggingView === 'Log' || view.loggingView === 'Insights' || view.loggingView === 'History') setLoggingView(view.loggingView);
        if (typeof view.loggingHabitId === 'string') setLoggingHabitId(view.loggingHabitId);
        if (view.insightDays === '24h' || view.insightDays === 'all' || [7, 14, 30, 90].includes(view.insightDays as number)) setInsightDays(view.insightDays as number | '24h' | 'all');
        if (typeof view.insightFrom === 'string') setInsightFrom(view.insightFrom);
        if (typeof view.insightTo === 'string') setInsightTo(view.insightTo);
        if (typeof view.insightLawFilter === 'string') setInsightLawFilter(view.insightLawFilter);
        if (typeof view.insightTriggerFilter === 'string') setInsightTriggerFilter(view.insightTriggerFilter);
        if (typeof view.insightIntensityFilter === 'string') setInsightIntensityFilter(view.insightIntensityFilter);
        if (typeof view.insightTimingFilter === 'string') setInsightTimingFilter(view.insightTimingFilter);
        if (typeof view.historyTypeFilter === 'string') setHistoryTypeFilter(view.historyTypeFilter);
        if (typeof view.historyTriggerFilter === 'string') setHistoryTriggerFilter(view.historyTriggerFilter);
        if (typeof view.historyTechniqueFilter === 'string') setHistoryTechniqueFilter(view.historyTechniqueFilter);
        if (typeof view.historyLawFilter === 'string') setHistoryLawFilter(view.historyLawFilter);
        if (typeof view.historyOutcomeFilter === 'string') setHistoryOutcomeFilter(view.historyOutcomeFilter);
        if (typeof view.historyFrom === 'string') setHistoryFrom(view.historyFrom);
        if (typeof view.historyTo === 'string') setHistoryTo(view.historyTo);
        if (typeof view.historyLimit === 'number' && Number.isFinite(view.historyLimit)) setHistoryLimit(Math.max(30, Math.min(view.historyLimit, 3000)));
        if (Array.isArray(view.expandedEpisodes)) setExpandedEpisodes(view.expandedEpisodes.filter((id): id is string => typeof id === 'string').slice(0, 500));
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
      }
    } catch {
      try { sessionStorage.removeItem(REFRESH_VIEW_STORAGE); } catch { /* Ignore unavailable session storage. */ }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const resetForNewTrackerDay = () => {
      const currentDay = todayKey();
      if (trackerDayRef.current === currentDay) return;
      trackerDayRef.current = currentDay;
      const previousStatuses = historyRef.current[dayOffsetKey(-1)] ?? [];
      setHabits(current => current.map(habit => ({
        ...habit,
        completed: false,
        missedYesterday: previousStatuses.includes(`missed:${habit.id}`),
      })));
    };
    const interval = window.setInterval(resetForNewTrackerDay, 15_000);
    window.addEventListener('focus', resetForNewTrackerDay);
    document.addEventListener('visibilitychange', resetForNewTrackerDay);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', resetForNewTrackerDay);
      document.removeEventListener('visibilitychange', resetForNewTrackerDay);
    };
  }, [hydrated]);

  useEffect(() => {
    if (habits.some(habit => habit.id === loggingHabitId)) return;
    const next = habits.find(habit => habit.kind === 'BREAK') ?? habits[0];
    if (next) setLoggingHabitId(next.id);
  }, [habits, loggingHabitId]);

  useEffect(() => {
    if (!logFormOpen) return;
    const timer = window.setTimeout(() => document.querySelector('.logging-advanced-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
    return () => window.clearTimeout(timer);
  }, [logFormOpen]);

  useEffect(() => {
    if ((active !== 'Habit to break' && active !== 'My habits') || !strategyFocusId) return;
    const target = document.getElementById(strategyFocusId);
    setStrategyFocusId('');
    if (!target) return;
    target.closest('details')?.setAttribute('open', '');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  }, [active, strategyFocusId]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    document.documentElement.dataset.palette = palette;
  }, [darkMode, palette]);

  useEffect(() => {
    const onApiError = (event: Event) => setConnectionError((event as CustomEvent<string>).detail);
    window.addEventListener('habitly-api-error', onApiError);
    return () => window.removeEventListener('habitly-api-error', onApiError);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE, JSON.stringify({ habits, habitOrder, homepageOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, difficultyHistory, habitEvents, behaviorLogs, dailyConfirmations, customContextTags, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, dayKey: todayKey(), apiUrl, accountEmail, remoteUserId, remoteIdentityId, remoteToken, telegramCommand })); } catch { setConnectionError('Browser storage is unavailable. Export your local data before continuing.'); }
  }, [hydrated, habits, habitOrder, homepageOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, difficultyHistory, habitEvents, behaviorLogs, dailyConfirmations, customContextTags, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, apiUrl, accountEmail, remoteUserId, remoteIdentityId, remoteToken, telegramCommand]);

  useEffect(() => {
    if (!hydrated || !workspaceReady || !apiUrl || !remoteToken) return;
    const payload = { habits, habitOrder, homepageOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, difficultyHistory, habitEvents, behaviorLogs, dailyConfirmations, customContextTags, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, telegramCommand, dayKey: todayKey() };
    queuedWorkspace.current = JSON.stringify(payload);
    const timer = window.setTimeout(async () => {
      if (saveInFlight.current) return;
      saveInFlight.current = true;
      try {
        while (queuedWorkspace.current !== null) {
          const snapshot = queuedWorkspace.current;
          queuedWorkspace.current = null;
          const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/workspace`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: JSON.parse(snapshot), expected_revision: revisionRef.current }) });
          if (!response.ok) { if (queuedWorkspace.current === null) queuedWorkspace.current = snapshot; throw new Error(`Server returned ${response.status}`); }
          const saved = await response.json(); revisionRef.current = saved.revision; setWorkspaceRevision(saved.revision);
        }
        setConnectionError('');
      } catch (error) { setConnectionError(error instanceof Error && error.message.includes('409') ? 'Another browser saved newer data. Reconnect to load the server copy before editing here. Your local backup is still available.' : 'Could not save to the server. Your device copy remains available; retry the connection before switching devices.'); }
      finally { saveInFlight.current = false; }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [hydrated, workspaceReady, apiUrl, remoteToken, habits, habitOrder, homepageOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, difficultyHistory, habitEvents, behaviorLogs, dailyConfirmations, customContextTags, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, telegramCommand]);

  useEffect(() => {
    if (!hydrated || !apiUrl || !remoteToken) return;
    const base = apiUrl.replace(/\/$/, '');
    let live = true;
    async function syncFromApi() {
      try {
        const response = await apiFetch(`${base}/api/workspace`);
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const workspace = await response.json();
        const data = workspace.data ?? {};
        if (!live) return;
        const hasData = Object.keys(data).length > 0;
        setServerHasWorkspace(hasData);
        revisionRef.current = workspace.revision ?? 0; setWorkspaceRevision(workspace.revision ?? 0);
        if (hasData) {
          preserveLocalWorkspace();
          // Keep this device's copy visible if the server is missing personal records.
          // Replacing it here would silently hide changes made while sync was unavailable.
          const local = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
          const missing = (key: string, exclude: (row: any) => boolean = () => false) => {
            const serverIds = new Set((data[key] ?? []).map((row: any) => row.id));
            return (local[key] ?? []).some((row: any) => row?.id && !exclude(row) && !serverIds.has(row.id));
          };
          if (missing('habits', row => row.id.startsWith('demo-')) ||
              missing('behaviorLogs', row => row.id.startsWith('sample-log-')) ||
              missing('habitEvents')) {
            setWorkspaceReady(false);
            setConnectionError('This device has records missing from your account. Your device copy is preserved. Save a backup in Settings before reconnecting.');
            return;
          }
          setHabitOrder(Array.isArray(data.habitOrder) ? data.habitOrder : []);
        setHomepageOrder(Array.isArray(data.homepageOrder) ? data.homepageOrder : []);
          setHabits((data.habits ?? []).map(expandInviteLink));
          setRewards((data.rewards ?? []).filter((reward: Reward) => !reward.id.startsWith('reward-show')));
          setIdentity(data.identity ?? 'The Writer'); setGoal(data.goal ?? ''); setVotes(data.votes ?? 0);
          setPrepped(data.prepped ?? false); setPreppedHabits(data.preppedHabits ?? {});
        setHistory(data.history ?? {}); setDifficultyHistory(data.difficultyHistory ?? {}); setHabitEvents(data.habitEvents ?? []); setBehaviorLogs(withoutSampleBehaviorLogs(data.behaviorLogs ?? [])); setDailyConfirmations(data.dailyConfirmations ?? []); setCustomContextTags(data.customContextTags ?? []); setVariations(data.variations ?? []);
          setDifficultyHistory(data.difficultyHistory ?? {});
          setScorecard(data.scorecard ?? []); setJoinedTribes(data.joinedTribes ?? []);
          setCommunityCircles(data.communityCircles ?? []); setDiagnostics(data.diagnostics ?? []);
          setDarkMode(data.darkMode ?? true); if (palettes.some(option => option.id === data.palette)) setPalette(data.palette); setLabs(data.labs ?? false); setTelegramCommand(data.telegramCommand ?? '');
        }
        if (hasData) setWorkspaceReady(true);
        setConnectionError('');
      } catch (error) {
        if (live) setConnectionError(`API connection failed: ${error instanceof Error ? error.message : 'check the API address'}`);
      }
    }
    syncFromApi();
    return () => { live = false; };
  }, [hydrated, apiUrl, remoteIdentityId, remoteToken]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToast(''); setToastUndo(null); }, 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => {
    pendingHabitDeletionTimers.current.forEach(timer => window.clearTimeout(timer));
    pendingHabitDeletionTimers.current.clear();
  }, []);

  useEffect(() => {
    if (!hydrated || !apiUrl) return;
    const base = apiUrl.replace(/\/$/, '');
    if (active === 'Community') {
      const query = remoteIdentityId ? `?identity_id=${encodeURIComponent(remoteIdentityId)}` : '';
      apiFetch(`${base}/api/community/circles${query}`).then(response => response.ok ? response.json() : []).then((rows: any[]) => {
        if (!rows.length) return;
        setCommunityCircles(rows.map(row => ({ id: row.id, name: row.name, category: row.identity, members: Math.max(0, row.member_count - (row.joined ? 1 : 0)), detail: row.description })));
        if (remoteIdentityId) setJoinedTribes(rows.filter(row => row.joined).map(row => row.id));
      }).catch(() => {});
    }
    const token = new URLSearchParams(window.location.search).get('accountability');
    if (token) apiFetch(`${base}/api/accountability-invites/${encodeURIComponent(token)}`).then(response => response.ok ? response.json() : null).then(setAccountabilityInvite).catch(() => {});
  }, [hydrated, apiUrl, remoteIdentityId, active]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); startNewHabit('BUILD'); }
      if (event.key === 'Escape') { setShowBuilder(false); setShowIdentity(false); setMobileNav(false); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const buildHabits = habits.filter(h => h.kind === 'BUILD');
  const breakHabits = habits.filter(h => h.kind === 'BREAK');
  useEffect(() => {
    if (buildHabits.length === 0 && breakHabits.length > 0) setTodayCheckinTab('REPLACEMENT');
  }, [buildHabits.length, breakHabits.length]);
  const orderedIds = homepageOrder.filter(id => habits.some(habit => habit.id === id));
  const todayHabits = [...habits].sort((a, b) => {
    const ai = orderedIds.indexOf(a.id), bi = orderedIds.indexOf(b.id);
    if (ai < 0 && bi < 0) return habits.indexOf(b) - habits.indexOf(a);
    if (ai < 0) return -1;
    if (bi < 0) return 1;
    return ai - bi;
  });
  function moveHabit(from: number, to: number) {
    const next = todayHabits.map(habit => habit.id);
    if (from < 0 || to < 0 || to >= next.length || from === to) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setHomepageOrder(next);
  }
  function dragTarget(y: number) {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.today-order-item:not(.is-dragging)'));
    return items.filter(item => y >= item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2).length;
  }
  const completed = buildHabits.filter(h => h.completed).length;
  const progress = buildHabits.length ? Math.round((completed / buildHabits.length) * 100) : 0;
  const unlockedRewards = useMemo(() => rewards.filter(r => habits.find(h => h.id === r.habitId)?.completed), [rewards, habits]);
  const needRecovery = habits.some(h => h.missedYesterday && !h.completed);
  const currentDate = hydrated ? new Date(`${todayKey()}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Today';

  function save() {
    setToast(remoteToken ? 'Changes are syncing to your Habitly account.' : 'Saved on this device. Connect an account to sync across browsers.');
  }

  async function exportWorkspaceBackup(storageKey = STORAGE, filename = 'habitly-local-backup.json') {
    let json: string;
    try {
      const storedCopy = localStorage.getItem(storageKey);
      if (!storedCopy) {
        setToast('No saved browser copy was found.');
        return;
      }
      const snapshot = JSON.parse(storedCopy);
      delete snapshot.remoteToken;
      json = JSON.stringify(snapshot, null, 2);
    } catch {
      setToast('Could not read this browser’s Habitly data. It has not been changed.');
      return;
    }

    const downloadFile = (file: File) => {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setToast('Backup file created. Keep it before connecting or syncing this browser.');
    };
    const file = new File([json], filename, { type: 'application/json;charset=utf-8' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Habitly backup' });
        setToast('Backup shared. Keep the file in Files or another safe place.');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try { downloadFile(file); }
    catch { setToast('The backup could not be saved. Use your browser share menu to save a copy.'); }
  }

  function restoreLocalWorkspace(backup: any) {
    if (!backup || !Array.isArray(backup.habits) || backup.habits.length === 0 || !backup.habits.every((habit: any) => habit?.id && habit?.name)) {
      throw new Error('This file does not contain a valid Habitly workspace.');
    }
    if (!backup.habits.some((habit: Habit) => !habit.id.startsWith('demo-'))) {
      throw new Error('This backup contains only sample habits. No data was changed.');
    }
    if (remoteToken && !workspaceReady) {
      throw new Error('Wait for your account workspace to load before restoring. No data was changed.');
    }
    preserveLocalWorkspace();
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
    const hasCurrentPersonalHabits = (saved.habits ?? habits).some((habit: Habit) => !habit.id.startsWith('demo-'));
    const uniqueById = <T extends { id: string }>(current: T[] = [], incoming: T[] = []) => {
      const rows = new Map<string, T>();
      for (const row of incoming) if (row?.id) rows.set(row.id, row);
      for (const row of current) if (row?.id) rows.set(row.id, row);
      return [...rows.values()];
    };
    const restoredHabits = uniqueById<Habit>(
      saved.habits ?? habits,
      backup.habits.filter((habit: Habit) => !habit.id.startsWith('demo-')),
    );
    const personalHistoryRows = (rows: string[]) => rows.filter(id => !id.startsWith('demo-') && !id.startsWith('missed:demo-'));
    const mergedHistory: Record<string, string[]> = Object.fromEntries(Object.entries(backup.history ?? {}).map(([day, rows]) => [day, personalHistoryRows(rows as string[])]));
    for (const [day, rows] of Object.entries(saved.history ?? {}) as [string, string[]][]) {
      mergedHistory[day] = [...new Set([...(mergedHistory[day] ?? []), ...rows])];
    }
    const confirmations = new Map<string, DailyConfirmation>();
    for (const row of backup.dailyConfirmations ?? []) confirmations.set(`${row.habitId}:${row.date}`, row);
    for (const row of saved.dailyConfirmations ?? []) confirmations.set(`${row.habitId}:${row.date}`, row);
    const restoredLogs = uniqueById<BehaviorLog>(withoutSampleBehaviorLogs(saved.behaviorLogs ?? behaviorLogs), withoutSampleBehaviorLogs(backup.behaviorLogs ?? []));
    const restoredEvents = uniqueById<HabitEvent>(saved.habitEvents ?? habitEvents, backup.habitEvents ?? []);
    const restoredOrder = [...new Set([...(backup.habitOrder ?? []), ...(saved.habitOrder ?? habitOrder), ...restoredHabits.map((habit: Habit) => habit.id)])].filter(id => restoredHabits.some(habit => habit.id === id));
    const mergedConfirmations = [...confirmations.values()];
    const mergedRewards = uniqueById<Reward>(saved.rewards ?? rewards, backup.rewards ?? []);
    const mergedVariations = uniqueById<HabitVariation>(saved.variations ?? variations, backup.variations ?? []);
    const restoredWorkspace = {
      ...backup,
      ...saved,
      habits: restoredHabits,
      habitOrder: restoredOrder,
      history: mergedHistory,
      behaviorLogs: restoredLogs,
      habitEvents: restoredEvents,
      dailyConfirmations: mergedConfirmations,
      rewards: mergedRewards,
      variations: mergedVariations,
      difficultyHistory: { ...(backup.difficultyHistory ?? {}), ...(saved.difficultyHistory ?? {}) },
      preppedHabits: { ...(backup.preppedHabits ?? {}), ...(saved.preppedHabits ?? {}) },
      customContextTags: [...new Set([...(backup.customContextTags ?? []), ...(saved.customContextTags ?? [])])],
      identity: hasCurrentPersonalHabits ? saved.identity ?? backup.identity ?? identity : backup.identity ?? saved.identity ?? identity,
      goal: hasCurrentPersonalHabits ? saved.goal ?? backup.goal ?? goal : backup.goal ?? saved.goal ?? goal,
      dayKey: backup.dayKey ?? saved.dayKey ?? todayKey(),
    };
    localStorage.setItem(STORAGE, JSON.stringify(restoredWorkspace));

    setHabits(restoredHabits);
    setHabitOrder(restoredOrder);
    setHomepageOrder(Array.isArray(saved.homepageOrder) ? saved.homepageOrder : []);
    setHistory(mergedHistory);
    setBehaviorLogs(restoredLogs);
    setHabitEvents(restoredEvents);
    setDailyConfirmations(mergedConfirmations);
    setRewards(mergedRewards);
    setVariations(mergedVariations);
    setDifficultyHistory(restoredWorkspace.difficultyHistory);
    setPreppedHabits(restoredWorkspace.preppedHabits);
    setCustomContextTags(restoredWorkspace.customContextTags);
    setIdentity(restoredWorkspace.identity);
    setGoal(restoredWorkspace.goal);
    setWorkspaceReady(true);
    setToast(`Recovery file contained ${backup.habits.filter((habit: Habit) => !habit.id.startsWith('demo-')).length} habits and ${withoutSampleBehaviorLogs(backup.behaviorLogs ?? []).length} records. Check your workspace.`);
    return restoredHabits.length;
  }

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    const hash = window.location.hash;
    const rawPrefix = '#habitly-recovery=';
    const gzipPrefix = '#habitly-recovery-gzip=';
    const compressed = hash.startsWith(gzipPrefix);
    if (!compressed && !hash.startsWith(rawPrefix)) return;
    const encoded = hash.slice(compressed ? gzipPrefix.length : rawPrefix.length);
    void (async () => {
      try {
        const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
        const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
        let json: string;
        if (compressed) {
          if (!('DecompressionStream' in window)) throw new Error('This browser cannot open the compressed restore link.');
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
          json = await new Response(stream).text();
        } else json = new TextDecoder().decode(bytes);
        const restored = restoreLocalWorkspace(JSON.parse(json));
        if (!restored) throw new Error('No habits were restored. Your saved data is unchanged.');
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'The recovery link could not be read. Your saved data is unchanged.');
      }
    })();
  }, [hydrated]);

  async function importLocalWorkspace(backup?: any) {
    if (!apiUrl || !remoteToken) return;
    let local: any = {};
    try { local = backup ?? JSON.parse(localStorage.getItem(STORAGE) ?? '{}'); } catch { setConnectionError('Could not read this browser’s saved data. Export it from browser storage before retrying.'); return; }
    preserveLocalWorkspace();
    const sourceLogs: BehaviorLog[] = local.behaviorLogs ?? behaviorLogs;
    const sourceEvents: HabitEvent[] = local.habitEvents ?? habitEvents;
    const sourceHabits: Habit[] = local.habits ?? habits;
    const sourceConfirmations: DailyConfirmation[] = local.dailyConfirmations ?? dailyConfirmations;
    const prepared = prepareBehavioralWorkspaceImport(sourceHabits, sourceLogs, sourceEvents, sourceConfirmations, () => newRecordId('habit'));
    const mappedHabitId = prepared.mapHabitId;
    const importHabits: Habit[] = prepared.habits.map(expandInviteLink);
    const importHabitIds = new Set(importHabits.map(habit => habit.id));
    const mapHistory = (source: Record<string, string[]>): Record<string, string[]> => Object.fromEntries(Object.entries(source).map(([day, rows]) => [day, rows.map(value => {
      const missed = value.startsWith('missed:');
      const sourceId = missed ? value.slice(7) : value;
      const targetId = mappedHabitId(sourceId);
      return importHabitIds.has(targetId) ? `${missed ? 'missed:' : ''}${targetId}` : '';
    }).filter(Boolean)]).filter(([, rows]) => (rows as string[]).length > 0));
    const sourceHistory = local.history ?? history;
    const importedPreppedHabits = Object.fromEntries(Object.entries(local.preppedHabits ?? preppedHabits).flatMap(([id, value]) => {
      const targetId = mappedHabitId(id);
      return importHabitIds.has(targetId) ? [[targetId, value]] : [];
    })) as Record<string, boolean>;
    const importRewards = (local.rewards ?? rewards).filter((reward: Reward) => !reward.id.startsWith('reward-show') && importHabitIds.has(mappedHabitId(reward.habitId))).map((reward: Reward) => ({ ...reward, habitId: mappedHabitId(reward.habitId) }));
    const importVariations = (local.variations ?? variations).filter((variation: HabitVariation) => importHabitIds.has(mappedHabitId(variation.habitId))).map((variation: HabitVariation) => ({ ...variation, habitId: mappedHabitId(variation.habitId) }));
    const importHabitOrder = (local.habitOrder ?? habitOrder).map(mappedHabitId).filter((id: string) => importHabitIds.has(id));
    const payload = { habits: importHabits, habitOrder: importHabitOrder, rewards: importRewards, identity: local.identity ?? identity, goal: local.goal ?? goal, votes: local.votes ?? votes, prepped: local.prepped ?? prepped, preppedHabits: importedPreppedHabits, history: mapHistory(sourceHistory), difficultyHistory: local.difficultyHistory ?? difficultyHistory, habitEvents: prepared.habitEvents, behaviorLogs: prepared.behaviorLogs, dailyConfirmations: prepared.dailyConfirmations, customContextTags: local.customContextTags ?? customContextTags, variations: importVariations, scorecard: local.scorecard ?? scorecard, joinedTribes: local.joinedTribes ?? joinedTribes, communityCircles: local.communityCircles ?? communityCircles, diagnostics: local.diagnostics ?? diagnostics, darkMode: local.darkMode ?? darkMode, palette: local.palette ?? palette, labs: local.labs ?? labs, telegramCommand: local.telegramCommand ?? telegramCommand, dayKey: local.dayKey ?? todayKey() };
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/workspace/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remoteToken}` }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Import failed (${response.status})`);
      const result = await response.json();
      if (!result.imported) throw new Error('Server data already exists. Reload the server copy before importing.');
      const inviteTokens = new Map((result.invites ?? []).map((invite: any) => [invite.habit_id, invite.token]));
      const importedHabits = payload.habits.map((habit: Habit) => { const token = inviteTokens.get(habit.id); return token ? { ...habit, inviteLink: `${window.location.origin}/?accountability=${token}` } : habit; });
      setHabits(importedHabits); setHabitOrder(payload.habitOrder); setHomepageOrder([]); setRewards(payload.rewards); setIdentity(payload.identity); setGoal(payload.goal); setVotes(payload.votes); setPrepped(payload.prepped); setPreppedHabits(payload.preppedHabits); setHistory(payload.history); setDifficultyHistory(payload.difficultyHistory); setHabitEvents(payload.habitEvents); setBehaviorLogs(payload.behaviorLogs); setDailyConfirmations(payload.dailyConfirmations); setCustomContextTags(payload.customContextTags); setVariations(payload.variations); setScorecard(payload.scorecard); setJoinedTribes(payload.joinedTribes); setCommunityCircles(payload.communityCircles); setDiagnostics(payload.diagnostics); setDarkMode(payload.darkMode); if (palettes.some(option => option.id === payload.palette)) setPalette(payload.palette); setLabs(payload.labs); setTelegramCommand(payload.telegramCommand);
      setWorkspaceReady(true); setServerHasWorkspace(true); setConnectionError('');
      revisionRef.current = result.revision ?? 1; setWorkspaceRevision(result.revision ?? 1);
      setToast(`Imported ${result.habits} user habits and ${result.rewards} rewards. This browser’s original copy was kept.`);
    } catch (error) { setConnectionError(`${error instanceof Error ? error.message : 'Import failed'}. Local data is still in this browser. Export it in Settings before clearing site data.`); }
  }

  async function completeHabit(habit: Habit, requestedSlotId?: string) {
    if (habit.completed && (habit.dailyTarget ?? 1) <= 1) return;
    const dailyTarget = Math.max(1, habit.dailyTarget ?? 1);
    const completedDailySteps = habit.completedDailySteps ?? [];
    const slotId = requestedSlotId ?? (habit.dailyTarget && habit.dailyTarget > 1
      ? (habit.dailySteps ?? []).find(step => !completedDailySteps.includes(step.id))?.id
      : undefined);
    if (slotId && completedDailySteps.includes(slotId)) return;
    const completionCount = (habit.completionCount ?? (habit.completed ? 1 : 0)) + 1;
    const targetReached = completionCount >= dailyTarget;
    const localEvent: HabitEvent = { id: `local-${habit.id}-${Date.now()}`, habitId: habit.id, type: 'ACTION_COMPLETED', at: new Date().toISOString(), dailySlotId: slotId };
    let undoEvent = localEvent;
    setHabitEvents(current => [...current, localEvent]);
    setHabits(current => current.map(h => h.id === habit.id ? { ...h, completionCount, completed: targetReached, completedDailySteps: slotId ? [...new Set([...(h.completedDailySteps ?? []), slotId])] : h.completedDailySteps, missedYesterday: targetReached ? false : h.missedYesterday } : h));
    const currentDay = todayKey();
    const nextHistory = { ...history, [currentDay]: [...(history[currentDay] ?? []).filter(x => x !== `missed:${habit.id}` && x !== habit.id), ...(targetReached ? [habit.id] : [])] };
    setHistory(nextHistory);
    const levelSnapshot = targetReached ? snapshotForLevel(habit.difficultyLevels ?? [], habit.activeDifficultyLevelId) : undefined;
    if (levelSnapshot) setDifficultyHistory(current => ({ ...current, [currentDay]: { ...(current[currentDay] ?? {}), [habit.id]: levelSnapshot } }));
    setVotes(current => current + 1);
    setCelebrating(true); window.setTimeout(() => setCelebrating(false), 1150);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(18);
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed_via: 'WEB', daily_slot_id: slotId ?? null }) });
        if (response.ok) {
          const result = await response.json();
          setVotes(result.identity_votes);
          setHabits(current => current.map(h => h.id === habit.id ? { ...h, completionCount: result.completion_count, completed: result.target_reached, completedDailySteps: result.event?.dailySlotId ? [...new Set([...(h.completedDailySteps ?? []), result.event.dailySlotId])] : h.completedDailySteps, missedYesterday: result.target_reached ? false : h.missedYesterday } : h));
          undoEvent = result.event as HabitEvent;
          setHabitEvents(current => [...current.filter(event => event.id !== localEvent.id), undoEvent]);
          if (result.target_reached) setHistory(current => ({ ...current, [currentDay]: [...(current[currentDay] ?? []).filter(x => x !== `missed:${habit.id}` && x !== habit.id), habit.id] }));
          const message = `${result.completion_count} of ${result.daily_target} today${result.target_reached ? ' · Daily target reached' : ''}`;
          setToast(message);
          setToastUndo({ message, label: 'Undo', onUndo: () => void undoHabitOccurrence(habit, undoEvent, false) });
          return;
        }
      } catch { /* Local log remains available while the API is offline. */ }
      const message = 'Saved here. API sync will resume when connected.';
      setToast(message);
      setToastUndo({ message, label: 'Undo', onUndo: () => void undoHabitOccurrence(habit, undoEvent, false) });
      return;
    }
    const updatedStreak = getResilientStreak(nextHistory, habit.id).count;
    const message = `${completionCount} of ${dailyTarget} today${targetReached ? ` · ${updatedStreak}-day chain` : ''}`;
    setToast(message);
    setToastUndo({ message, label: 'Undo', onUndo: () => void undoHabitOccurrence(habit, undoEvent, false) });
  }

  async function undoHabitOccurrence(habit: Habit, event: HabitEvent, confirmUndo = true) {
    if (confirmUndo && !window.confirm(`Undo “${(habit.dailySteps ?? []).find(step => step.id === event.dailySlotId)?.label ?? 'this completion'}”?`)) return;
    const eventDate = new Date(event.at);
    const isToday = trackerDayKey(eventDate) === todayKey();
    setHabitEvents(current => current.filter(item => item.id !== event.id));
    setHabits(current => current.map(item => item.id === habit.id ? {
      ...item,
      completionCount: Math.max(0, (item.completionCount ?? 0) - (isToday ? 1 : 0)),
      completedDailySteps: (item.completedDailySteps ?? []).filter(id => id !== event.dailySlotId),
      completed: isToday ? Math.max(0, (item.completionCount ?? 0) - 1) >= (item.dailyTarget ?? 1) : item.completed,
    } : item));
    setVotes(current => Math.max(0, current - 1));
    if (isToday) {
      const stillComplete = Math.max(0, (habit.completionCount ?? 0) - 1) >= (habit.dailyTarget ?? 1);
      setHistory(current => ({ ...current, [todayKey()]: stillComplete
        ? [...new Set([...(current[todayKey()] ?? []).filter(id => id !== `missed:${habit.id}`), habit.id])]
        : (current[todayKey()] ?? []).filter(id => id !== habit.id) }));
    }
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-') && !event.id.startsWith('local-')) {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}/completions/${event.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Undo failed');
        const result = await response.json();
        setVotes(result.identity_votes ?? Math.max(0, votes - 1));
        setHabits(current => current.map(item => item.id === habit.id ? { ...item, completionCount: result.completion_count, completed: result.target_reached, completedDailySteps: (item.completedDailySteps ?? []).filter(id => id !== event.dailySlotId) } : item));
      } catch { setToast('Undo saved here. API sync will resume when connected.'); return; }
    }
    setToast('Completion undone.');
    setToastUndo(null);
  }

  async function markMissed(habit: Habit) {
    if (habit.completed) return;
    setHabits(current => current.map(h => h.id === habit.id ? { ...h, missedYesterday: true, completed: false } : h));
    setHistory(current => ({ ...current, [todayKey()]: [...(current[todayKey()] ?? []).filter(x => x !== habit.id), `missed:${habit.id}`] }));
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'MISSED', environment_prepped: !!preppedHabits[habit.id] }) }).catch(() => {});
    setToast('A missed day is information, not a verdict. Come back tomorrow.');
  }

  function setHabitPrep(habitId: string, checked: boolean) {
    setPreppedHabits(current => ({ ...current, [habitId]: checked }));
    if (apiUrl && remoteIdentityId && !habitId.startsWith('demo-')) apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habitId}/prep`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ environment_prepped: checked }) }).catch(() => {});
  }

  function recordFriction(habit: Habit) {
    const next = (habit.frictionVotes ?? 0) + 1;
    setHabits(current => current.map(item => item.id === habit.id ? { ...item, frictionVotes: next } : item));
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friction_votes: next }) }).catch(() => {});
    setToast('Friction added. That’s a vote for the change you want.');
  }

  async function recordHabitEvent(habit: Habit, type: HabitEvent['type'], actualMinutes?: number, noteOverride?: string) {
    const activeVariation = variations.find(item => item.habitId === habit.id && item.isActive);
    const activeStrategy = activeVariation ? `${activeVariation.name}: ${activeVariation.setup}` : (habit.techniqueIds ?? []).map(id => techniqueMap[id]?.name).filter(Boolean).join(', ');
    const note = noteOverride?.trim() || checkinNotes[habit.id]?.trim() || undefined;
    const item: HabitEvent = { id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, habitId: habit.id, type, at: new Date().toISOString(), note, actualMinutes, strategy: activeStrategy || undefined, variationId: activeVariation?.id, variationName: activeVariation?.name };
    setHabitEvents(current => [item, ...current]);
    setCheckinNotes(current => ({ ...current, [habit.id]: '' }));
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: type, note, actual_minutes: actualMinutes ?? null, strategy: activeStrategy || null, variation_id: activeVariation?.id ?? null, variation_name: activeVariation?.name ?? null }) });
        if (response.ok) { const saved = await response.json(); setHabitEvents(current => current.map(event => event.id === item.id ? { ...item, id: saved.id, at: saved.occurred_at } : event)); }
      } catch { /* The check-in remains saved on this device. */ }
    }
    const message: Record<HabitEvent['type'], string> = { ACTION_COMPLETED: 'Action logged. Each repeat counts.', URGE_PASSED: 'Urge passed. That choice counts.', REPLACEMENT_USED: 'You used your replacement action. Logged.', OLD_HABIT: 'Logged without judgment. Use this to adjust your plan.' };
    setToast(actualMinutes ? `${actualMinutes} minutes logged for ${habit.name}.` : message[type]);
  }

  function resetBehaviorDraft() {
    setEditingLogId(''); setLogTrigger(''); setLogReplacement(''); setLogIntensity(''); setLogOutcome('pending'); setLogTechnique(''); setLogTechniqueId(''); setLogVariationId(''); setLogTiming('responsive'); setLogQuantity(1); setLogNote(''); setLogTimestamp(''); setLogResolvedTimestamp(''); setLogEpisodeId('');
    setLogEmotions(''); setLogEnvironments(''); setLogActivities(''); setLogSocial(''); setLogContextTags(''); setLogBodilyState(''); setLogAccessibility(''); setLogMotives([]); setLogAutomaticThought(''); setLogBelief(''); setLogConfidence(''); setLogReframing(''); setLogIntensityAfter(''); setLogFormOpen(false);
  }

  function commitBehaviorLog(type: BehaviorType, quick = false): string | undefined {
    if (saveLogLock.current) return undefined;
    saveLogLock.current = true;
    window.setTimeout(() => { saveLogLock.current = false; }, 900);
    const habit = habits.find(item => item.id === loggingHabitId) ?? habits.find(item => item.kind === 'BREAK') ?? demoHabits[0];
    const previous = quick ? undefined : behaviorLogs.find(log => log.id === editingLogId);
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    const localInput = !quick ? logTimestamp : '';
    const occurredAt = localInput ? new Date(localInput) : previous && !quick ? new Date(previous.at) : now;
    if (!Number.isFinite(occurredAt.getTime())) { setToast('That date and time is invalid.'); saveLogLock.current = false; return undefined; }
    const timestamp = occurredAt.toISOString();
    const eventMetadata = metadataForEditedTimestamp(previous && !quick ? previous : undefined, timestamp, timezone);
    const resolvedDate = logResolvedTimestamp ? new Date(logResolvedTimestamp) : undefined;
    if (!quick && type === 'craving' && logOutcome !== 'pending' && logResolvedTimestamp && (!resolvedDate || !Number.isFinite(resolvedDate.getTime()) || resolvedDate < occurredAt)) {
      setToast('Resolution time must be valid and after the craving started.'); saveLogLock.current = false; return undefined;
    }
    const cutoff = now.getTime() - 8 * 60 * 60 * 1000;
    const latestOpenCraving = [...behaviorLogs].filter(log => log.habitId === habit.id && log.type === 'craving' && log.outcome !== 'resisted' && log.outcome !== 'smoked' && new Date(log.at).getTime() >= cutoff).sort((a, b) => b.at.localeCompare(a.at))[0];
    const selectedEpisodeId = !quick && logEpisodeId === '__new__' ? newRecordId('episode') : (!quick ? logEpisodeId : '');
    const episodeId = logEpisodeId === '__new__' && !quick ? selectedEpisodeId : ((!quick && logEpisodeId && logEpisodeId !== previous?.episodeId ? logEpisodeId : '') || previous?.episodeId || (!quick ? logEpisodeId : '') || (previous && type === 'craving' && logOutcome === 'smoked' ? newRecordId('episode') : '') || (type === 'habit_occurrence' || (type === 'technique_applied' && logTiming === 'responsive') ? latestOpenCraving?.episodeId : '') || (previous ? undefined : newRecordId('episode')));
    const existingOccurrence = episodeId ? behaviorLogs.find(log => log.habitId === habit.id && log.episodeId === episodeId && log.type === 'habit_occurrence' && log.id !== previous?.id) : undefined;
    if (type === 'craving' && logOutcome === 'resisted' && existingOccurrence) {
      setToast('This episode has an occurrence recorded. Correct or remove that occurrence before marking the craving resisted.');
      saveLogLock.current = false;
      return undefined;
    }
    const technique = techniques.find(item => item.id === logTechniqueId);
    const variation = variations.find(item => item.id === logVariationId || (item.techniqueId && item.techniqueId === logTechniqueId));
    const tags = {
      emotions: quick ? [] : splitTags(logEmotions),
      environments: quick ? [] : splitTags(logEnvironments),
      activities: quick ? [] : splitTags(logActivities),
      social: quick ? [] : splitTags(logSocial),
      tags: quick ? [] : splitTags(logContextTags),
      bodilyState: quick ? undefined : logBodilyState || undefined,
      accessibility: quick ? undefined : logAccessibility || undefined,
      motives: quick ? [] : logMotives,
    };
    const context = Object.values(tags).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value)) ? tags : undefined;
    const shouldScheduleUrgeFollowUp = !quick && type === 'craving' && logOutcome === 'resisted';
    const followUpDue = shouldScheduleUrgeFollowUp
      ? previous?.urgeFollowUpDueAt ?? new Date((resolvedDate?.getTime() ?? now.getTime()) + 15 * 60 * 1000).toISOString()
      : undefined;
    const item: BehaviorLog = {
      id: previous?.id ?? newRecordId('behavior'), habitId: habit.id, type, questionnaireVersion: 1, at: timestamp, createdAt: previous?.createdAt ?? now.toISOString(),
      localDate: eventMetadata.localDate, timezone: eventMetadata.timezone, episodeId,
      trigger: (quick ? '' : logTrigger.trim()) || (type === 'technique_applied' && logTiming === 'responsive' ? latestOpenCraving?.trigger : undefined) || undefined,
      ...(type === 'craving' || type === 'technique_applied' ? { intensity: !quick && logIntensity !== '' ? Number(logIntensity) : undefined } : {}),
      outcome: type === 'craving' ? (quick ? 'pending' : logOutcome) : undefined,
      replacementAction: type === 'craving' && !quick ? logReplacement.trim() || undefined : undefined,
      resolvedAt: !quick && type === 'craving' && logOutcome !== 'pending' && resolvedDate ? resolvedDate.toISOString() : undefined,
      technique: type === 'technique_applied' ? (variation?.name || technique?.name || logTechnique.trim() || undefined) : undefined,
      techniqueId: type === 'technique_applied' ? (technique?.id || variation?.techniqueId || logTechniqueId || undefined) : undefined,
      law: type === 'technique_applied' ? (variation?.law || technique?.laws[0] || undefined) : undefined,
      laws: type === 'technique_applied' ? (variation ? [variation.law] : technique?.laws) : undefined,
      variationId: type === 'technique_applied' ? (variation?.id || undefined) : undefined,
      timing: type === 'technique_applied' ? logTiming : undefined,
      quantity: type === 'habit_occurrence' ? (quick ? 1 : Math.max(1, Math.min(100, Math.round(Number(logQuantity) || 1)))) : undefined,
      context,
      automaticThought: !quick ? logAutomaticThought.trim() || undefined : undefined,
      belief: !quick ? logBelief.trim() || undefined : undefined,
      confidence: !quick && logConfidence !== '' ? Math.max(0, Math.min(10, Number(logConfidence))) : undefined,
      reframing: !quick ? logReframing.trim() || undefined : undefined,
      intensityAfter: !quick && logIntensityAfter !== '' ? Math.max(0, Math.min(10, Number(logIntensityAfter))) : undefined,
      urgeFollowUpDueAt: type === 'craving' ? followUpDue : undefined,
      urgeFollowUpStatus: type === 'craving' && logOutcome === 'resisted' ? previous?.urgeFollowUpStatus : undefined,
      urgeFollowUpAt: type === 'craving' && logOutcome === 'resisted' ? previous?.urgeFollowUpAt : undefined,
      postEngagementSatisfaction: type === 'craving' && logOutcome === 'smoked' ? previous?.postEngagementSatisfaction : undefined,
      postEngagementSatisfactionAt: type === 'craving' && logOutcome === 'smoked' ? previous?.postEngagementSatisfactionAt : undefined,
      note: !quick ? logNote.trim() || undefined : undefined,
    };
    const changes = [item];
    if (type === 'craving' && logOutcome === 'smoked' && episodeId && !existingOccurrence) {
      const occurrence: BehaviorLog = { id: 'behavior-occurrence-' + episodeId, habitId: habit.id, type: 'habit_occurrence', at: timestamp, createdAt: now.toISOString(), localDate: eventMetadata.localDate, timezone: eventMetadata.timezone, episodeId, quantity: Math.max(1, Math.min(100, Math.round(Number(logQuantity) || 1))), trigger: item.trigger };
      changes.push(occurrence);
    }
    const next = applyBehaviorLogChanges(behaviorLogs, changes);
    setBehaviorLogs(next);
    setRecentSavedLogId(item.id);
    setTimeout(() => setRecentSavedLogId(''), 4500);
    setToast(previous ? 'Entry updated.' : type === 'craving' ? 'Craving saved. You can update its outcome later.' : type === 'habit_occurrence' ? `${habit.name} occurrence saved.` : 'Technique application saved.');
    if (!quick) resetBehaviorDraft();
    return item.id;
  }

  function saveBehaviorLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (logType === 'technique_applied' && !logTechniqueId && !logVariationId && !editingLogId) { setToast('Choose a technique from your strategy first.'); return; }
    if (logType === 'habit_occurrence' && (!Number.isFinite(Number(logQuantity)) || Number(logQuantity) < 1)) { setToast('Enter a quantity of at least one.'); return; }
    commitBehaviorLog(logType);
  }

  function quickLog(type: BehaviorType) {
    setLoggingView('Log');
    setQuickCueCaptureLogId('');
    setCueLocation(''); setCueEmotion(''); setCuePeople(''); setCuePrecedingAction(''); setCueBodilyState(''); setCueAccessibility(''); setCueMotives([]);
    if (type === 'technique_applied') {
      resetBehaviorDraft(); setLogType(type); setLogTiming('responsive'); setLogFormOpen(true);
      document.querySelector('.logging-advanced-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    resetBehaviorDraft();
    const savedId = commitBehaviorLog(type, true);
    if (type === 'craving' && savedId) setQuickCueCaptureLogId(savedId);
  }

  function dismissCueCapture() {
    setQuickCueCaptureLogId('');
    setCueLocation(''); setCueEmotion(''); setCuePeople(''); setCuePrecedingAction(''); setCueBodilyState(''); setCueAccessibility(''); setCueMotives([]);
  }

  function saveCueCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry = behaviorLogs.find(log => log.id === quickCueCaptureLogId && log.type === 'craving');
    if (!entry) { dismissCueCapture(); return; }
    const enteredContext = {
      ...(entry.context ?? {}),
      environments: splitTags(cueLocation),
      emotions: splitTags(cueEmotion),
      social: splitTags(cuePeople),
      activities: splitTags(cuePrecedingAction),
      bodilyState: cueBodilyState || undefined,
      accessibility: cueAccessibility || undefined,
      motives: cueMotives,
    };
    const cleanedContext = Object.fromEntries(Object.entries(enteredContext).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))) as NonNullable<BehaviorLog['context']>;
    const context = Object.keys(cleanedContext).length ? cleanedContext : undefined;
    setBehaviorLogs(current => {
      const currentEntry = current.find(log => log.id === quickCueCaptureLogId && log.type === 'craving');
      return currentEntry ? applyBehaviorLogChanges(current, [{ ...currentEntry, context }]) : current;
    });
    setToast('Cue details saved with this craving.');
    dismissCueCapture();
  }

  function answerUrgeFollowUp(cravingId: string, status: UrgeFollowUpStatus) {
    setBehaviorLogs(current => recordUrgeFollowUp(current, cravingId, status));
    setToast(status === 'skipped' ? 'Follow-up skipped.' : 'Follow-up saved.');
  }

  function answerPostEngagement(cravingId: string, rating: PostEngagementSatisfaction) {
    setBehaviorLogs(current => recordPostEngagementSatisfaction(current, cravingId, rating));
    setToast(rating === 'skipped' ? 'Check-in skipped.' : 'Satisfaction check-in saved.');
  }

  async function enableBrowserReminders() {
    if (!('Notification' in window)) { setToast('This browser does not support desktop reminders. Check-ins will still appear in Habitly.'); return; }
    try {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
      setToast(permission === 'granted' ? 'Browser reminders enabled.' : 'Browser reminders were not enabled. Check-ins will still appear in Habitly.');
    } catch {
      setToast('Browser reminders are unavailable. Check-ins will still appear in Habitly.');
    }
  }

  function editBehaviorLog(log: BehaviorLog) {
    setQuickCueCaptureLogId('');
    setActive('Journal'); setLoggingView('Log'); setLogFormOpen(true); setEditingLogId(log.id); setLogType(log.type); setLogTrigger(log.trigger ?? ''); setLogReplacement(log.replacementAction ?? ''); setLogIntensity(log.intensity === undefined ? '' : String(log.intensity));
    setLogOutcome(log.outcome ?? 'pending'); setLogTechnique(log.technique ?? ''); setLogTechniqueId(log.techniqueId ?? ''); setLogVariationId(log.variationId ?? ''); setLogTiming(log.timing ?? 'responsive');
    setLogQuantity(log.quantity ?? 1); setLogNote(log.note ?? ''); setLogEpisodeId(log.episodeId ?? '');
    setLogEmotions(log.context?.emotions?.join(', ') ?? ''); setLogEnvironments(log.context?.environments?.join(', ') ?? ''); setLogActivities(log.context?.activities?.join(', ') ?? ''); setLogSocial(log.context?.social?.join(', ') ?? ''); setLogContextTags(log.context?.tags?.join(', ') ?? '');
    setLogBodilyState(log.context?.bodilyState ?? ''); setLogAccessibility(log.context?.accessibility ?? ''); setLogMotives(log.context?.motives ?? []);
    setLogAutomaticThought(log.automaticThought ?? ''); setLogBelief(log.belief ?? ''); setLogConfidence(log.confidence === undefined ? '' : String(log.confidence)); setLogReframing(log.reframing ?? ''); setLogIntensityAfter(log.intensityAfter === undefined ? '' : String(log.intensityAfter));
    const localValue = new Date(new Date(log.at).getTime() - new Date(log.at).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setLogTimestamp(localValue);
    setLogResolvedTimestamp(log.resolvedAt ? new Date(new Date(log.resolvedAt).getTime() - new Date(log.resolvedAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
    document.querySelector('.logging-advanced-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openStrategyPage() {
    const destination = habits.find(habit => habit.id === loggingHabitId)?.kind === 'BUILD' ? 'My habits' : 'Habit to break';
    setStrategyFocusId('');
    setActive(destination);
    setMobileNav(false);
  }

  function openTechniqueInStrategy(techniqueId?: string, variationId?: string) {
    const isBuild = habits.find(habit => habit.id === loggingHabitId)?.kind === 'BUILD';
    const destination = isBuild ? 'My habits' : 'Habit to break';
    const targetId = isBuild
      ? variationId ? `build-variation-${variationId}` : techniqueId ? `build-technique-${loggingHabitId}-${techniqueId}` : ''
      : variationId ? `anti-variation-${variationId}` : techniqueId ? `anti-technique-${loggingHabitId}-${techniqueId}` : '';
    if (!targetId) { openStrategyPage(); return; }
    setStrategyFocusId(targetId);
    setActive(destination);
    setMobileNav(false);
  }

  function deleteBehaviorLog(id: string) {
    if (quickCueCaptureLogId === id) dismissCueCapture();
    setBehaviorLogs(removeBehaviorLogRecord(behaviorLogs, id));
    if (editingLogId === id) resetBehaviorDraft();
    setToast('Entry removed.');
  }

  function saveDailyConfirmation(status: DailyConfirmationStatus, date = todayKey()) {
    const item: DailyConfirmation = { habitId: loggingHabitId, date, status, updatedAt: new Date().toISOString() };
    setDailyConfirmations(current => [...current.filter(row => row.habitId !== item.habitId || row.date !== item.date), item]);
    setToast(status === 'skip' ? 'Preference saved. No check in needed.' : 'Daily confirmation saved. You can change it any time.');
  }

  function addCustomContextTag() {
    const value = customTagDraft.trim();
    if (!value) return;
    if (!customContextTags.some(tag => tag.toLowerCase() === value.toLowerCase())) setCustomContextTags(current => [...current, value]);
    setCustomTagDraft('');
  }

  async function updateHabitDuration(habit: Habit, minutes: number) {
    const next = Math.max(1, Math.min(1440, Math.round(minutes)));
    setHabits(current => current.map(item => item.id === habit.id ? { ...item, gatewayMinutes: next } : item));
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gateway_minutes: next }) });
        if (!response.ok) throw new Error('Save failed');
      } catch { setToast(`Target updated here to ${next} minutes. Server sync will resume when connected.`); return; }
    }
    setToast(`Practice target set to ${next} minutes.`);
  }

  async function setHabitDifficultyLevel(habit: Habit, levelId: string) {
    const updated = { ...habit, activeDifficultyLevelId: levelId };
    setHabits(current => current.map(item => item.id === habit.id ? updated : item));
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active_difficulty_level_id: levelId }) });
        if (!response.ok) throw new Error();
      } catch { setToast('Level changed on this device. Reconnect to sync it across devices.'); return; }
    }
    setToast('Current difficulty level updated. Your streak stays the same.');
  }

  function levelUpHabit(habit: Habit) {
    const levels = orderedLevels(habit.difficultyLevels ?? []);
    const currentIndex = levels.findIndex(level => level.id === habit.activeDifficultyLevelId);
    const nextLevel = levels[currentIndex + 1];
    if (nextLevel) void setHabitDifficultyLevel(habit, nextLevel.id);
  }

  function logHabitMinutes(habit: Habit) {
    const minutes = durationDrafts[habit.id] ?? habit.gatewayMinutes;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) { setToast('Enter a session from 1 to 1,440 minutes.'); return; }
    void recordHabitEvent(habit, 'ACTION_COMPLETED', minutes);
  }

  async function createVariation(habit: Habit) {
    const draft = variationDrafts[habit.id] ?? { law: 'response' as Law, name: '', techniqueId: '', setup: '' };
    if (!draft.name.trim() || !draft.setup.trim()) { setToast('Name the variation and describe how you will try it.'); return; }
    const local: HabitVariation = { id: `variation-${Date.now()}`, habitId: habit.id, law: draft.law, name: draft.name.trim(), techniqueId: draft.techniqueId || undefined, setup: draft.setup.trim(), isActive: false, helped: null, createdAt: new Date().toISOString() };
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}/variations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ law: local.law, name: local.name, technique_id: local.techniqueId ?? null, setup: local.setup }) });
        if (!response.ok) throw new Error('API rejected the variation');
        const saved = await response.json(); local.id = saved.id; local.createdAt = saved.created_at;
      } catch { setToast('Variation saved on this device. API sync is unavailable.'); }
    }
    setVariations(current => [local, ...current]);
    setVariationDrafts(current => ({ ...current, [habit.id]: { law: draft.law, name: '', techniqueId: '', setup: '' } }));
    setToast('Variation saved alongside your current plan.');
  }

  async function updateVariation(variation: HabitVariation, changes: Partial<HabitVariation>) {
    const updated = { ...variation, ...changes, ...(changes.isActive ? { triedAt: new Date().toISOString() } : {}) };
    setVariations(current => current.map(item => item.habitId === variation.habitId ? { ...item, ...(changes.isActive ? { isActive: false } : {}), ...(item.id === variation.id ? updated : {}) } : item));
    if (apiUrl && remoteIdentityId && !variation.habitId.startsWith('demo-')) {
      try { await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${variation.habitId}/variations/${variation.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(changes.isActive ? { is_active: true } : {}), ...(changes.helped !== undefined ? { helped: changes.helped } : {}), ...(changes.outcomeNote !== undefined ? { outcome_note: changes.outcomeNote } : {}), ...(changes.name ? { name: changes.name } : {}), ...(changes.setup ? { setup: changes.setup } : {}) }) }); } catch { /* Keep the local experiment record. */ }
    }
  }

  async function removeTechniqueFromPlan(habit: Habit, id: string) {
    const ids = (habit.techniqueIds ?? []).filter(value => value !== id);
    const notes = { ...(habit.techniqueNotes ?? {}) }; delete notes[id];
    setHabits(current => current.map(item => item.id === habit.id ? { ...item, techniqueIds: ids, techniqueNotes: notes } : item));
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ technique_ids: ids, technique_notes: notes }) }).catch(() => {});
    setToast('Strategy removed from the plan.');
  }

  function startNewHabit(mode: ChangeMode) {
    setEditingHabitId(''); setBuilderReturnTo(active); setHabitType(mode); setCueType('STACK'); setReplacementMode('STACK'); setReplacementOptions([]);
    setHabitName(''); setTargetAction(''); setDailyTarget('1'); setDailySteps([]); setGatewayAction(''); setReplacementActions(mode === 'BREAK' ? [''] : []); setBreakPlanAnswers(createEmptyBreakPlanAnswers()); setLawAnswerTabs({ ...defaultLawAnswerTabs }); setGatewayMinutes(0); setCue(''); setTime(''); setLocation(''); setMotive(''); setReward('');
    setPrepStep(''); setBundle(''); setHideCue(''); setFriction(''); setContract(''); setAccountabilityPartner(''); setAccountabilityEmail('');
    setAccountabilityCost(''); setAlternativeRoutine(''); setAversionReminder(''); setRitual(''); setMilestoneDraft(''); setDifficultyEnabled(false); setDifficultyLevels([]); setActiveDifficultyLevelId(''); setExpandedDifficultyLevelId(''); setTechniqueIds([]);
    setTechniqueNotes({}); setBaselineDaily(''); setShowBuilder(true);
  }

  function updateDailyTargetDraft(value: string) {
    setDailyTarget(value);
    const nextTarget = Math.max(1, Math.min(20, Number(value) || 1));
    setDailySteps(current => nextTarget > 1 ? makeDailySteps(nextTarget, current) : []);
  }

  function moveDailyStep(draggedId: string, targetId: string) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    setDailySteps(current => {
      const from = current.findIndex(step => step.id === draggedId);
      const to = current.findIndex(step => step.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item);
      return next;
    });
  }

  function addDailyStep() {
    const target = Number(dailyTarget) || 1;
    if (target >= 20) { setToast('A habit can have up to 20 daily repetitions.'); return; }
    updateDailyTargetDraft(String(target + 1));
  }

  function removeDailyStep(id: string) {
    const step = dailySteps.find(item => item.id === id);
    if (!step || !window.confirm(`Remove “${step.label}” from this daily plan?`)) return;
    const next = dailySteps.filter(item => item.id !== id);
    const target = Math.max(1, next.length);
    setDailyTarget(String(target)); setDailySteps(target > 1 ? next : []);
  }

  function toggleTechnique(id: string) {
    const removing = techniqueIds.includes(id);
    setTechniqueIds(current => removing ? current.filter(item => item !== id) : [...current, id]);
    if (removing) setTechniqueNotes(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id && !key.endsWith(`:${id}`))));
  }

  function updatePendingHabitDeletions(next: PendingHabitDeletion[]) {
    pendingHabitDeletionsRef.current = next;
    setPendingHabitDeletions(next);
  }

  function restorePendingHabitDeletion(deletion: PendingHabitDeletion) {
    setHabits(current => {
      if (current.some(item => item.id === deletion.habit.id)) return current;
      let beforeId = deletion.restoreBeforeId;
      const visited = new Set<string>();
      while (beforeId && !current.some(item => item.id === beforeId) && !visited.has(beforeId)) {
        visited.add(beforeId);
        beforeId = pendingHabitDeletionsRef.current.find(item => item.habit.id === beforeId)?.restoreBeforeId;
      }
      const restored = [...current];
      const beforeIndex = beforeId ? restored.findIndex(item => item.id === beforeId) : -1;
      restored.splice(beforeIndex >= 0 ? beforeIndex : restored.length, 0, deletion.habit);
      return restored;
    });
  }

  function finalizeHabitDeletion(deletionId: string) {
    const deletion = pendingHabitDeletionsRef.current.find(item => item.id === deletionId);
    if (!deletion) return;
    pendingHabitDeletionTimers.current.delete(deletionId);
    updatePendingHabitDeletions(pendingHabitDeletionsRef.current.filter(item => item.id !== deletionId));
  }

  async function deleteHabit(habit: Habit) {
    const serverBacked = workspaceReady && !habit.id.startsWith('demo-');
    if (serverBacked) {
      if (!apiUrl || !remoteIdentityId) {
        setToast('Reconnect your account before deleting this habit.');
        return;
      }
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }) });
        if (!response.ok) throw new Error('Delete failed');
      } catch {
        setToast('Could not delete this habit. It is still active. Please try again.');
        return;
      }
    }
    const habitIndex = habits.findIndex(item => item.id === habit.id);
    const deletion: PendingHabitDeletion = {
      id: `${habit.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      habit,
      restoreBeforeId: habits[habitIndex + 1]?.id,
      serverBacked,
    };
    updatePendingHabitDeletions([...pendingHabitDeletionsRef.current, deletion]);
    setHabits(current => current.filter(item => item.id !== habit.id));
    setHabitToDelete(null);
    setToast('');
    const timer = window.setTimeout(() => void finalizeHabitDeletion(deletion.id), 7000);
    pendingHabitDeletionTimers.current.set(deletion.id, timer);
  }

  async function undoHabitDeletion(deletionId: string) {
    const deletion = pendingHabitDeletionsRef.current.find(item => item.id === deletionId);
    if (!deletion) return;
    if (deletion.serverBacked) {
      if (!apiUrl || !remoteIdentityId) {
        setToast('Reconnect your account before restoring this habit.');
        return;
      }
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${deletion.habit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true }) });
        if (!response.ok) throw new Error('Restore failed');
      } catch {
        setToast('Could not restore this habit. It remains deleted.');
        return;
      }
    }
    const timer = pendingHabitDeletionTimers.current.get(deletionId);
    if (timer !== undefined) window.clearTimeout(timer);
    pendingHabitDeletionTimers.current.delete(deletionId);
    updatePendingHabitDeletions(pendingHabitDeletionsRef.current.filter(item => item.id !== deletionId));
    restorePendingHabitDeletion(deletion);
    setToast('Habit deletion undone.');
  }

  function renderHabitActions(habit: Habit) {
    return <details className="habit-manage-menu"><summary aria-label={`Manage ${habit.name}`} title={`Manage ${habit.name}`}><span aria-hidden="true">⋯</span></summary><div role="group" aria-label={`Manage ${habit.name}`}><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); editHabitPlan(habit); }}>Edit</button><button type="button" className="habit-delete-action" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setHabitToDelete(habit); }}>Delete</button></div></details>;
  }

  function updateBreakAnswer(key: keyof BreakPlanAnswers, values: string[]) {
    setBreakPlanAnswers(current => ({ ...current, [key]: values }));
  }

  function renderLawAnswerTabs(law: HabitLaw, guidedContent: ReactNode) {
    const selectedTab = lawAnswerTabs[law];
    const customKey = customLawAnswerKeys[law];
    return <div className="law-answer-section">
      <div className="law-answer-tabs" role="group" aria-label={`Plan style for ${lawGroups.find(item => item.id === law)?.[habitType === 'BUILD' ? 'build' : 'break'] ?? law}`}>
        <button type="button" className={selectedTab === 'GUIDED' ? 'law-answer-tab-selected' : ''} aria-pressed={selectedTab === 'GUIDED'} onClick={() => setLawAnswerTabs(current => ({ ...current, [law]: 'GUIDED' }))}>Guided prompts</button>
        <button type="button" className={selectedTab === 'CUSTOM' ? 'law-answer-tab-selected' : ''} aria-pressed={selectedTab === 'CUSTOM'} onClick={() => setLawAnswerTabs(current => ({ ...current, [law]: 'CUSTOM' }))}>My own plan</button>
      </div>
      {selectedTab === 'CUSTOM'
        ? <MultiAnswerField label="Your own plan" helper={habitType === 'BREAK' ? 'Write what you will use instead for this part of the old routine. Add as many answers as you need.' : 'Write your own plan for this part of the habit loop. Add as many answers as you need.'} values={breakPlanAnswers[customKey]} onChange={values => updateBreakAnswer(customKey, values)} placeholder="Add your approach" addLabel="Add another answer"/>
        : guidedContent}
    </div>;
  }

  function updateBreakCuePair(index: number, key: 'cueTimes' | 'cueLocations', value: string) {
    setBreakPlanAnswers(current => {
      const next = [...current[key]];
      next[index] = value;
      return { ...current, [key]: next };
    });
  }

  function addBreakCuePair() {
    setBreakPlanAnswers(current => ({ ...current, cueTimes: [...current.cueTimes, ''], cueLocations: [...current.cueLocations, ''] }));
  }

  function removeBreakCuePair(index: number) {
    setBreakPlanAnswers(current => {
      const cueTimes = current.cueTimes.filter((_, rowIndex) => rowIndex !== index);
      const cueLocations = current.cueLocations.filter((_, rowIndex) => rowIndex !== index);
      return { ...current, cueTimes: cueTimes.length ? cueTimes : [''], cueLocations: cueLocations.length ? cueLocations : [''] };
    });
  }

  function editHabitPlan(habit: Habit) {
    const answers = getBreakPlanAnswers(habit);
    const actions = getReplacementActions(habit);
    setEditingHabitId(habit.id);
    setHabitType(habit.kind);
    setHabitName(habit.name);
    setTargetAction(habit.target);
    setDailyTarget(String(habit.dailyTarget ?? 1));
    setDailySteps(habit.kind === 'BUILD' && (habit.dailyTarget ?? 1) > 1 ? makeDailySteps(habit.dailyTarget ?? 1, habit.dailySteps ?? []) : []);
    setGatewayAction(habit.kind === 'BREAK' ? actions[0] ?? '' : habit.gateway ?? '');
    const mode = habit.replacementMode ?? 'STACK';
    setReplacementMode(mode);
    setReplacementActions(habit.kind === 'BREAK' ? mode === 'OPTIONS' ? [''] : actions.length ? actions : [''] : []);
    setReplacementOptions(habit.kind === 'BREAK' ? mode === 'OPTIONS' ? getReplacementOptions(habit) : habit.replacementOptions ?? [] : []);
    setBreakPlanAnswers(answers);
    setLawAnswerTabs({ ...defaultLawAnswerTabs });
    setGatewayMinutes(habit.gatewayMinutes ?? 0);
    setCueType(habit.cueType ?? 'STACK');
    setCue(habit.kind === 'BREAK' ? answers.cueTriggers[0] ?? '' : habit.cueType === 'STACK' ? habit.cue : '');
    const oldTime = habit.time ?? '';
    const parsedTime = oldTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    setTime(habit.kind === 'BREAK' ? answers.cueTimes[0] ?? '' : parsedTime ? `${String((Number(parsedTime[1]) % 12) + (parsedTime[3].toUpperCase() === 'PM' ? 12 : 0)).padStart(2, '0')}:${parsedTime[2]}` : oldTime);
    setLocation(habit.kind === 'BREAK' ? answers.cueLocations[0] ?? '' : habit.location ?? '');
    setMotive(habit.kind === 'BREAK' ? answers.underlyingNeeds[0] ?? '' : habit.motive ?? '');
    setReward(habit.kind === 'BREAK' ? answers.oldPayoffs[0] ?? '' : habit.reward ?? '');
    setPrepStep(habit.prep ?? '');
    setBundle(habit.rewardBundle ?? '');
    setHideCue(habit.kind === 'BREAK' ? answers.cuesToHide[0] ?? '' : habit.hideCue ?? '');
    setFriction(habit.kind === 'BREAK' ? answers.frictionIdeas[0] ?? '' : habit.friction ?? '');
    setContract(habit.kind === 'BREAK' ? answers.agreements[0] ?? '' : habit.contract ?? '');
    setAccountabilityPartner(habit.accountabilityPartner ?? '');
    setAccountabilityEmail(habit.accountabilityEmail ?? '');
    setAccountabilityCost(habit.accountabilityCost ?? '');
    setAlternativeRoutine(habit.alternativeRoutine ?? '');
    setAversionReminder(habit.kind === 'BREAK' ? answers.reframes[0] ?? '' : habit.aversionReminder ?? '');
    setRitual(habit.ritual ?? '');
    setMilestoneDraft((habit.milestones ?? []).slice(1, -1).join('\n'));
    setDifficultyEnabled(!!habit.difficultyLevels?.length);
    setDifficultyLevels(orderedLevels(habit.difficultyLevels ?? []));
    setActiveDifficultyLevelId(habit.activeDifficultyLevelId ?? '');
    setExpandedDifficultyLevelId(habit.difficultyLevels?.[0]?.id ?? '');
    setTechniqueIds(habit.techniqueIds ?? []);
    setTechniqueNotes(habit.techniqueNotes ?? {});
    setBaselineDaily(habit.baselineDaily?.toString() ?? '');
    setBuilderReturnTo(active);
    setShowBuilder(true);
  }

  function renderDifficultyBuilder() {
    function startDifficultySetup() {
      const legacy = (habits.find(habit => habit.id === editingHabitId)?.milestones ?? []).filter(Boolean);
      const levels = legacy.length
        ? orderedLevels(legacy.map((activity, order) => ({ id: newDifficultyLevelId(), order, name: suggestedLevelNames[order] ?? '', activity, target: '', criteria: '' })))
        : createSuggestedLevels();
      setDifficultyLevels(levels);
      const currentIndex = habits.find(habit => habit.id === editingHabitId)?.milestoneIndex ?? 0;
      setActiveDifficultyLevelId(levels[Math.min(currentIndex, levels.length - 1)]?.id ?? '');
      setExpandedDifficultyLevelId(levels[0]?.id ?? '');
      setDifficultyEnabled(true);
    }

    function addDifficultyLevel() {
      const level = { id: newDifficultyLevelId(), order: difficultyLevels.length, name: '', activity: '', target: '', criteria: '' };
      setDifficultyLevels(current => [...current, level]);
      if (!activeDifficultyLevelId) setActiveDifficultyLevelId(level.id);
      setExpandedDifficultyLevelId(level.id);
      requestAnimationFrame(() => {
        document.getElementById(`difficulty-level-${level.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        document.getElementById(`difficulty-level-activity-${level.id}`)?.focus({ preventScroll: true });
      });
    }

    function moveDifficultyLevel(levelId: string, nextIndex: number) {
      const from = difficultyLevels.findIndex(item => item.id === levelId);
      if (from < 0 || nextIndex < 0 || nextIndex >= difficultyLevels.length || from === nextIndex) return;
      const reordered = [...difficultyLevels];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(nextIndex, 0, moved);
      setDifficultyLevels(orderedLevels(reordered));
    }

    function removeDifficultyLevel(levelId: string) {
      if (editingHabitId && !window.confirm('Remove this level? Past completions will keep their saved level details.')) return;
      const remaining = orderedLevels(difficultyLevels.filter(item => item.id !== levelId));
      setDifficultyLevels(remaining);
      if (activeDifficultyLevelId === levelId) setActiveDifficultyLevelId(remaining[0]?.id ?? '');
      if (expandedDifficultyLevelId === levelId) setExpandedDifficultyLevelId(remaining[0]?.id ?? '');
      if (!remaining.length) setDifficultyEnabled(false);
    }

    return <section className={`difficulty-builder ${difficultyEnabled ? 'difficulty-builder-active' : ''}`} aria-labelledby="difficulty-levels-title">
      <div className="difficulty-builder-heading"><div><h4 id="difficulty-levels-title">Difficulty Levels <span className="optional">Optional</span></h4><p>Start small and build your own progression. Add as many levels as you need.</p></div>
        {!difficultyEnabled ? <button type="button" className="difficulty-setup-button" onClick={startDifficultySetup}>Set up levels <span aria-hidden="true">+</span></button> : <div className="difficulty-builder-actions"><button type="button" className="difficulty-add-top" onClick={addDifficultyLevel}><span aria-hidden="true">+</span> Add level</button><button type="button" className="difficulty-disable" onClick={() => { if (window.confirm('Turn off difficulty levels? Past completions will keep their saved level details.')) { setDifficultyEnabled(false); setDifficultyLevels([]); setActiveDifficultyLevelId(''); setExpandedDifficultyLevelId(''); } }}>Turn off</button></div>}
      </div>
      {difficultyEnabled && <><div className="difficulty-level-list">{orderedLevels(difficultyLevels).map((level, index) => <article key={level.id} id={`difficulty-level-${level.id}`} className="difficulty-level-card" draggable onDragStart={() => { draggedDifficultyLevelId.current = level.id; }} onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault();
        const from = difficultyLevels.findIndex(item => item.id === draggedDifficultyLevelId.current);
        const to = difficultyLevels.findIndex(item => item.id === level.id);
        moveDifficultyLevel(draggedDifficultyLevelId.current, to);
        if (from >= 0) draggedDifficultyLevelId.current = '';
        }}><div className="difficulty-level-summary"><span className="difficulty-grip" aria-hidden="true" title="Drag to reorder">⠿</span><button type="button" className="difficulty-level-toggle" aria-expanded={expandedDifficultyLevelId === level.id} onClick={() => setExpandedDifficultyLevelId(current => current === level.id ? '' : level.id)}><span className="difficulty-level-number">LEVEL {index + 1}</span><b>{level.name || suggestedLevelNames[index] || 'Custom level'}</b><small>{level.activity || 'Add an action for this level'}{level.target ? ` · ${level.target}` : ''}</small></button><label className="difficulty-current"><input type="radio" name="active-difficulty-level" checked={activeDifficultyLevelId === level.id} onChange={() => setActiveDifficultyLevelId(level.id)}/><span>{activeDifficultyLevelId === level.id ? 'Starting level' : 'Start here'}</span></label></div>
        {expandedDifficultyLevelId === level.id && <div className="difficulty-level-fields"><div className="difficulty-level-inputs"><label className="field-label">Level name <span className="optional">Optional</span><input value={level.name} maxLength={80} placeholder={suggestedLevelNames[index] ?? 'Custom name'} onChange={event => setDifficultyLevels(current => current.map(item => item.id === level.id ? { ...item, name: event.target.value } : item))}/></label><label className="field-label difficulty-activity-field">Activity or action<input id={`difficulty-level-activity-${level.id}`} value={level.activity} maxLength={300} placeholder={['The smallest version you can do in two minutes', 'A little more than your starting level', 'A meaningful step up in effort', 'A more challenging version', 'Your long-term target'][index] ?? 'Describe what you will do at this level'} onChange={event => setDifficultyLevels(current => current.map(item => item.id === level.id ? { ...item, activity: event.target.value } : item))}/></label><label className="field-label">Measurable target <span className="optional">Optional</span><input value={level.target} maxLength={160} placeholder="5 minutes, 10 pages" onChange={event => setDifficultyLevels(current => current.map(item => item.id === level.id ? { ...item, target: event.target.value } : item))}/></label><label className="field-label">Completion criteria <span className="optional">Optional</span><input value={level.criteria} maxLength={300} placeholder="When is this level complete?" onChange={event => setDifficultyLevels(current => current.map(item => item.id === level.id ? { ...item, criteria: event.target.value } : item))}/></label></div><div className="difficulty-level-footer"><label className="difficulty-position">Move to<select aria-label={`Move Level ${index + 1} to position`} value={index} onChange={event => moveDifficultyLevel(level.id, Number(event.target.value))}>{difficultyLevels.map((_, position) => <option key={position} value={position}>Level {position + 1}</option>)}</select></label><button type="button" className="difficulty-remove" onClick={() => removeDifficultyLevel(level.id)}>Remove level</button></div></div>}</article>)}</div><p className="form-note difficulty-level-note">Fill in the levels you want to keep. You choose the starting level and when to progress.</p></>}
    </section>;
  }

  async function saveLawSection(law: Law) {
    const existing = habits.find(item => item.id === editingHabitId);
    if (!existing) { setToast('Finish the complete plan to save its law sections.'); return; }
    const savedAnswers = Object.fromEntries(Object.entries(breakPlanAnswers).map(([key, values]) => [key, values.map(value => value.trim()).filter(Boolean)])) as BreakPlanAnswers;
    const savedActions = replacementActions.map(action => action.trim()).filter(Boolean);
    const savedOptions = replacementOptions.map(action => action.trim()).filter(Boolean);
    const first = (values: string[]) => values.find(Boolean) ?? '';
    const updated: Habit = { ...existing, name: habitName.trim() || existing.name, target: targetAction.trim() || existing.target, gateway: habitType === 'BREAK' ? first(savedActions) || first(savedOptions) || gatewayAction.trim() : gatewayAction.trim(), replacementActions: habitType === 'BREAK' ? savedActions : [], replacementOptions: habitType === 'BREAK' ? savedOptions : [], replacementMode, breakPlanAnswers: savedAnswers, gatewayMinutes: habitType === 'BUILD' ? Math.max(0, Math.min(1440, gatewayMinutes || 0)) : gatewayMinutes, cueType, cue: cueType === 'STACK' ? habitType === 'BREAK' ? first(savedAnswers.cueTriggers) : cue.trim() : habitType === 'BREAK' ? first(savedAnswers.cueTimes) : time.trim(), time: cueType === 'TIME_LOCATION' ? habitType === 'BREAK' ? first(savedAnswers.cueTimes) : time : undefined, location: cueType === 'TIME_LOCATION' ? habitType === 'BREAK' ? first(savedAnswers.cueLocations) : location : undefined, motive: habitType === 'BREAK' ? first(savedAnswers.underlyingNeeds) : motive.trim(), reward: habitType === 'BREAK' ? first(savedAnswers.oldPayoffs) : reward.trim(), hideCue: habitType === 'BREAK' ? first(savedAnswers.cuesToHide) : hideCue.trim(), friction: habitType === 'BREAK' ? first(savedAnswers.frictionIdeas) : friction.trim(), contract: habitType === 'BREAK' ? first(savedAnswers.agreements) : contract.trim(), alternativeRoutine: habitType === 'BREAK' ? first(savedActions) || first(savedOptions) : gatewayAction.trim() || alternativeRoutine.trim(), aversionReminder: habitType === 'BREAK' ? first(savedAnswers.reframes) : aversionReminder.trim(), techniqueIds: [...techniqueIds], techniqueNotes: { ...techniqueNotes }, prep: prepStep.trim() };
    setHabits(current => current.map(item => item.id === existing.id ? updated : item));
    if (apiUrl && remoteIdentityId && !existing.id.startsWith('demo-')) {
      const payload = { display_name: updated.name, target_action: updated.target, gateway_action: updated.gateway, replacement_actions: updated.replacementActions ?? [], replacement_options: updated.replacementOptions ?? [], replacement_mode: updated.replacementMode ?? 'STACK', break_plan_answers: updated.breakPlanAnswers ?? {}, gateway_minutes: updated.gatewayMinutes, cue_type: updated.cueType, cue_trigger: updated.cue, location: updated.location ?? null, craving_motive: updated.motive, reward_payoff: updated.reward, cue_to_hide: updated.hideCue ?? null, friction_strategy: updated.friction ?? null, habit_contract: updated.contract ?? null, alternative_routine: updated.alternativeRoutine ?? null, aversion_reminder: updated.aversionReminder ?? null, technique_ids: updated.techniqueIds ?? [], technique_notes: updated.techniqueNotes ?? {} };
      try { const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${existing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(); } catch { setToast(`${lawGroups.find(item => item.id === law)?.build ?? 'Law'} saved on this device; API sync is unavailable.`); return; }
    }
    setToast(`${lawGroups.find(item => item.id === law)?.[habitType === 'BUILD' ? 'build' : 'break'] ?? 'Law section'} saved. Keep editing or save the complete plan.`);
  }

  async function createHabit() {
    if (!targetAction.trim()) return;
    const savedReplacementActions = habitType === 'BREAK' ? replacementActions.map(action => action.trim()).filter(Boolean) : [];
    const savedBreakPlanAnswers = Object.fromEntries(Object.entries(breakPlanAnswers).map(([key, values]) => [key, values.map(value => value.trim()).filter(Boolean)])) as BreakPlanAnswers;
    const firstAnswer = (values: string[]) => values.find(Boolean) ?? '';
    const savedReplacementOptions = habitType === 'BREAK' ? replacementOptions.map(action => action.trim()).filter(Boolean) : [];
    if (habitType === 'BREAK' && replacementMode !== 'OPTIONS' && !savedReplacementActions.length) { setToast('Add at least one step to your replacement routine.'); return; }
    if (habitType === 'BREAK' && replacementMode !== 'STACK' && !savedReplacementOptions.length) { setToast('Add at least one alternative replacement habit.'); return; }
    if (habitType === 'BUILD' && cueType === 'TIME_LOCATION' && (!time.trim() || !location.trim())) return;
    if (habitType === 'BUILD' && cueType === 'STACK' && !cue.trim()) return;
    if (habitType === 'BREAK' && !techniqueIds.length) { setToast('Choose at least one strategy from the four anti laws.'); return; }
    const savedGatewayMinutes = habitType === 'BUILD' ? Math.max(0, Math.min(1440, gatewayMinutes || 0)) : gatewayMinutes;
    const existingHabit = habits.find(habit => habit.id === editingHabitId);
    const savedDifficultyLevels = difficultyEnabled
      ? orderedLevels(difficultyLevels.filter(level => level.activity.trim()).map(level => ({ ...level, name: level.name.trim(), activity: level.activity.trim(), target: level.target.trim(), criteria: level.criteria.trim() })))
      : [];
    if (difficultyEnabled && !savedDifficultyLevels.length) { setToast('Add an activity to at least one difficulty level.'); return; }
    const savedActiveDifficultyLevelId = savedDifficultyLevels.some(level => level.id === activeDifficultyLevelId) ? activeDifficultyLevelId : savedDifficultyLevels[0]?.id ?? '';
    const savedHabitName = editingHabitId ? habitName.trim() || existingHabit?.name || targetAction.trim() : targetAction.trim();
    const starterAction = habitType === 'BREAK' ? savedReplacementActions[0] ?? savedReplacementOptions[0] ?? '' : gatewayAction.trim();
    const savedCue = cueType === 'STACK' ? habitType === 'BREAK' ? firstAnswer(savedBreakPlanAnswers.cueTriggers) : cue.trim() : habitType === 'BREAK' ? firstAnswer(savedBreakPlanAnswers.cueTimes) : time.trim();
    const savedLocation = cueType === 'TIME_LOCATION' ? habitType === 'BREAK' ? firstAnswer(savedBreakPlanAnswers.cueLocations) : location.trim() : '';
    const savedMotive = habitType === 'BREAK' ? firstAnswer(savedBreakPlanAnswers.underlyingNeeds) : motive.trim();
    const savedReward = habitType === 'BREAK' ? firstAnswer(savedBreakPlanAnswers.oldPayoffs) : reward.trim();
    const savedHideCue = habitType === 'BREAK' ? firstAnswer(savedBreakPlanAnswers.cuesToHide) : hideCue.trim();
    const savedFriction = habitType === 'BREAK' ? firstAnswer(savedBreakPlanAnswers.frictionIdeas) : friction.trim();
    const savedContract = habitType === 'BREAK' ? firstAnswer(savedBreakPlanAnswers.agreements) : contract.trim();
    const savedReframe = habitType === 'BREAK' ? firstAnswer(savedBreakPlanAnswers.reframes) : aversionReminder.trim();
    let habitId = editingHabitId || `habit-${Date.now()}`;
    let inviteLink = '';
    if (apiUrl && remoteIdentityId && !editingHabitId.startsWith('demo-')) {
      try {
        const payload = { habit_type: habitType, display_name: savedHabitName, target_action: targetAction.trim(), daily_target: habitType === 'BUILD' ? Math.max(1, Math.min(20, Number(dailyTarget) || 1)) : 1, daily_steps: habitType === 'BUILD' && Number(dailyTarget) > 1 ? dailySteps : [], gateway_action: starterAction, replacement_actions: savedReplacementActions, replacement_options: savedReplacementOptions, replacement_mode: replacementMode, break_plan_answers: savedBreakPlanAnswers, gateway_minutes: savedGatewayMinutes, cue_type: cueType, cue_trigger: savedCue, location: savedLocation || null, craving_motive: savedMotive, reward_payoff: savedReward, prep_step: prepStep.trim() || null, reward_bundle: bundle.trim() || null, cue_to_hide: savedHideCue || null, friction_strategy: savedFriction || null, habit_contract: savedContract || null, alternative_routine: habitType === 'BREAK' ? savedReplacementActions[0] ?? savedReplacementOptions[0] : gatewayAction.trim() || alternativeRoutine.trim() || null, aversion_reminder: savedReframe || null, motivation_ritual: ritual.trim() || null, shaping_milestones: habitType === 'BUILD' ? [starterAction, ...milestoneDraft.split('\n').map(item => item.trim()).filter(Boolean), targetAction.trim()].filter((item, i, all) => !!item && all.indexOf(item) === i).join('\n') : null, shaping_current_step: existingHabit?.milestoneIndex ?? 0, difficulty_levels: savedDifficultyLevels, active_difficulty_level_id: savedActiveDifficultyLevelId || null, accountability_partner: accountabilityPartner.trim() || null, accountability_partner_email: accountabilityEmail.trim() || null, accountability_cost: accountabilityCost.trim() || null, technique_ids: techniqueIds, technique_notes: techniqueNotes, baseline_daily: baselineDaily !== '' ? Number(baselineDaily) : null };
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits${editingHabitId ? `/${editingHabitId}` : ''}`, { method: editingHabitId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingHabitId ? payload : { ...payload, identity_id: remoteIdentityId, habit_type: habitType }) });
        if (!response.ok) throw new Error('Unable to save the habit to the server.');
        {
          const created = await response.json(); habitId = created.id;
          if (!editingHabitId && habitType === 'BREAK' && accountabilityEmail.trim()) {
            const invitation = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habitId}/accountability-invites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partner_email: accountabilityEmail.trim(), partner_name: accountabilityPartner.trim() }) });
            if (invitation.ok) { const { token } = await invitation.json(); inviteLink = `${window.location.origin}/?accountability=${token}`; if (navigator.clipboard) await navigator.clipboard.writeText(inviteLink).catch(() => {}); }
          }
        }
      } catch { setToast('Could not save to the server. Your changes are still here; please try again.'); return; }
    }
    const habit: Habit = {
      ...existingHabit,
      id: habitId, name: savedHabitName, target: targetAction.trim(), gateway: starterAction, gatewayMinutes: savedGatewayMinutes,
      dailyTarget: habitType === 'BUILD' ? Math.max(1, Math.min(20, Number(dailyTarget) || 1)) : 1,
      dailySteps: habitType === 'BUILD' && Number(dailyTarget) > 1 ? dailySteps : [], completedDailySteps: existingHabit?.completedDailySteps ?? [],
      cueType, cue: savedCue, time: cueType === 'TIME_LOCATION' ? savedCue : undefined,
      location: cueType === 'TIME_LOCATION' ? savedLocation : undefined, motive: savedMotive, reward: savedReward,
      prep: prepStep.trim(), completed: (existingHabit?.completionCount ?? (existingHabit?.completed ? 1 : 0)) >= (habitType === 'BUILD' ? Math.max(1, Math.min(20, Number(dailyTarget) || 1)) : 1), completionCount: existingHabit?.completionCount ?? (existingHabit?.completed ? 1 : 0), missedYesterday: existingHabit?.missedYesterday ?? false, streak: existingHabit?.streak ?? 0, kind: habitType,
      hideCue: savedHideCue, friction: savedFriction, contract: savedContract, alternativeRoutine: habitType === 'BREAK' ? savedReplacementActions[0] ?? savedReplacementOptions[0] : gatewayAction.trim() || alternativeRoutine.trim(), replacementActions: savedReplacementActions, replacementOptions: savedReplacementOptions, replacementMode, breakPlanAnswers: savedBreakPlanAnswers, aversionReminder: savedReframe, accountabilityEmail: accountabilityEmail.trim(), inviteLink: existingHabit?.inviteLink ?? inviteLink, frictionVotes: existingHabit?.frictionVotes ?? 0, rewardBundle: bundle.trim(),
      ritual: ritual.trim(), milestones: habitType === 'BUILD' ? [starterAction, ...(milestoneDraft.split('\n').map(item => item.trim()).filter(Boolean)), targetAction.trim()].filter((item, i, all) => !!item && all.indexOf(item) === i) : [], milestoneIndex: existingHabit?.milestoneIndex ?? 0,
      accountabilityPartner: accountabilityPartner.trim(), accountabilityCost: accountabilityCost.trim(),
      techniqueIds: [...techniqueIds], techniqueNotes: { ...techniqueNotes }, baselineDaily: baselineDaily !== '' ? Number(baselineDaily) : undefined,
      difficultyLevels: savedDifficultyLevels, activeDifficultyLevelId: savedActiveDifficultyLevelId || undefined,
    };
    setHabits(current => editingHabitId ? current.map(item => item.id === editingHabitId ? habit : item) : [...current, habit]);
    if (!editingHabitId) setHomepageOrder([habitId, ...todayHabits.map(item => item.id).filter(id => id !== habitId)]);
    if (!editingHabitId && habitType === 'BUILD' && bundle.trim()) {
      let rewardId = `reward-${Date.now()}`;
      if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) {
        try { const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/rewards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habit_id: habit.id, name: bundle.trim(), detail: `A little treat after ${habit.name.toLowerCase()}` }) }); if (response.ok) rewardId = (await response.json()).id; } catch { /* Keep reward local if API is unavailable. */ }
      }
      setRewards(current => [...current, { id: rewardId, name: bundle.trim(), habitId: habit.id, detail: `A little treat after ${habit.name.toLowerCase()}` }]);
    }
    setShowBuilder(false); setActive(editingHabitId ? builderReturnTo : 'Today');
    setToast(editingHabitId ? 'Your plan is updated.' : habitType === 'BUILD' ? 'Your new habit plan is ready.' : inviteLink ? 'Change plan saved. Partner link copied.' : 'Your change plan is ready.');
    setHabitName(''); setTargetAction(''); setGatewayAction(''); setReplacementActions([]); setReplacementOptions([]); setReplacementMode('STACK'); setBreakPlanAnswers(createEmptyBreakPlanAnswers()); setLawAnswerTabs({ ...defaultLawAnswerTabs }); setGatewayMinutes(0); setCue(''); setTime(''); setLocation(''); setMotive(''); setReward(''); setPrepStep(''); setBundle(''); setHideCue(''); setFriction(''); setContract(''); setAccountabilityPartner(''); setAccountabilityEmail(''); setAccountabilityCost(''); setAlternativeRoutine(''); setAversionReminder(''); setRitual(''); setMilestoneDraft(''); setTechniqueIds([]); setTechniqueNotes({}); setBaselineDaily(''); setEditingHabitId(''); setHabitType('BUILD'); setCueType('STACK');
  }

  function addScorecardEntry(event: FormEvent) {
    event.preventDefault();
    const behavior = scorecardDraft.trim();
    if (!behavior) return;
    setScorecard(current => [...current, { id: `score-${Date.now()}`, behavior, rating: '=' }]);
    setScorecardDraft('');
  }

  async function saveDiagnostic(event: FormEvent) {
    event.preventDefault();
    const draft = { ...diagnosticDraft, id: `diagnostic-${Date.now()}` };
    if (!draft.routine.trim() || !draft.craving.trim() || !draft.rewardExperiment.trim() || !draft.plan.trim()) return;
    setDiagnostics(current => [draft, ...current]);
    if (apiUrl && remoteIdentityId) {
      try {
        await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/diagnostics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity_id: remoteIdentityId, routine: draft.routine, craving: draft.craving, reward_experiment: draft.rewardExperiment, cue_time: draft.cueTime || null, cue_location: draft.cueLocation || null, cue_emotion: draft.cueEmotion || null, cue_people: draft.cuePeople || null, plan: draft.plan }) });
      } catch { /* The diagnostic is retained in this browser. */ }
    }
    setDiagnosticOpen(false); setDiagnosticStep(0);
    setDiagnosticDraft({ id: '', routine: '', craving: '', rewardExperiment: '', cueTime: '', cueLocation: '', cueEmotion: '', cuePeople: '', plan: '' });
    setToast('Routine diagnostic saved.');
  }

  function rateScorecard(id: string, rating: ScorecardEntry['rating']) {
    setScorecard(current => current.map(entry => entry.id === id ? { ...entry, rating } : entry));
  }

  async function toggleCircle(circle: Circle, joined: boolean) {
    if (apiUrl && remoteIdentityId) {
      const base = apiUrl.replace(/\/$/, '');
      try {
        const response = await apiFetch(`${base}/api/community/circles/${circle.id}/join?identity_id=${encodeURIComponent(remoteIdentityId)}`, { method: joined ? 'DELETE' : 'POST' });
        if (!response.ok) throw new Error('Could not update membership');
      } catch { setToast('Could not sync circle membership. Check your API connection.'); return; }
    }
    setJoinedTribes(current => joined ? current.filter(id => id !== circle.id) : current.includes(circle.id) ? current : [...current, circle.id]);
    setToast(joined ? `Left ${circle.name}.` : `You joined ${circle.name}.`);
  }

  async function createCircle(event: FormEvent) {
    event.preventDefault();
    if (!circleName.trim() || !circleIdentity.trim() || !circleDescription.trim()) return;
    const localCircle: Circle = { id: `circle-${Date.now()}`, name: circleName.trim(), category: circleIdentity.trim(), members: 1, detail: circleDescription.trim() };
    if (apiUrl) {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/community/circles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: localCircle.name, identity: localCircle.category, description: localCircle.detail }) });
        if (response.ok) { const row = await response.json(); localCircle.id = row.id; if (remoteIdentityId) await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/community/circles/${row.id}/join?identity_id=${encodeURIComponent(remoteIdentityId)}`, { method: 'POST' }); }
        else if (response.status !== 409) throw new Error('Could not create circle');
      } catch { setToast('Could not create the circle. Check your API connection.'); return; }
    }
    setCommunityCircles(current => current.some(item => item.name.toLowerCase() === localCircle.name.toLowerCase()) ? current : [...current, localCircle]);
    if (remoteIdentityId) setJoinedTribes(current => current.includes(localCircle.id) ? current : [...current, localCircle.id]);
    setCircleName(''); setCircleIdentity(''); setCircleDescription('');
    setToast(`Circle created for ${localCircle.category}.`);
  }

  async function acceptAccountabilityInvite() {
    const token = new URLSearchParams(window.location.search).get('accountability');
    if (!token || !apiUrl) return;
    const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/accountability-invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
    if (response.ok) { setAccountabilityInvite((current: any) => ({ ...current, status: 'ACCEPTED' })); setToast('You are now an accountability partner.'); }
  }

  function advanceMilestone(habit: Habit) {
    const milestones = habit.milestones?.length ? habit.milestones : [habit.gateway, habit.target];
    const next = Math.min((habit.milestoneIndex ?? 0) + 1, milestones.length - 1);
    setHabits(current => current.map(item => item.id === habit.id ? { ...item, milestoneIndex: next } : item));
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shaping_current_step: next }) }).catch(() => {});
    setToast(next === milestones.length - 1 ? 'You reached your target routine. Keep it comfortable and repeatable.' : `Next step: ${milestones[next]}`);
  }

  async function shareSlip(habit: Habit) {
    const message = `I did the old habit: ${habit.name}. I’m telling you, ${habit.accountabilityPartner || 'accountability partner'}, so I can reset. My agreed commitment: ${habit.accountabilityCost || 'follow through on my habit contract'}.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Habit check in', text: message });
      else { await navigator.clipboard.writeText(message); setToast('Accountability message copied. Send it to your partner.'); }
    } catch { setToast('Share cancelled. Your check in is still here when you’re ready.'); }
  }

  async function addVaultReward(event: FormEvent) {
    event.preventDefault();
    if (!vaultName.trim() || !vaultHabit) return;
    let rewardId = `reward-${Date.now()}`;
    if (apiUrl && remoteIdentityId && !vaultHabit.startsWith('demo-')) {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/rewards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habit_id: vaultHabit, name: vaultName.trim(), detail: vaultDetail.trim() || null }) });
        if (response.ok) rewardId = (await response.json()).id;
      } catch { /* Keep the reward available in the local workspace. */ }
    }
    setRewards(current => [...current, { id: rewardId, name: vaultName.trim(), habitId: vaultHabit, detail: vaultDetail.trim() || 'Unlocks when your habit is complete' }]);
    setVaultName(''); setVaultDetail(''); setToast('Reward added to your vault.');
  }

  async function saveIdentity(event: FormEvent) { event.preventDefault(); setShowIdentity(false); save(); if (apiUrl && remoteIdentityId) apiFetch(`${apiUrl.replace(/\/$/, '')}/api/identities/${remoteIdentityId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity_statement: identity }) }).catch(() => setToast('Identity saved here. API sync will retry when connected.')); }

  async function setupAccount() {
    if (!apiUrl) { setToast('Add your API address first.'); return; }
    if (!accountEmail.trim() || accountPassword.length < 10) { setToast('Enter your email and a password with at least 10 characters.'); return; }
    setSettingsBusy(true); setConnectionError('');
    try {
      const base = apiUrl.replace(/\/$/, '');
      let response = await fetch(`${base}/api/auth/${connectionMode === 'create' ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accountEmail, password: accountPassword }) });
      if (!response.ok) throw new Error((await response.json()).detail ?? `Account request failed (${response.status})`);
      const account = await response.json();
      setRemoteToken(account.token); setRemoteUserId(account.id); setAccountEmail(account.email);
      const accountResponse = await fetch(`${base}/api/account`, { headers: { Authorization: `Bearer ${account.token}` } });
      if (!accountResponse.ok) throw new Error('Account was created but could not be loaded. Retry sign in.');
      const current = await accountResponse.json();
      let currentIdentity = current.identity;
      if (!currentIdentity) {
        const made = await fetch(`${base}/api/identities`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` }, body: JSON.stringify({ user_id: account.id, identity_statement: identity }) });
        if (!made.ok) throw new Error((await made.json()).detail ?? 'Could not create your profile');
        currentIdentity = await made.json();
      }
      setRemoteIdentityId(currentIdentity.id);
      const workspaceResponse = await fetch(`${base}/api/workspace`, { headers: { Authorization: `Bearer ${account.token}` } });
      if (!workspaceResponse.ok) throw new Error('Connected account could not load its saved data.');
      const workspace = await workspaceResponse.json();
      const data = workspace.data ?? {};
      revisionRef.current = workspace.revision ?? 0; setWorkspaceRevision(workspace.revision ?? 0);
      const hasData = Object.keys(data).length > 0;
      setServerHasWorkspace(hasData);
      if (hasData) {
        preserveLocalWorkspace();
        setHabitOrder(Array.isArray(data.habitOrder) ? data.habitOrder : []);
        setHomepageOrder(Array.isArray(data.homepageOrder) ? data.homepageOrder : []);
        setHabits((data.habits ?? []).map(expandInviteLink).filter((h: Habit) => !h.id.startsWith('demo-'))); setRewards((data.rewards ?? []).filter((r: Reward) => !r.id.startsWith('reward-show')));
        setIdentity(data.identity ?? currentIdentity.identity_statement); setGoal(data.goal ?? ''); setVotes(data.votes ?? currentIdentity.total_votes ?? 0); setPrepped(data.prepped ?? false); setPreppedHabits(data.preppedHabits ?? {}); setHistory(data.history ?? {}); setHabitEvents(data.habitEvents ?? []); setBehaviorLogs(withoutSampleBehaviorLogs(data.behaviorLogs ?? [])); setDailyConfirmations(data.dailyConfirmations ?? []); setCustomContextTags(data.customContextTags ?? []); setVariations(data.variations ?? []); setScorecard(data.scorecard ?? []); setJoinedTribes(data.joinedTribes ?? []); setCommunityCircles(data.communityCircles ?? []); setDiagnostics(data.diagnostics ?? []); setWorkspaceReady(true);
        setDarkMode(data.darkMode ?? true); if (palettes.some(option => option.id === data.palette)) setPalette(data.palette); setLabs(data.labs ?? false); setTelegramCommand(data.telegramCommand ?? '');
        setToast('Connected. Loaded the server copy for this account.');
      } else {
        setWorkspaceReady(false);
        setToast('Connected. Import this browser’s data below, or keep the sample workspace separate.');
      }
    } catch (error) { setConnectionError(`Could not connect: ${error instanceof Error ? error.message : 'check API address and CORS settings'}`); }
    finally { setSettingsBusy(false); }
  }

  async function connectTelegram() {
    if (!remoteUserId || !apiUrl) { setToast('Connect your API account first.'); return; }
    setSettingsBusy(true);
    try {
      const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/users/${remoteUserId}/telegram-link`, { method: 'POST' });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json(); setTelegramCommand(data.start_command); setToast('One-time Telegram link created. It expires in 10 minutes.');
    } catch (error) { setToast(`Telegram link failed: ${error instanceof Error ? error.message.slice(0, 90) : 'check bot configuration'}`); }
    finally { setSettingsBusy(false); }
  }

  function renderHabitCard(habit: Habit, index: number) {
    const cueLine = habit.cueType === 'STACK' ? `After ${habit.cue}` : `At ${habit.time || habit.cue} · ${habit.location}`;
    const planAnswers = getBreakPlanAnswers(habit);
    const replacementSteps = getReplacementActions(habit);
    const replacementOptions = getReplacementOptions(habit);
    const replacementSummary = habit.replacementMode === 'BOTH'
      ? [replacementSteps.join(' → '), replacementOptions.join(' or ')].filter(Boolean).join(' or ')
      : habit.replacementMode === 'OPTIONS' ? replacementOptions.join(' or ') : replacementSteps.join(' → ');
    const answerSummary = (values: string[]) => values.map(value => value.trim()).filter(Boolean).join(' · ');
    const streak = getResilientStreak(history, habit.id);
    const events = habitEvents.filter(event => event.habitId === habit.id);
    const activeDifficultyLevel = (habit.difficultyLevels ?? []).find(level => level.id === habit.activeDifficultyLevelId);
    const activeDifficultyLevelIndex = (habit.difficultyLevels ?? []).findIndex(level => level.id === habit.activeDifficultyLevelId);
    const canLevelUp = activeDifficultyLevelIndex < (habit.difficultyLevels?.length ?? 0) - 1;
    const habitVariations = variations.filter(item => item.habitId === habit.id);
    const repeatSteps = habit.dailySteps ?? [];
    const completedRepeatIds = new Set(habit.completedDailySteps ?? []);
    const shownRepeatSteps = showAllDailySteps[habit.id] ? repeatSteps : repeatSteps.slice(0, 8);
    const dailyStepPanel = habit.kind === 'BUILD' && (habit.dailyTarget ?? 1) > 1 ? <section className="daily-repeat-panel">
      <div className="daily-repeat-heading"><div><b>Today’s repetitions</b><span>{completedRepeatIds.size} of {habit.dailyTarget} complete</span></div><button type="button" className="text-button" onClick={() => editHabitPlan(habit)}>Edit and reorder</button></div>
      <div className="daily-repeat-list">{shownRepeatSteps.map(step => {
        const isDone = completedRepeatIds.has(step.id);
        const loggedEvent = events.find(event => event.type === 'ACTION_COMPLETED' && event.dailySlotId === step.id);
        return <div key={step.id} className={`daily-repeat-row${isDone ? ' is-done' : ''}`}><span className="daily-repeat-label">{step.label}</span>{isDone ? <button type="button" className="daily-repeat-done" onClick={() => loggedEvent && void undoHabitOccurrence(habit, loggedEvent)} disabled={!loggedEvent} aria-label={`Undo ${step.label}`}><Icon name="check" size={14}/> Done</button> : <button type="button" className="daily-repeat-check" onClick={() => void completeHabit(habit, step.id)} aria-label={`Complete ${step.label}`}>Mark done</button>}</div>;
      })}</div>
      {repeatSteps.length > 8 && <button type="button" className="text-button daily-repeat-expand" onClick={() => setShowAllDailySteps(current => ({ ...current, [habit.id]: !current[habit.id] }))}>{showAllDailySteps[habit.id] ? 'Show fewer' : `Show all ${repeatSteps.length} repetitions`}</button>}
    </section> : null;
    if (active === 'Today') {
      const laws = lawGroups.map(law => {
        const configured: Partial<Record<Law, string>> = habit.kind === 'BUILD'
          ? { cue: cueLine, craving: [habit.motive, habit.ritual].filter(Boolean).join(' · '), response: [habit.gateway, habit.prep && `Setup: ${habit.prep}`].filter(Boolean).join(' · '), reward: habit.reward }
          : { cue: answerSummary(planAnswers.cuesToHide), craving: [...planAnswers.underlyingNeeds, ...planAnswers.reframes].filter(Boolean).join(' · '), response: [answerSummary(planAnswers.frictionIdeas), replacementSteps.length ? `Instead: ${replacementSummary}` : ''].filter(Boolean).join(' · '), reward: [...planAnswers.oldPayoffs, ...planAnswers.agreements].filter(Boolean).join(' · ') };
        const selected = (habit.techniqueIds ?? []).map(id => techniqueMap[id]).filter(item => item?.laws.includes(law.id));
        const methods = selected.map(item => ({ id: item.id, name: item.name, note: techniqueNoteFor(habit.techniqueNotes ?? {}, item.id, law.id) }));
        const customKey = customLawAnswerKeys[law.id as HabitLaw];
        const setup = [customKey ? answerSummary(planAnswers[customKey]) : '', configured[law.id] ?? ''].filter(Boolean).join(' · ');
        return setup || methods.length ? { law, setup, methods } : null;
      }).filter((item): item is { law: typeof lawGroups[number]; setup: string; methods: { id: string; name: string; note: string }[] } => !!item);
      const isBuild = habit.kind === 'BUILD';
      const activeDifficultyLevel = (habit.difficultyLevels ?? []).find(level => level.id === habit.activeDifficultyLevelId);
      const actionSummary = isBuild ? activeDifficultyLevel?.activity || habit.gateway : replacementSummary || habit.alternativeRoutine || habit.gateway;
      const helpfulChoices = events.filter(event => event.type === 'URGE_PASSED' || event.type === 'REPLACEMENT_USED').length;
      return <article key={habit.id} className={`today-quick-card ${habit.completed ? 'today-quick-card-done' : ''} ${isBuild ? '' : 'today-quick-card-break'}`}>
        <span className={`today-quick-mark ${isBuild && habit.completed ? 'checked' : ''}`} aria-hidden="true">{isBuild && habit.completed ? <Icon name="check" size={15}/> : null}</span>
        <div className="today-quick-main">
          <div className="today-quick-title"><div className="habit-title-copy"><h3>{habit.name}</h3>{!isBuild && <span className="today-choice-count">{helpfulChoices} helpful choice{helpfulChoices === 1 ? '' : 's'}</span>}{habit.missedYesterday && !habit.completed && <span className="recovery-pill">Recovery day</span>}</div></div>
          {(actionSummary || !isBuild) && <p className="today-quick-action"><span>{isBuild ? activeDifficultyLevel ? `Level ${activeDifficultyLevelIndex + 1}${activeDifficultyLevel.name ? ` · ${activeDifficultyLevel.name}` : ''}` : habit.gatewayMinutes ? `${habit.gatewayMinutes}-min start` : 'Start' : 'Try instead'}</span>{actionSummary}</p>}
          {isBuild && habit.completed && <div className="today-completion-banner" role="status"><span><Icon name="check" size={15}/></span><div><b>You showed up today.</b><small>This habit is logged for today.</small></div></div>}
        </div>
        {renderHabitActions(habit)}
        <div className="today-quick-side">
          {isBuild
            ? <><span><Icon name="flame" size={13}/>{streak.hasHistory ? streak.count : habit.streak} day chain</span><div className="today-quick-actions"><button type="button" className={`today-quick-complete${habit.completed ? ' is-complete' : ''}`} onClick={() => completeHabit(habit)} disabled={habit.completed && (habit.dailyTarget ?? 1) <= 1} aria-label={`Log completion ${((habit.completionCount ?? (habit.completed ? 1 : 0)) + 1)} for ${habit.name}`}>{habit.completed ? <><Icon name="check" size={14}/>{habit.completionCount ?? 1} of {habit.dailyTarget ?? 1}{(habit.dailyTarget ?? 1) > 1 ? ' · Log again' : ' · Done today'}</> : <>{habit.completionCount ?? 0} of {habit.dailyTarget ?? 1} · I did it</>}</button>{(habit.difficultyLevels?.length ?? 0) > 0 && <button type="button" className="today-level-up" onClick={() => levelUpHabit(habit)} disabled={!canLevelUp} aria-label={canLevelUp ? `Move ${habit.name} to the next level` : `${habit.name} is at the maximum level`}>{canLevelUp ? 'Level up' : 'Max level'}</button>}</div></>
            : <details className="today-choice-menu"><summary>Log choice <Icon name="chevron" size={12}/></summary><div className="today-quick-break-actions"><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void recordHabitEvent(habit, 'URGE_PASSED'); }}>Urge passed</button><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void recordHabitEvent(habit, 'REPLACEMENT_USED'); }}>Used replacement</button></div></details>}
        </div>
        {dailyStepPanel}
        {laws.length > 0 && <details className="today-law-details"><summary>Plan details <span>{laws.length} strategies</span></summary><div className="today-law-list">{laws.map(({ law, setup, methods }) => <section className="today-law-row" key={law.id}><button type="button" className="today-law-guide" onClick={() => setInfoModal({ type: 'law', law: law.id, mode: habit.kind })} aria-label={`Learn about ${isBuild ? law.build : law.break}`}><span>{isBuild ? law.build : law.break}</span><span className="today-law-guide-info" aria-hidden="true">i</span></button>{setup && <p>{setup}</p>}{methods.length > 0 && <div className="today-law-methods"><small>Your techniques</small><div>{methods.map(method => <button type="button" className="chosen-technique" key={`${law.id}:${method.id}`} onClick={() => setInfoModal({ type: 'technique', id: method.id, mode: habit.kind })} aria-label={`Learn about ${method.name}`}><Icon name="check" size={12}/>{method.name}</button>)}</div>{methods.filter(method => method.note).map(method => <p className="technique-note" key={`${law.id}:${method.name}:note`}>{method.note}</p>)}</div>}</section>)}</div></details>}
      </article>;
    }
    return <article key={habit.id} className={`habit-card ${habit.completed ? 'habit-card-done' : ''}`}>
      <div className="habit-card-top">
        <div className={`habit-check ${habit.completed ? 'checked' : ''}`}>
          {habit.completed ? <Icon name="check" size={19}/> : <span>{String(index + 1).padStart(2, '0')}</span>}
        </div>
        <div className="habit-main">
          <div className="habit-title-copy"><h3>{habit.name}</h3>{habit.missedYesterday && !habit.completed && <span className="recovery-pill">Recovery day</span>}</div>
          <p className="habit-cue"><Icon name={habit.cueType === 'STACK' ? 'spark' : 'clock'} size={14}/>{cueLine}</p>
          {(activeDifficultyLevel?.activity || habit.gateway) && <p className="habit-starter"><span>{activeDifficultyLevel ? `Level ${(habit.difficultyLevels ?? []).findIndex(level => level.id === activeDifficultyLevel.id) + 1}${activeDifficultyLevel.name ? ` · ${activeDifficultyLevel.name}` : ''}` : habit.gatewayMinutes ? `${habit.gatewayMinutes}-min start` : 'Start'}</span>{activeDifficultyLevel?.activity ?? habit.gateway}</p>}
        </div>
        {renderHabitActions(habit)}
      </div>
      {dailyStepPanel}
      <div className="habit-card-foot">
        <span><Icon name="flame" size={14}/>{streak.hasHistory ? streak.count : habit.streak} day chain{streak.warning && !habit.completed ? ' · recover today' : ''}</span>
        <button className={`complete-button ${habit.completed ? 'complete-button-done' : ''}`} onClick={() => completeHabit(habit)} disabled={habit.completed && (habit.dailyTarget ?? 1) <= 1} aria-label={`${habit.completed ? 'Log another completion for' : 'Complete'} ${habit.name}`}>
          {habit.completed ? <><Icon name="check" size={16}/>{habit.completionCount ?? 1} of {habit.dailyTarget ?? 1}{(habit.dailyTarget ?? 1) > 1 ? ' · Add again' : ' · Done'}</> : <>{habit.completionCount ?? 0} of {habit.dailyTarget ?? 1} · I did it</>}
        </button>
        <button className="quiet-button" onClick={() => markMissed(habit)} disabled={habit.completed}>Mark missed</button>
      </div>
      <details className="habit-plan-details"><summary>Plan details, check-ins & settings</summary>
        {habit.kind === 'BUILD' && <section className="duration-tracker" aria-label={`Practice minutes for ${habit.name}`}>
          <div className="duration-tracker-heading"><div><b>Practice minutes</b><p>{habit.gatewayMinutes ? `Current starter target: ${habit.gatewayMinutes} minutes` : 'No starter target set'}</p></div><span>{events.reduce((total, event) => total + (event.actualMinutes ?? 0), 0)} min tracked</span></div>
          <div className="duration-tracker-controls"><label>Minutes this session<input type="number" min="1" max="1440" step="1" value={durationDrafts[habit.id] ?? (habit.gatewayMinutes || '')} onChange={e => setDurationDrafts(current => ({ ...current, [habit.id]: e.target.value === '' ? 0 : Number(e.target.value) }))}/></label><button type="button" className="secondary-button" onClick={() => logHabitMinutes(habit)}>Log session</button><label>Next target<input type="number" min="1" max="1440" step="1" value={targetDrafts[habit.id] ?? (habit.gatewayMinutes || '')} onChange={e => setTargetDrafts(current => ({ ...current, [habit.id]: e.target.value === '' ? 0 : Number(e.target.value) }))}/></label><button type="button" className="text-button" onClick={() => { const target = targetDrafts[habit.id] ?? habit.gatewayMinutes; if (Number.isInteger(target) && target >= 1 && target <= 1440) void updateHabitDuration(habit, target); else setToast('Choose a target from 1 to 1,440 minutes.'); }}>Update target</button></div>
          <small>Start small, log what you actually did, and raise the target whenever you feel ready.</small>
        </section>}
        {habit.motive && <p className="habit-why">Why it matters: {habit.motive}</p>}
        {habit.ritual && <p className="habit-ritual"><span>Before you start</span> {habit.ritual}</p>}
        {!!habit.prep && <div className="prep-inline"><label><input type="checkbox" checked={!!preppedHabits[habit.id]} onChange={e => setHabitPrep(habit.id, e.target.checked)}/><span><b>Tonight's setup</b> · {habit.prep}</span></label><span className="prep-label">{preppedHabits[habit.id] ? 'Ready' : 'PREP'}</span></div>}
        <div className="habit-laws-inline">{lawGroups.map(law => { const detail = law.id === 'cue' ? cueLine : law.id === 'craving' ? habit.motive : law.id === 'response' ? habit.gateway : habit.reward; const selected = (habit.techniqueIds ?? []).map(id => techniqueMap[id]).filter(item => item?.laws.includes(law.id)); return <div key={law.id}><b>{habit.kind === 'BUILD' ? law.build : law.break}</b><p>{detail || 'Add a clear step for this law.'}</p>{selected.length > 0 && <small>{selected.map((item, itemIndex) => <span key={item.id} id={habit.kind === 'BUILD' && item.laws[0] === law.id ? `build-technique-${habit.id}-${item.id}` : undefined} tabIndex={habit.kind === 'BUILD' && item.laws[0] === law.id ? -1 : undefined}>{item.name}{(habit.techniqueNotes?.[`${law.id}:${item.id}`] ?? habit.techniqueNotes?.[item.id]) ? `: ${habit.techniqueNotes?.[`${law.id}:${item.id}`] ?? habit.techniqueNotes?.[item.id]}` : ''}{itemIndex < selected.length - 1 ? '; ' : ''}</span>)}</small>}</div>; })}</div>
        {habit.kind === 'BUILD' && <div className="action-checkin"><p>“I did it” marks today complete. Record an extra check-in only for another action.</p><textarea aria-label={`Extra check-in note for ${habit.name}`} value={checkinNotes[habit.id] ?? ''} onChange={e => setCheckinNotes(current => ({ ...current, [habit.id]: e.target.value }))} placeholder="Optional note about the extra action" rows={2}/><button type="button" className="text-button" onClick={() => void recordHabitEvent(habit, 'ACTION_COMPLETED')}>Record an extra check-in</button></div>}
        <details className="build-variation-workspace"><summary>Test a plan variation <small>{habitVariations.length} saved</small></summary><p>Keep this plan and compare another cue, action, or reward.</p><div className="variation-fields"><select aria-label={`Variation law for ${habit.name}`} value={(variationDrafts[habit.id] ?? { law: 'cue' }).law} onChange={e => setVariationDrafts(current => ({ ...current, [habit.id]: { ...(current[habit.id] ?? { law: 'cue', name: '', techniqueId: '', setup: '' }), law: e.target.value as Law } }))}>{lawGroups.map(law => <option key={law.id} value={law.id}>{law.build}</option>)}</select><input aria-label={`Variation name for ${habit.name}`} placeholder="Name this alternative" value={variationDrafts[habit.id]?.name ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [habit.id]: { ...(current[habit.id] ?? { law: 'cue', name: '', techniqueId: '', setup: '' }), name: e.target.value } }))}/><textarea aria-label={`Variation setup for ${habit.name}`} placeholder="What will you try?" value={variationDrafts[habit.id]?.setup ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [habit.id]: { ...(current[habit.id] ?? { law: 'cue', name: '', techniqueId: '', setup: '' }), setup: e.target.value } }))}/><button type="button" className="secondary-button" onClick={() => void createVariation(habit)}>Save variation</button></div>{habitVariations.map(v => <div className="variation-row" id={`build-variation-${v.id}`} tabIndex={-1} key={v.id}><div className="variation-row-main"><div><b>{v.name}</b>{v.isActive && <span className="variation-active">Testing now</span>}<p>{lawGroups.find(law => law.id === v.law)?.build}: {v.setup}</p></div><button type="button" className="text-button" onClick={() => void updateVariation(v, { isActive: !v.isActive })}>{v.isActive ? 'Active' : 'Make active'}</button></div><div className="variation-outcome"><span>{v.triedAt ? `Tried ${new Date(v.triedAt).toLocaleDateString()}` : 'Not tried yet'}</span><label>Did it help?<select value={v.helped === true ? 'yes' : v.helped === false ? 'no' : ''} onChange={e => void updateVariation(v, { helped: e.target.value === '' ? null : e.target.value === 'yes' })}><option value="">Not rated</option><option value="yes">Yes</option><option value="no">Not yet</option></select></label></div></div>)}</details>
        <details className="event-history"><summary>Check-in history <small>{events.length}</small></summary>{events.length ? <ol>{events.slice(0, 30).map(event => <li key={event.id}><b>{event.type === 'ACTION_COMPLETED' ? 'Action completed' : event.type === 'URGE_PASSED' ? 'Urge passed' : event.type === 'REPLACEMENT_USED' ? 'Replacement used' : 'Old behavior'}</b><time>{new Date(event.at).toLocaleString()}</time>{event.actualMinutes && <small>{event.actualMinutes} minutes practiced</small>}{event.variationName && <small>Testing: {event.variationName}</small>}{event.strategy && !event.variationName && <small>Strategy: {event.strategy}</small>}{event.note && <p>{event.note}</p>}</li>)}</ol> : <p>No events yet. Your history will appear here.</p>}</details>
        {(habit.difficultyLevels?.length ?? 0) > 0 ? <div className="milestone-progress difficulty-current-card"><div><b>Current difficulty</b><span>Level {(habit.difficultyLevels ?? []).findIndex(level => level.id === habit.activeDifficultyLevelId) + 1} of {habit.difficultyLevels?.length}</span></div><p>{activeDifficultyLevel?.activity ?? 'Choose a level'}</p>{activeDifficultyLevel?.target && <small>Target: {activeDifficultyLevel.target}</small>}{activeDifficultyLevel?.criteria && <small>Complete when: {activeDifficultyLevel.criteria}</small>}<label>Choose a level<select aria-label={`Current difficulty level for ${habit.name}`} value={habit.activeDifficultyLevelId ?? ''} onChange={event => void setHabitDifficultyLevel(habit, event.target.value)}>{(habit.difficultyLevels ?? []).map((level, levelIndex) => <option key={level.id} value={level.id}>Level {levelIndex + 1}{level.name ? ` · ${level.name}` : ''}</option>)}</select></label></div> : habit.milestones && habit.milestones.length > 1 && <div className="milestone-progress"><div><b>Habit shaping</b><span>Step {(habit.milestoneIndex ?? 0) + 1} of {habit.milestones.length}</span></div><p>{habit.milestones[habit.milestoneIndex ?? 0]}</p><div className="milestone-track"><i style={{ width: `${(((habit.milestoneIndex ?? 0) + 1) / habit.milestones.length) * 100}%` }}/></div>{(habit.milestoneIndex ?? 0) < habit.milestones.length - 1 && <button type="button" onClick={() => advanceMilestone(habit)}>Ready for the next step <Icon name="arrow" size={13}/></button>}</div>}
      </details>
    </article>;
  }

  function renderLogging() {
    const selectedHabit = habits.find(habit => habit.id === loggingHabitId) ?? habits.find(habit => habit.kind === 'BREAK') ?? demoHabits[0];
    const logs = behaviorLogs.filter(log => log.habitId === selectedHabit.id).sort((a, b) => b.at.localeCompare(a.at));
    const loggingTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    const legacyAnalyticsLogs = legacyHabitEventsToBehaviorLogs(
      habitEvents,
      selectedHabit.id,
      loggingTimezone,
      variations.filter(item => item.habitId === selectedHabit.id),
      techniques,
    );
    const analyticsLogs = [...logs, ...legacyAnalyticsLogs].sort((a, b) => b.at.localeCompare(a.at));
    const cueCaptureLog = logs.find(log => log.id === quickCueCaptureLogId && log.type === 'craving');
    const dueUrgeFollowUp = logs.filter(log => log.type === 'craving' && log.urgeFollowUpDueAt && new Date(log.urgeFollowUpDueAt).getTime() <= loggingClock && !log.urgeFollowUpStatus && outcomeForCraving(logs, log) === 'resisted').sort((a, b) => (a.urgeFollowUpDueAt ?? '').localeCompare(b.urgeFollowUpDueAt ?? ''))[0];
    const pendingEngagementCheck = [...logs].filter(log => log.type === 'craving' && !log.id.startsWith('sample-log-') && log.questionnaireVersion === 1 && outcomeForCraving(logs, log) === 'smoked' && !log.postEngagementSatisfaction).sort((a, b) => b.at.localeCompare(a.at))[0];
    const today = todayKey();
    const todaySummary = summarizeDay(analyticsLogs, selectedHabit.id, today, dailyConfirmations);
    const currentConfirmation = dailyConfirmations.find(row => row.habitId === selectedHabit.id && row.date === today);
    const isSmoke = isSmokingHabit(selectedHabit);
    const occurrenceUnit = isSmoke ? 'cigarette' : 'occurrence';
    const getOutcome = (log: BehaviorLog) => log.type === 'habit_occurrence' ? 'smoked' : log.type === 'craving' ? outcomeForCraving(analyticsLogs, log) : episodeResolvedOutcome(analyticsLogs, log);
    const allTriggers = [...new Set(logs.map(log => log.trigger).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
    const configured = new Map<string, { key: string; name: string; techniqueId?: string; variationId?: string; laws: string[]; detail?: string }>();
    (selectedHabit.techniqueIds ?? []).forEach(id => {
      const item = techniqueMap[id];
      if (item) configured.set('technique:' + id, { key: 'technique:' + id, name: item.name, techniqueId: item.id, laws: item.laws, detail: techniqueNoteFor(selectedHabit.techniqueNotes ?? {}, id, item.laws[0]) || undefined });
    });
    variations.filter(item => item.habitId === selectedHabit.id).forEach(item => {
      const definition = item.techniqueId ? techniqueMap[item.techniqueId] : undefined;
      const key = 'variation:' + item.id;
      configured.set(key, { key, name: item.name || definition?.name || 'Strategy technique', techniqueId: item.techniqueId, variationId: item.id, laws: [item.law], detail: item.setup || undefined });
    });
    const techniqueChoices = [...configured.values()];
    const matchesTechniqueChoice = (log: BehaviorLog, choice: { techniqueId?: string; variationId?: string; name: string }) => choice.variationId
      ? log.variationId === choice.variationId
      : choice.techniqueId ? log.techniqueId === choice.techniqueId && !log.variationId : !log.techniqueId && log.technique === choice.name;
    const selectedTechniqueKey = logVariationId ? 'variation:' + logVariationId : logTechniqueId ? 'technique:' + logTechniqueId : '';
    const chosenLaw = (log: BehaviorLog) => log.laws ?? (log.law ? [log.law] : log.techniqueId ? (techniqueMap[log.techniqueId]?.laws ?? []) : []);
    const isHourlyWindow = insightDays === '24h' && !insightFrom && !insightTo;
    const isAllTimeWindow = insightDays === 'all' && !insightFrom && !insightTo;
    const windowEndMs = Date.now();
    const windowStartMs = windowEndMs - 24 * 60 * 60 * 1000;
    const dateOrdinal = (key: string) => { const [year, month, day] = key.split('-').map(Number); return Date.UTC(year, month - 1, day); };
    const dateKeyAtOrdinal = (ordinal: number) => new Date(ordinal).toISOString().slice(0, 10);
    const availableHistoryKeys = [
      ...analyticsLogs.map(behaviorDayKey),
      ...dailyConfirmations.filter(item => item.habitId === selectedHabit.id).map(item => item.date),
    ].filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort();
    const firstHistoryKey = availableHistoryKeys[0] ?? today;
    const rangeStart = insightFrom || (isHourlyWindow ? dateKeyInZone(new Date(windowStartMs)) : isAllTimeWindow ? firstHistoryKey : localDateKeys(insightDays === '24h' || insightDays === 'all' ? 1 : insightDays)[0]);
    const rangeEnd = insightTo || (isHourlyWindow ? dateKeyInZone(new Date(windowEndMs)) : today);
    const requestedStartKey = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    const endKey = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    const requestedDayCount = Math.max(1, Math.floor((dateOrdinal(endKey) - dateOrdinal(requestedStartKey)) / 86400000) + 1);
    const dayCount = requestedDayCount;
    const periodStartKey = dateKeyAtOrdinal(dateOrdinal(endKey) - (dayCount - 1) * 86400000);
    const insightKeys = Array.from({ length: dayCount }, (_, index) => dateKeyAtOrdinal(dateOrdinal(periodStartKey) + index * 86400000));
    const periodLabel = isHourlyWindow ? '24 hours' : isAllTimeWindow ? 'all time' : `${dayCount} ${dayCount === 1 ? 'day' : 'days'}`;
    const periodEyebrow = isHourlyWindow ? 'Past 24 hours' : isAllTimeWindow ? 'All time' : insightFrom || insightTo ? `Custom range · ${dayCount} ${dayCount === 1 ? 'day' : 'days'}` : `${dayCount} ${dayCount === 1 ? 'day' : 'days'}`;
    const periodRangeText = isHourlyWindow
      ? `${new Date(windowStartMs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} to ${new Date(windowEndMs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      : `${periodStartKey} to ${endKey}`;
    const windowLogs = analyticsLogs.filter(log => {
      if (isHourlyWindow) { const at = new Date(log.at).getTime(); return at >= windowStartMs && at <= windowEndMs; }
      const key = behaviorDayKey(log);
      return key >= periodStartKey && key <= endKey;
    });
    const cuePattern = summarizeCuePatterns(windowLogs, insightKeys);
    const dayData = insightKeys.map(key => ({ key, summary: summarizeDay(analyticsLogs, selectedHabit.id, key, dailyConfirmations) }));
    const confirmationConflicts = dayData.filter(day => day.summary.conflict);
    const monthlyBuckets = !isHourlyWindow && dayCount > 180;
    const periodBuckets = isHourlyWindow
      ? Array.from({ length: 24 }, (_, index) => {
          const bucketStart = windowStartMs + index * 60 * 60 * 1000;
          const bucketEnd = Math.min(windowEndMs, bucketStart + 60 * 60 * 1000);
          const bucketLogs = windowLogs.filter(log => { const at = new Date(log.at).getTime(); return at >= bucketStart && at < bucketEnd; });
          const occurrences = bucketLogs.filter(log => log.type === 'habit_occurrence');
          return {
            key: `hour-${index}`,
            label: new Date(bucketStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            detail: `${new Date(bucketStart).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} to ${new Date(bucketEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
            summary: {
              quantity: occurrences.reduce((total, log) => total + (log.legacyEvent ? 0 : (log.quantity ?? 0)), 0),
              occurrenceEvents: occurrences.length,
              cravings: bucketLogs.filter(log => log.type === 'craving').length,
              knownOccurrenceCount: occurrences.length,
              quantityKnown: occurrences.length > 0 && occurrences.every(log => !log.legacyEvent && typeof log.quantity === 'number' && Number.isFinite(log.quantity)),
              legacyOccurrences: occurrences.filter(log => log.legacyEvent).length,
            },
          };
        })
      : monthlyBuckets
        ? [...new Set(dayData.map(day => day.key.slice(0, 7)))].map(month => {
            const monthDays = dayData.filter(day => day.key.startsWith(month));
            const monthLogs = windowLogs.filter(log => behaviorDayKey(log).startsWith(month));
            const occurrences = monthLogs.filter(log => log.type === 'habit_occurrence');
            const date = new Date(`${month}-15T12:00:00`);
            return {
              key: `month-${month}`,
              label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
              detail: `${month} · ${monthDays.length} days`,
              summary: {
                quantity: occurrences.reduce((total, log) => total + (log.legacyEvent ? 0 : (log.quantity ?? 0)), 0),
                occurrenceEvents: occurrences.length,
                cravings: monthLogs.filter(log => log.type === 'craving').length,
                knownOccurrenceCount: occurrences.length > 0 || monthDays.every(day => day.summary.knownOccurrenceCount),
                quantityKnown: occurrences.length > 0
                  ? occurrences.every(log => !log.legacyEvent && typeof log.quantity === 'number' && Number.isFinite(log.quantity))
                  : monthDays.every(day => day.summary.quantityKnown),
                legacyOccurrences: occurrences.filter(log => log.legacyEvent).length,
              },
            };
          })
        : dayData.map(day => ({
          key: day.key,
          label: new Date(day.key + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
          detail: day.key,
          summary: day.summary,
        }));
    const rangeOccurrences = windowLogs.filter(log => log.type === 'habit_occurrence');
    const rangeCravings = windowLogs.filter(log => log.type === 'craving');
    const urgeCheckIns = summarizeUrgeCheckIns(windowLogs, analyticsLogs);
    const resolvedCravings = rangeCravings.filter(log => getOutcome(log) !== 'unknown');
    const resolutionMinutes = rangeCravings.map(log => minutesToCravingResolution(analyticsLogs, log)).filter((value): value is number => value !== undefined);
    const averageResolutionMinutes = resolutionMinutes.length ? (resolutionMinutes.reduce((sum, value) => sum + value, 0) / resolutionMinutes.length).toFixed(1) : '—';
    const intensities = rangeCravings.map(log => log.intensity).filter((value): value is number => value !== undefined);
    const avgIntensity = intensities.length ? (intensities.reduce((sum, value) => sum + value, 0) / intensities.length).toFixed(1) : '—';
    const topTriggers = [...windowLogs.reduce((counts, log) => { if (log.trigger) counts.set(log.trigger, (counts.get(log.trigger) ?? 0) + 1); return counts; }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en', { sensitivity: 'base' })).slice(0, 6);
    const triggerStats = topTriggers.map(([name, count]) => {
      const triggered = windowLogs.filter(log => log.trigger === name);
      const episodes = [...new Set(triggered.map(episodeKey))];
      const resolved = episodes.map(id => resolvedEpisodeOutcome(analyticsLogs, id)).filter(value => value !== 'unknown');
      return { name, count, episodes: episodes.length, resolved: resolved.length, resisted: resolved.filter(value => value === 'resisted').length, smoked: resolved.filter(value => value === 'smoked').length };
    });
    const techniqueApplicationLogs = windowLogs.filter(log => {
      const lawMatch = insightLawFilter === 'all' || chosenLaw(log).includes(insightLawFilter);
      const triggerMatch = insightTriggerFilter === 'all' || log.trigger === insightTriggerFilter;
      const intensityMatch = insightIntensityFilter === 'all' || (insightIntensityFilter === 'unknown' ? log.intensity === undefined : insightIntensityFilter === 'low' ? (log.intensity ?? -1) >= 0 && (log.intensity ?? -1) <= 3 : insightIntensityFilter === 'medium' ? (log.intensity ?? -1) >= 4 && (log.intensity ?? -1) <= 6 : (log.intensity ?? -1) >= 7 && (log.intensity ?? -1) <= 10);
      const timingMatch = insightTimingFilter === 'all' || (log.timing ?? 'responsive') === insightTimingFilter;
      return log.type === 'technique_applied' && !isRecoveryPrincipleApplication(log) && lawMatch && triggerMatch && intensityMatch && timingMatch;
    });
    const hasTechniqueFilters = insightLawFilter !== 'all' || insightTriggerFilter !== 'all' || insightIntensityFilter !== 'all' || insightTimingFilter !== 'all';
    const insightLaws = lawGroups.slice(0, 4).map(law => ({ ...law, break: law.break.replace(/\b\w/g, letter => letter.toUpperCase()) }));
    const configuredInsightChoices = techniqueChoices.map(choice => ({
      ...choice,
      detail: choice.detail || (choice.techniqueId ? techniqueMap[choice.techniqueId]?.example : undefined),
      description: choice.techniqueId ? techniqueMap[choice.techniqueId]?.description : undefined,
      example: choice.techniqueId ? techniqueMap[choice.techniqueId]?.example : undefined,
    }));
    const metadataChoices = [
      ...configuredInsightChoices,
      ...techniques.filter(technique => !configuredInsightChoices.some(choice => choice.key === 'technique:' + technique.id)).map(technique => ({
        key: 'technique:' + technique.id,
        name: technique.name,
        techniqueId: technique.id,
        laws: technique.laws,
        detail: technique.example,
        description: technique.description,
        example: technique.example,
      })),
    ];
    const commonTrigger = mostCommonTrigger(windowLogs);
    const mostPracticed = mostPracticedTechnique(techniqueApplicationLogs, metadataChoices);
    const techniquePractice = buildTechniquePracticeStats(
      techniqueApplicationLogs,
      analyticsLogs,
      windowLogs,
      metadataChoices,
      configuredInsightChoices,
      insightLaws.map(law => law.id),
    );
    const suggestedExperiment = buildSuggestedExperiment(windowLogs, analyticsLogs, configuredInsightChoices);
    const strategyGap = buildStrategyGap(windowLogs, analyticsLogs, configuredInsightChoices, insightLaws);
    const localHour = (log: BehaviorLog) => {
      if (!log.timezone) return new Date(log.at).getHours();
      try { const value = new Intl.DateTimeFormat('en-US', { timeZone: log.timezone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(log.at)).find(part => part.type === 'hour')?.value; return Number(value ?? new Date(log.at).getHours()); } catch { return new Date(log.at).getHours(); }
    };
    const localWeekday = (log: BehaviorLog) => new Date(behaviorDayKey(log) + 'T12:00:00').getDay();
    const cravingBins = [
      { name: 'Morning', min: 5, max: 11 },
      { name: 'Afternoon', min: 12, max: 16 },
      { name: 'Evening', min: 17, max: 20 },
      { name: 'Night', min: 21, max: 4 },
    ].map(bin => {
      const count = rangeCravings.filter(log => { const hour = localHour(log); return bin.min <= bin.max ? hour >= bin.min && hour <= bin.max : hour >= bin.min || hour <= bin.max; }).length;
      return { ...bin, count };
    });
    const occurrenceBins = [
      { name: 'Morning', min: 5, max: 11 },
      { name: 'Afternoon', min: 12, max: 16 },
      { name: 'Evening', min: 17, max: 20 },
      { name: 'Night', min: 21, max: 4 },
    ].map(bin => ({ ...bin, count: rangeOccurrences.filter(log => { const hour = localHour(log); return bin.min <= bin.max ? hour >= bin.min && hour <= bin.max : hour >= bin.min || hour <= bin.max; }).length }));
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: rangeOccurrences.filter(log => localHour(log) === hour).length, cravings: rangeCravings.filter(log => localHour(log) === hour).length }));
    const weekdayCounts = Array.from({ length: 7 }, (_, day) => ({ day, label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day], count: rangeOccurrences.filter(log => localWeekday(log) === day).length, cravings: rangeCravings.filter(log => localWeekday(log) === day).length }));
    const intensityDistribution = [
      { label: '0–3', count: intensities.filter(value => value <= 3).length },
      { label: '4–6', count: intensities.filter(value => value >= 4 && value <= 6).length },
      { label: '7–10', count: intensities.filter(value => value >= 7).length },
    ];
    const previousWindowStartMs = isHourlyWindow ? windowStartMs - 24 * 60 * 60 * 1000 : undefined;
    const previousWindowEndMs = isHourlyWindow ? windowStartMs : undefined;
    const previousEndOrdinal = dateOrdinal(periodStartKey) - 86400000;
    const previousStartOrdinal = previousEndOrdinal - (dayCount - 1) * 86400000;
    const previousStartKey = isHourlyWindow ? dateKeyInZone(new Date(previousWindowStartMs!)) : dateKeyAtOrdinal(previousStartOrdinal);
    const previousEndKey = isHourlyWindow ? dateKeyInZone(new Date(previousWindowEndMs! - 1)) : dateKeyAtOrdinal(previousEndOrdinal);
    const previousKeys = Array.from({ length: Math.max(1, Math.floor((dateOrdinal(previousEndKey) - dateOrdinal(previousStartKey)) / 86400000) + 1) }, (_, index) => dateKeyAtOrdinal(dateOrdinal(previousStartKey) + index * 86400000));
    const previousWindowLogs = analyticsLogs.filter(log => {
      if (isHourlyWindow) { const at = new Date(log.at).getTime(); return at >= previousWindowStartMs! && at < previousWindowEndMs!; }
      const key = behaviorDayKey(log);
      return key >= previousStartKey && key <= previousEndKey;
    });
    const summarizePeriod = (periodLogs: BehaviorLog[], keys: string[], hourlyWindow: boolean, startMs?: number, endMs?: number) => {
      const occurrences = periodLogs.filter(log => log.type === 'habit_occurrence');
      const cravings = periodLogs.filter(log => log.type === 'craving');
      const resolved = cravings.filter(log => getOutcome(log) !== 'unknown');
      const intensityValues = cravings.map(log => log.intensity).filter((value): value is number => value !== undefined);
      const occurrenceDays = keys.map(key => summarizeDay(analyticsLogs, selectedHabit.id, key, dailyConfirmations));
      const confirmations = dailyConfirmations.filter(item => {
        if (item.habitId !== selectedHabit.id || item.status === 'skip') return false;
        if (hourlyWindow && startMs !== undefined && endMs !== undefined) { const updatedAt = new Date(item.updatedAt).getTime(); return updatedAt >= startMs && updatedAt < endMs; }
        return item.date >= keys[0] && item.date <= keys[keys.length - 1];
      });
      return {
        quantity: occurrences.reduce((sum, log) => sum + (log.legacyEvent ? 0 : (log.quantity ?? 0)), 0),
        occurrences: occurrences.length,
        legacyOccurrences: occurrences.filter(log => log.legacyEvent).length,
        cravings: cravings.length,
        averageIntensity: intensityValues.length ? (intensityValues.reduce((sum, value) => sum + value, 0) / intensityValues.length).toFixed(1) : '—',
        resisted: resolved.filter(log => getOutcome(log) === 'resisted').length,
        resolved: resolved.length,
        techniques: periodLogs.filter(log => log.type === 'technique_applied' && !isRecoveryPrincipleApplication(log)).length,
        noOccurrenceConfirmations: confirmations.filter(item => item.status === 'no_occurrence').length,
        loggedDays: new Set(periodLogs.map(behaviorDayKey)).size,
        confirmations: confirmations.length,
        days: keys.length,
        occurrenceCoverageComplete: isPeriodOccurrenceCoverageComplete(occurrenceDays, hourlyWindow),
        quantityCoverageComplete: isPeriodOccurrenceCoverageComplete(
          occurrenceDays.map(day => ({ ...day, knownOccurrenceCount: day.quantityKnown })),
          hourlyWindow,
        ) && (!hourlyWindow || periodLogs.every(log => log.type !== 'habit_occurrence' || (!log.legacyEvent && typeof log.quantity === 'number'))),
      };
    };
    const currentPeriod = summarizePeriod(windowLogs, insightKeys, isHourlyWindow, windowStartMs, windowEndMs);
    const previousPeriod = summarizePeriod(previousWindowLogs, previousKeys, isHourlyWindow, previousWindowStartMs, previousWindowEndMs);
    const delta = (current: number, previous: number) => previous === 0 ? (current === 0 ? '0' : 'New') : ((current - previous > 0 ? '+' : '') + Math.round((current - previous) / previous * 100) + '%');
    const rating = windowLogs.length === 0 ? 'No records in this period' : windowLogs.length < 12 ? 'Limited records in this period' : resolvedCravings.length < 5 ? 'Descriptive records, few resolved outcomes in this period' : 'Sufficient descriptive records for this period';
    const maxOccurrence = Math.max(1, ...periodBuckets.map(bucket => isSmoke ? Math.max(bucket.summary.quantity, bucket.summary.legacyOccurrences) : bucket.summary.occurrenceEvents));
    const maxCravings = Math.max(1, ...periodBuckets.map(bucket => bucket.summary.cravings));
    const historyLogs = analyticsLogs.filter(log => {
      const outcome = getOutcome(log);
      const lawList = chosenLaw(log);
      const recoveryAction = isRecoveryPrincipleApplication(log);
      const typeMatches = historyTypeFilter === 'all'
        || (historyTypeFilter === 'recovery' ? recoveryAction : log.type === historyTypeFilter && !recoveryAction);
      return typeMatches
        && (!historyTriggerFilter || (log.trigger ?? '').toLowerCase().includes(historyTriggerFilter.toLowerCase()))
        && (!historyTechniqueFilter || (!recoveryAction && (log.technique ?? '').toLowerCase().includes(historyTechniqueFilter.toLowerCase())))
        && (historyLawFilter === 'all' || lawList.includes(historyLawFilter))
        && (historyOutcomeFilter === 'all' || outcome === historyOutcomeFilter)
        && (!historyFrom || behaviorDayKey(log) >= historyFrom)
        && (!historyTo || behaviorDayKey(log) <= historyTo);
    });
    const firstHistoryPage = historyLogs.slice(0, historyLimit);
    const firstPageEpisodes = new Set(firstHistoryPage.map(episodeKey));
    const visibleHistory = historyLogs.filter((log, index) => index < historyLimit || (log.episodeId && firstPageEpisodes.has(log.episodeId)));
    const dailyHistory = Object.entries(history).flatMap(([day, records]) => records.flatMap(value => {
      const missed = value.startsWith('missed:');
      const habitId = missed ? value.slice(7) : value;
      const habit = habits.find(item => item.id === habitId);
      return habit && habit.id === selectedHabit.id && (!historyFrom || day >= historyFrom) && (!historyTo || day <= historyTo) && historyTypeFilter === 'all' ? [{ day, habit, missed }] : [];
    })).sort((a, b) => b.day.localeCompare(a.day));
    const historyDays = [...new Set([...visibleHistory.map(behaviorDayKey), ...dailyHistory.map(item => item.day)])].sort((a, b) => b.localeCompare(a));
    const timelineGroups = historyDays.map(day => {
      const rows = visibleHistory.filter(log => behaviorDayKey(log) === day);
      const ids = [...new Set(rows.map(episodeKey))];
      return { day, checkins: dailyHistory.filter(item => item.day === day), episodes: ids.map(id => ({ id, rows: rows.filter(log => episodeKey(log) === id).sort((a, b) => a.at.localeCompare(b.at)) })) };
    });
    const formatDay = (key: string) => new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const formatTime = (value: string, timezone?: string) => {
      try { return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
      catch { return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
    };
    const eventLabel = (log: BehaviorLog) => log.legacyEvent && log.type === 'craving' ? 'Urge passed' : log.legacyEvent && log.type === 'technique_applied' ? 'Replacement used' : isRecoveryPrincipleApplication(log) ? 'Recovery action' : log.type === 'craving' ? 'Craving' : log.type === 'habit_occurrence' ? occurrenceActionLabel(selectedHabit) : 'Technique applied';
    const eventDetails = (log: BehaviorLog) => {
      const bits: string[] = [];
      if (log.type === 'craving' && log.intensity !== undefined) bits.push('Intensity ' + log.intensity + '/10');
      if (log.type === 'habit_occurrence') bits.push(log.legacyEvent ? 'Quantity not recorded' : (log.quantity ?? 1) + ' ' + occurrenceUnit + ((log.quantity ?? 1) === 1 ? '' : 's'));
      if (isRecoveryPrincipleApplication(log)) bits.push('Return to plan at the next opportunity');
      else if (log.type === 'technique_applied') {
        bits.push(log.technique || 'Technique');
        if (log.timing) bits.push(log.timing);
        const law = lawGroups.find(item => item.id === (log.law || chosenLaw(log)[0]));
        if (law) bits.push(law.break);
      }
      if (log.trigger) bits.push(log.trigger);
      if (log.replacementAction) bits.push('Replacement: ' + log.replacementAction);
      return bits.join(' · ');
    };
    const contextDetails = (log: BehaviorLog) => {
      const labelFor = (value: string) => [...bodilyStateOptions, ...accessibilityOptions, ...motiveOptions].find(([key]) => key === value)?.[1] ?? value;
      return [
        ...(log.context?.emotions ?? []), ...(log.context?.environments ?? []), ...(log.context?.activities ?? []), ...(log.context?.social ?? []), ...(log.context?.tags ?? []),
        log.context?.bodilyState ? labelFor(log.context.bodilyState) : '',
        log.context?.accessibility ? labelFor(log.context.accessibility) : '',
        ...(log.context?.motives ?? []).map(labelFor),
      ].filter(Boolean).join(' · ');
    };
    const outcomeLabel = (outcome: string) => outcome === 'resisted' ? 'Resisted' : outcome === 'smoked' ? (isSmoke ? 'Smoked' : 'Engaged in habit') : 'Outcome unknown';
    const buildDays = localDateKeys(28).map(day => ({ day, status: (history[day] ?? []).includes(selectedHabit.id) ? 'completed' : (history[day] ?? []).includes(`missed:${selectedHabit.id}`) ? 'missed' : 'unknown' }));
    const completedDays = buildDays.filter(day => day.status === 'completed').length;
    const unknownDays = buildDays.filter(day => day.status === 'unknown').length;
    const missOpportunities = buildDays.slice(0, -1).flatMap((day, index) => day.status === 'missed' && buildDays[index + 1].status !== 'unknown' ? [buildDays[index + 1]] : []);
    const nextDayRebounds = missOpportunities.filter(day => day.status === 'completed').length;
    const configuredOpenEpisodes = [...new Set(logs.filter(log => log.episodeId).map(log => log.episodeId!))];
    return <>
      <div className="page-heading-row logging-heading logging-heading-compact">
        <div><div className="eyebrow">{loggingView === 'Log' ? 'Understand your behavior' : loggingView === 'Insights' ? 'Measure your progress' : 'Review past events'}</div><h1>{loggingView === 'Log' ? 'Habit Journal' : loggingView === 'Insights' ? 'Habit Tracker' : 'Habit History'}</h1></div>
        <label className="logging-habit-picker">Habit<select aria-label="Select habit" value={selectedHabit.id} onChange={event => { setLoggingHabitId(event.target.value); setQuickCueCaptureLogId(''); setHistoryLimit(30); }}>{habits.map(habit => <option key={habit.id} value={habit.id}>{habit.name}</option>)}</select></label>
      </div>
      <section className={`logging-sync-banner ${connectionError ? 'has-error' : workspaceReady && remoteToken ? 'is-connected' : 'is-local'}`} role="status">
        <div><b>{connectionError ? 'Sync needs attention' : workspaceReady && remoteToken ? 'Account sync is active' : remoteToken ? 'Device data import is pending' : 'Saved on this device only'}</b><p>{connectionError ? `${connectionError} Your browser copy is still available.` : workspaceReady && remoteToken ? 'New logging entries sync to this Habitly account.' : remoteToken ? 'The account is connected, but its workspace has not been loaded. Review the local data import in Settings before logging here.' : 'This browser’s logging records are not reaching the server yet. Connect an account in Settings to sync this device’s data.'}</p></div>
        <div className="logging-sync-actions"><button type="button" className="text-button" onClick={() => void exportWorkspaceBackup()}>Save a backup</button><button type="button" className="text-button" onClick={() => { setActive('Settings'); setMobileNav(false); }}>{remoteToken && !workspaceReady ? 'Review import' : remoteToken ? 'Connection settings' : 'Connect account'} <Icon name="arrow" size={14}/></button></div>
      </section>
      {legacyAnalyticsLogs.length > 0 && <p className="logging-legacy-note">Included {legacyAnalyticsLogs.length} older check-in{legacyAnalyticsLogs.length === 1 ? '' : 's'} from the previous Smoking logger. Urge-passed and replacement-used entries now count in insights. Cigarette quantities and structured triggers remain unknown unless those fields were recorded.</p>}
      <div className="logging-view-tabs" role="tablist" aria-label="Behavioral logging views">
        {(['Log', 'Insights', 'History'] as const).map(view => <button key={view} type="button" role="tab" id={'logging-tab-' + view.toLowerCase()} aria-selected={loggingView === view} aria-controls="logging-view-panel" className={loggingView === view ? 'selected' : ''} onClick={() => { setLoggingView(view); setActive(view === 'Log' ? 'Journal' : view === 'Insights' ? 'Tracker' : 'History'); }}>{view}{view === 'History' && <span>{analyticsLogs.length}</span>}</button>)}
      </div>
      <div id="logging-view-panel" role="tabpanel" aria-labelledby={'logging-tab-' + loggingView.toLowerCase()}>
        {loggingView === 'Log' && <>
          <div className="logging-today-strip">
            <div className="logging-mini-summary"><span className="eyebrow">Today · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><div><b>{todaySummary.quantity}</b><span>{isSmoke ? 'cigarettes' : 'occurrences'} logged</span><i/><b>{todaySummary.cravings}</b><span>cravings logged</span><i/><b>{todaySummary.techniqueApplications}</b><span>techniques used</span></div></div>
            <span className="logging-quality-pill">{todaySummary.resistedCravings}/{todaySummary.resolvedCravings} cravings resisted today</span>
          </div>
          <section className="logging-quick-panel">
            <div className="logging-section-heading"><div><span className="eyebrow">One tap to record</span><h2>What’s happening?</h2></div><span className="logging-live"><i/>{connectionError ? 'Sync issue' : workspaceReady && remoteToken ? 'Synced with account' : remoteToken ? 'Import required' : 'Saved on this device'}</span></div>
            {selectedHabit.kind === 'BUILD' ? <div className="logging-quick-actions"><button type="button" className="logging-quick-action technique" onClick={() => void completeHabit(selectedHabit)} disabled={selectedHabit.completed}><span><b>{selectedHabit.completed ? 'Completed today' : 'Complete today'}</b><small>{selectedHabit.gateway}</small></span></button><button type="button" className="logging-quick-action" onClick={() => void recordHabitEvent(selectedHabit, 'ACTION_COMPLETED')}><span><b>Record an extra action</b><small>For another action today</small></span></button></div> : <div className="logging-quick-actions">
              <button type="button" className="logging-quick-action craving" onClick={() => quickLog('craving')}><span className="logging-action-icon"><Icon name="spark" size={20}/></span><span><b>Craving</b><small>Save an unresolved urge</small></span><Icon name="plus" size={18}/></button>
              <button type="button" className="logging-quick-action occurrence" onClick={() => quickLog('habit_occurrence')}><span className="logging-action-icon"><Icon name="arrow-up-right" size={20}/></span><span><b>{occurrenceActionLabel(selectedHabit)}</b><small>One {occurrenceUnit} by default</small></span><Icon name="plus" size={18}/></button>
              <button type="button" className="logging-quick-action technique" onClick={() => quickLog('technique_applied')}><span className="logging-action-icon"><Icon name="check" size={20}/></span><span><b>Used a technique</b><small>Choose from your strategy</small></span><Icon name="plus" size={18}/></button>
            </div>}
            {selectedHabit.kind === 'BREAK' && cueCaptureLog && <form className="logging-cue-capture" onSubmit={saveCueCapture}>
              <div className="logging-form-head"><div><span className="eyebrow">Urge episode check-in</span><h2>What was happening when the urge started?</h2></div><button type="button" className="text-button" onClick={dismissCueCapture}>Close</button></div>
              <p className="logging-cue-time">Time recorded automatically: <time dateTime={cueCaptureLog.at}>{formatTime(cueCaptureLog.at, cueCaptureLog.timezone)}</time></p>
              <div className="logging-cue-grid">
                <label className="logging-field">Where were you?<input value={cueLocation} onChange={event => setCueLocation(event.target.value)} placeholder="At my desk, in the car"/></label>
                <label className="logging-field">How were you feeling?<input value={cueEmotion} onChange={event => setCueEmotion(event.target.value)} placeholder="Bored, stressed, tired"/></label>
                <label className="logging-field">Who was around?<input value={cuePeople} onChange={event => setCuePeople(event.target.value)} placeholder="Alone, with coworkers"/></label>
                <label className="logging-field">What did you do right before?<input value={cuePrecedingAction} onChange={event => setCuePrecedingAction(event.target.value)} placeholder="Finished lunch, closed my laptop"/></label>
              </div>
              <fieldset className="logging-choice-field"><legend>What is your physical energy or bodily state right now?</legend><div className="logging-choice-options">{bodilyStateOptions.map(([value, label]) => <button key={value} type="button" className={cueBodilyState === value ? 'selected' : ''} aria-pressed={cueBodilyState === value} onClick={() => setCueBodilyState(cueBodilyState === value ? '' : value)}>{label}</button>)}</div></fieldset>
              <fieldset className="logging-choice-field"><legend>How close or accessible is the habit right now?</legend><div className="logging-choice-options">{accessibilityOptions.map(([value, label]) => <button key={value} type="button" className={cueAccessibility === value ? 'selected' : ''} aria-pressed={cueAccessibility === value} onClick={() => setCueAccessibility(cueAccessibility === value ? '' : value)}>{label}</button>)}</div></fieldset>
              <fieldset className="logging-choice-field logging-motive-field"><legend>What change in feeling were you hoping the habit would give you?</legend><small>Choose up to two. This is optional.</small><div className="logging-choice-options">{motiveOptions.map(([value, label]) => <button key={value} type="button" className={cueMotives.includes(value) ? 'selected' : ''} aria-pressed={cueMotives.includes(value)} onClick={() => setCueMotives(current => current.includes(value) ? current.filter(item => item !== value) : value === 'unsure' ? ['unsure'] : current.includes('unsure') ? [value] : current.length < 2 ? [...current, value] : current)}>{label}</button>)}</div></fieldset>
              <div className="logging-form-actions"><button type="submit" className="primary-button logging-submit"><Icon name="check" size={16}/>Save cue details</button><button type="button" className="text-button" onClick={dismissCueCapture}>Skip for now</button></div>
              <small className="logging-cue-note">Time is saved automatically. These details are optional and can be added later.</small>
            </form>}
            {dueUrgeFollowUp && <section className="logging-follow-up-card" aria-labelledby="urge-follow-up-title"><div><span className="eyebrow">15-minute check-in</span><h3 id="urge-follow-up-title">Did the urge stay gone, or did it linger or return?</h3><p>This helps you see whether your response met the need.</p></div><div className="logging-choice-options"><button type="button" onClick={() => answerUrgeFollowUp(dueUrgeFollowUp.id, 'stayed_gone')}>It stayed gone</button><button type="button" onClick={() => answerUrgeFollowUp(dueUrgeFollowUp.id, 'lingering_or_returned')}>It lingered or returned</button><button type="button" className="quiet-choice" onClick={() => answerUrgeFollowUp(dueUrgeFollowUp.id, 'skipped')}>Skip</button></div><small>Saved here and shown when due or next time you open Habitly.</small></section>}
            {pendingEngagementCheck && <section className="logging-follow-up-card" aria-labelledby="engagement-check-title"><div><span className="eyebrow">Optional follow-up</span><h3 id="engagement-check-title">Did it feel as satisfying as you expected?</h3><p>Your answer helps compare the urge with what happened afterward.</p></div><div className="logging-choice-options"><button type="button" onClick={() => answerPostEngagement(pendingEngagementCheck.id, 'worse_than_expected')}>Less satisfying than expected</button><button type="button" onClick={() => answerPostEngagement(pendingEngagementCheck.id, 'neutral')}>About as expected or neutral</button><button type="button" onClick={() => answerPostEngagement(pendingEngagementCheck.id, 'as_expected')}>As satisfying as expected</button><button type="button" className="quiet-choice" onClick={() => answerPostEngagement(pendingEngagementCheck.id, 'skipped')}>Skip</button></div></section>}
            <p className="logging-cue-progress" role="status"><b>Cue observations: {cuePattern.observationDays} of {insightKeys.length} days</b><span>{cuePattern.observationDays >= Math.min(3, insightKeys.length) ? 'Review the pattern in Insights.' : `Log urges on ${Math.min(3, insightKeys.length)} different days in this selected period to begin spotting a pattern.`}</span></p>
            {hydrated && (notificationsEnabled ? <p className="logging-reminder-note">Browser reminders are on while Habitly is open. Unanswered check-ins remain here for your next visit.</p> : <button type="button" className="logging-reminder-enable" onClick={enableBrowserReminders}>Enable browser reminders for 15-minute check-ins</button>)}
            {recentSavedLogId && recentSavedLogId !== quickCueCaptureLogId && <p className="logging-save-confirmation" role="status"><Icon name="check" size={16}/> Saved just now. <button type="button" onClick={() => { const saved = behaviorLogs.find(log => log.id === recentSavedLogId); if (saved) editBehaviorLog(saved); }}>Add details or change outcome</button></p>}
          </section>
          {selectedHabit.kind === 'BREAK' && <section className="logging-confirm-card">
            <div><span className="eyebrow">Optional daily confirmation</span><h2>Confirm today’s record</h2><p>Only confirmed days count as habit free. You can change this later.</p></div>
            <div className="logging-confirm-actions" role="group" aria-label="Daily habit confirmation">
              {([
                ['no_occurrence', 'No ' + (isSmoke ? 'smoking' : selectedHabit.name)],
                ['occurred_recorded', 'Occurred, logged'],
                ['incomplete', 'Records incomplete'],
                ['skip', 'Skip today'],
              ] as [DailyConfirmationStatus, string][]).map(([status, title]) => <button key={status} type="button" className={currentConfirmation?.status === status ? 'selected' : ''} aria-pressed={currentConfirmation?.status === status} onClick={() => saveDailyConfirmation(status)}>{title}</button>)}
            </div>
            {todaySummary.conflict && <p className="logging-conflict" role="alert">Your {currentConfirmation?.status === 'no_occurrence' ? 'no occurrence' : 'occurred and recorded'} confirmation conflicts with {todaySummary.occurrenceEvents} logged occurrence events. Correct either record above.</p>}
          </section>}
          <div className="logging-quick-footer">
            <button type="button" className="text-button" aria-expanded={logFormOpen} onClick={() => setLogFormOpen(value => !value)}>{logFormOpen ? 'Hide entry details' : 'Add context, backdate, or edit an entry'} <Icon name="chevron" size={14}/></button>
            <details className="logging-tag-manager"><summary>Manage custom context tags <span>{customContextTags.length}</span></summary><div><label>New tag<input aria-label="New custom context tag" value={customTagDraft} onChange={event => setCustomTagDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustomContextTag(); } }} placeholder="e.g. after a long commute"/></label><button type="button" className="secondary-button" onClick={addCustomContextTag}>Add tag</button><div className="logging-custom-tags">{customContextTags.map(tag => <button type="button" key={tag} onClick={() => setCustomContextTags(current => current.filter(item => item !== tag))} aria-label={'Remove custom tag ' + tag}>{tag}<span aria-hidden="true">×</span></button>)}</div></div></details>
          </div>
          {logFormOpen && <form className="logging-form logging-advanced-form" onSubmit={saveBehaviorLog}>
            <div className="logging-form-head"><div><span className="eyebrow">{editingLogId ? 'Edit entry' : 'Optional details'}</span><h2>{editingLogId ? 'Correct this event' : 'Add detail if useful'}</h2></div><button type="button" className="text-button" onClick={resetBehaviorDraft}>Close</button></div>
            <div className="logging-type-tabs" role="group" aria-label="Choose event type">{([{ id: 'craving', title: 'Craving', icon: 'spark' }, { id: 'habit_occurrence', title: occurrenceActionLabel(selectedHabit), icon: 'arrow-up-right' }, { id: 'technique_applied', title: 'Technique', icon: 'check' }] as const).map(item => <button type="button" key={item.id} className={logType === item.id ? 'selected' : ''} aria-pressed={logType === item.id} onClick={() => { setLogType(item.id); setLogOutcome('pending'); }}><Icon name={item.icon} size={17}/><span>{item.title}</span></button>)}</div>
            <label className="logging-field">Trigger <span>Optional</span><input list="behavior-triggers" value={logTrigger} onChange={event => setLogTrigger(event.target.value)} placeholder="What was happening?"/><datalist id="behavior-triggers">{['After eating', 'Stress', 'Boredom', 'Coffee', 'Waking up', 'Social break', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label>
            {logType === 'craving' && <div className="logging-field-row"><label className="logging-field">Craving intensity <span>Optional · 0 to 10</span><input type="number" min="0" max="10" value={logIntensity} onChange={event => setLogIntensity(event.target.value)} placeholder="Not recorded"/></label><label className="logging-field">Outcome<select value={logOutcome ?? 'pending'} onChange={event => setLogOutcome(event.target.value as BehaviorLog['outcome'])}><option value="pending">Still experiencing it</option><option value="resisted">Resisted without engaging</option><option value="smoked">{isSmoke ? 'Smoked' : 'Engaged in the habit'}</option></select></label></div>}{logType === 'craving' && logOutcome !== 'pending' && <label className="logging-field">Resolution time <span>Optional · leave empty if unknown</span><input type="datetime-local" value={logResolvedTimestamp} onChange={event => setLogResolvedTimestamp(event.target.value)}/><small>Used for time to resolution only when you know when the craving ended.</small></label>}
            {logType === 'craving' && <label className="logging-field">Replacement action <span>Optional</span><input value={logReplacement} onChange={event => setLogReplacement(event.target.value)} placeholder="What did you try instead?"/></label>}
            {logType === 'habit_occurrence' && <label className="logging-field">{isSmoke ? 'Cigarettes' : 'Quantity'}<span>Default 1</span><input type="number" min="1" max="100" value={logQuantity} onChange={event => setLogQuantity(Number(event.target.value))}/></label>}
            {logType === 'technique_applied' && <><label className="logging-field">Strategy technique<select aria-label="Choose a technique from this habit strategy" value={selectedTechniqueKey} onChange={event => { const choice = techniqueChoices.find(item => item.key === event.target.value); setLogTechniqueId(choice?.techniqueId ?? ''); setLogVariationId(choice?.variationId ?? ''); setLogTechnique(choice?.name ?? ''); }}><option value="">Choose a configured technique</option>{techniqueChoices.map(choice => <option key={choice.key} value={choice.key}>{choice.name} · {choice.laws.map(id => lawGroups.find(law => law.id === id)?.break).filter(Boolean).join(', ')}</option>)}{editingLogId && logTechnique && !techniqueChoices.some(item => item.key === selectedTechniqueKey) && <option value={selectedTechniqueKey}>{logTechnique} · historical technique</option>}</select>{!techniqueChoices.length && <small>Configure techniques under this habit’s strategy before logging an application.</small>}</label><div className="logging-field-row"><label className="logging-field">When was it used?<select value={logTiming} onChange={event => setLogTiming(event.target.value as 'preventive' | 'responsive')}><option value="responsive">During a craving or event</option><option value="preventive">Before a craving or risk</option></select></label><label className="logging-field">Craving intensity <span>Optional</span><input type="number" min="0" max="10" value={logIntensity} onChange={event => setLogIntensity(event.target.value)} placeholder="Not recorded"/></label></div></>}
            <label className="logging-field">Related episode <span>Optional · leave auto to link a recent open craving</span><select value={logEpisodeId} onChange={event => setLogEpisodeId(event.target.value)}><option value="">Auto link or start a new episode</option><option value="__new__">Start a new episode</option>{configuredOpenEpisodes.map(id => { const episodeEvent = logs.find(log => log.episodeId === id); return <option key={id} value={id}>Existing episode · {episodeEvent?.trigger || formatTime(episodeEvent?.at ?? new Date().toISOString(), episodeEvent?.timezone)}</option>; })}</select></label>
            <details className="logging-advanced-context"><summary>Add optional context</summary><div className="logging-context-grid"><label className="logging-field">Emotion<input list="emotion-tags" value={logEmotions} onChange={event => setLogEmotions(event.target.value)} placeholder="Stressed, bored"/><datalist id="emotion-tags">{['Stressed', 'Anxious', 'Bored', 'Sad', 'Angry', 'Excited', 'Relaxed', 'Frustrated', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label><label className="logging-field">Environment<input list="environment-tags" value={logEnvironments} onChange={event => setLogEnvironments(event.target.value)} placeholder="At home, in the car"/><datalist id="environment-tags">{['At home', 'At work', 'Outside', 'In the car', 'Social gathering', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label><label className="logging-field">Activity<input list="activity-tags" value={logActivities} onChange={event => setLogActivities(event.target.value)} placeholder="Coffee, after a meal"/><datalist id="activity-tags">{['Working', 'Scrolling', 'Drinking coffee', 'Finishing a meal', 'Watching television', 'Walking', 'Resting', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label><label className="logging-field">Social situation<input list="social-tags" value={logSocial} onChange={event => setLogSocial(event.target.value)} placeholder="Alone, with friends"/><datalist id="social-tags">{['Alone', 'With friends', 'With family', 'Around people engaging in the habit', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label><label className="logging-field">Physical state<select value={logBodilyState} onChange={event => setLogBodilyState(event.target.value)}><option value="">Not recorded</option>{bodilyStateOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="logging-field">Access to the habit<select value={logAccessibility} onChange={event => setLogAccessibility(event.target.value)}><option value="">Not recorded</option>{accessibilityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="logging-field">Other tags <span>Separate with commas</span><input value={logContextTags} onChange={event => setLogContextTags(event.target.value)} placeholder="Custom context"/></label><fieldset className="logging-choice-field logging-motive-field"><legend>What change in feeling was your brain looking for?</legend><small>Choose up to two. This is optional.</small><div className="logging-choice-options">{motiveOptions.map(([value, label]) => <button key={value} type="button" className={logMotives.includes(value) ? 'selected' : ''} aria-pressed={logMotives.includes(value)} onClick={() => setLogMotives(current => current.includes(value) ? current.filter(item => item !== value) : value === 'unsure' ? ['unsure'] : current.includes('unsure') ? [value] : current.length < 2 ? [...current, value] : current)}>{label}</button>)}</div></fieldset></div></details>
            <details className="logging-advanced-context"><summary>Mindset notes <span>optional</span></summary><div className="logging-context-grid"><label className="logging-field">Automatic thought<input value={logAutomaticThought} onChange={event => setLogAutomaticThought(event.target.value)} placeholder="What went through your mind?"/></label><label className="logging-field">Belief<input value={logBelief} onChange={event => setLogBelief(event.target.value)} placeholder="What did it seem to promise?"/></label><label className="logging-field">Confidence resisting <span>0 To 10</span><input type="number" min="0" max="10" value={logConfidence} onChange={event => setLogConfidence(event.target.value)} placeholder="Not recorded"/></label><label className="logging-field">Reframing used<input value={logReframing} onChange={event => setLogReframing(event.target.value)} placeholder="Optional cognitive reframe"/></label><label className="logging-field">Intensity after technique <span>0 To 10</span><input type="number" min="0" max="10" value={logIntensityAfter} onChange={event => setLogIntensityAfter(event.target.value)} placeholder="Not recorded"/></label></div></details>
            <label className="logging-field">Notes <span>Optional</span><textarea value={logNote} onChange={event => setLogNote(event.target.value)} placeholder="Anything you want to remember" rows={2}/></label>
            <details className="logging-backdate" open={Boolean(editingLogId)}><summary>{editingLogId ? 'Date and time' : 'Log a past event'}</summary><label className="logging-field">Date and time<input type="datetime-local" value={logTimestamp} onChange={event => setLogTimestamp(event.target.value)}/></label><small>Leave blank to use the current time. Day grouping uses the recorded local date and timezone.</small></details>
            <div className="logging-form-actions"><button className="primary-button logging-submit" type="submit"><Icon name={editingLogId ? 'check' : 'plus'} size={17}/>{editingLogId ? 'Save changes' : 'Save entry'}</button>{editingLogId && <button type="button" className="text-button" onClick={resetBehaviorDraft}>Cancel edit</button>}</div>
            <p className="logging-privacy">Unknown outcomes stay unknown. A missing log is never treated as abstinence.</p>
          </form>}
        </>}
        {loggingView === 'Insights' && selectedHabit.kind === 'BUILD' && <section className="calendar-card"><div className="calendar-heading"><div><span className="eyebrow">Last 28 days</span><h2>{selectedHabit.name}</h2><p>{completedDays} of 28 active days completed. {unknownDays} days have no status and remain unconfirmed.</p></div><strong>{Math.round(completedDays / 28 * 100)}%</strong></div><div className="activity-calendar">{buildDays.map(day => <div key={day.day} title={`${day.day}: ${day.status}`} aria-label={`${day.day}: ${day.status}`} className={`activity-cell ${day.status === 'completed' ? 'activity-done' : day.status === 'missed' ? 'activity-missed' : ''}`}><span>{Number(day.day.slice(-2))}</span></div>)}</div><p>Consistency rate counts completed days over the full 28-day window. Unrecorded days are not treated as completed.</p><div className="logging-follow-up-metrics"><article><span className="eyebrow">Next-day rebound</span><b>{missOpportunities.length ? `${Math.round(nextDayRebounds / missOpportunities.length * 100)}%` : 'No miss opportunities'}</b><p>{nextDayRebounds} next-day returns of {missOpportunities.length} misses followed by a recorded day.</p></article></div></section>}
        {loggingView === 'Insights' && selectedHabit.kind === 'BREAK' && <div className="logging-insights-page">
          <div className="logging-insight-toolbar">
            <label className="logging-period-picker">Period<select aria-label="Insights period" value={insightFrom || insightTo ? 'custom' : insightDays} onChange={event => { setInsightDays(event.target.value === '24h' ? '24h' : event.target.value === 'all' ? 'all' : Number(event.target.value)); setInsightFrom(''); setInsightTo(''); }}><option value="24h">24 hours</option>{(insightFrom || insightTo) && <option value="custom" disabled>Custom date range</option>}<option value="all">All time</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
            <details className="logging-insight-filter-disclosure">
              <summary><Icon name="chevron" size={15}/> Advanced filters <span>{[insightFrom || insightTo, insightLawFilter !== 'all', insightTriggerFilter !== 'all', insightIntensityFilter !== 'all', insightTimingFilter !== 'all'].filter(Boolean).length ? 'Active' : 'None active'}</span></summary>
              <div className="logging-insight-filter-fields">
                <p className="logging-filter-scope">Dates change the analytics period. Law, trigger, intensity, and use narrow technique results.</p>
                <label className="logging-date-field">From<input aria-label="Custom insights start date" type="date" value={insightFrom} onChange={event => setInsightFrom(event.target.value)}/></label>
                <label className="logging-date-field">To<input aria-label="Custom insights end date" type="date" value={insightTo} onChange={event => setInsightTo(event.target.value)}/></label>
                <label>Law<select aria-label="Filter technique applications by law" value={insightLawFilter} onChange={event => setInsightLawFilter(event.target.value)}><option value="all">All laws</option>{lawGroups.slice(0, 4).map(item => <option key={item.id} value={item.id}>{item.break}</option>)}</select></label>
                <label>Trigger<select aria-label="Filter technique applications by trigger" value={insightTriggerFilter} onChange={event => setInsightTriggerFilter(event.target.value)}><option value="all">All triggers</option>{allTriggers.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label>Intensity<select aria-label="Filter technique applications by craving intensity" value={insightIntensityFilter} onChange={event => setInsightIntensityFilter(event.target.value)}><option value="all">All intensities</option><option value="low">0 to 3</option><option value="medium">4 to 6</option><option value="high">7 to 10</option><option value="unknown">Not recorded</option></select></label>
                <label>Use<select aria-label="Filter preventive or responsive technique use" value={insightTimingFilter} onChange={event => setInsightTimingFilter(event.target.value)}><option value="all">All applications</option><option value="responsive">Responsive</option><option value="preventive">Preventive</option></select></label>
              </div>
            </details>
            <span className="logging-quality-pill" title="Descriptive evidence is based only on records in the selected period and the outcomes you entered">{rating}</span>
          </div>
          <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">Replacement routines</span><h2>Replacement success</h2></div></div><p>{resolvedCravings.filter(log => Boolean(log.replacementAction) && getOutcome(log) === 'resisted').length} of {resolvedCravings.length} resolved urges were resisted with a replacement recorded{resolvedCravings.length ? ` (${Math.round(resolvedCravings.filter(log => Boolean(log.replacementAction) && getOutcome(log) === 'resisted').length / resolvedCravings.length * 100)}%)` : ''}.</p><small>This is a descriptive association in your logs. Unresolved urges are excluded, and it does not establish that the replacement caused the outcome.</small></section>
          <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">01 · {periodEyebrow} · Overview</span><h2>Period Check-in</h2></div><span className="logging-date-pill">{periodRangeText}</span></div><PeriodCheckin habitName={selectedHabit.name} isSmoking={isSmoke} periodLabel={periodLabel} current={currentPeriod} previous={previousPeriod} configuredTechniques={configured.size} techniqueApplicationCount={techniqueApplicationLogs.length} hasTechniqueFilters={hasTechniqueFilters} usedTechniques={techniquePractice.techniques} topTrigger={topTriggers[0] ? { name: topTriggers[0][0], count: topTriggers[0][1] } : undefined}/></section>
          <section className="logging-insight-section logging-cue-insight">
            <div className="logging-section-heading"><div><span className="eyebrow">Cue observation · {periodEyebrow}</span><h2>What tends to come before the urge?</h2></div><span className="logging-quality-pill">{cuePattern.observationDays} of {insightKeys.length} days with cravings</span></div>
            <p className="logging-cue-insight-intro">{cuePattern.cravings} {cuePattern.cravings === 1 ? 'urge' : 'urges'} logged during the selected {periodLabel}. The cards show every recorded value; blank details stay unknown.</p>
            <div className="logging-cue-pattern-grid">{cuePattern.patterns.map(pattern => <article key={pattern.dimension}>
              <span className="eyebrow">{pattern.dimension}</span>
              {pattern.values.length
                ? <><div className="logging-cue-pattern-values">{pattern.values.map(entry => <div key={entry.value}><b>{entry.value}</b><small>{entry.count} of {pattern.recorded} entries · {entry.days} {entry.days === 1 ? 'day' : 'days'}</small></div>)}</div><p>Recorded in {pattern.recorded} {pattern.recorded === 1 ? 'entry' : 'entries'} total.</p></>
                : <p>No {pattern.dimension.toLocaleLowerCase()} detail was recorded in this window.</p>}
            </article>)}</div>
            {cuePattern.observationDays < Math.min(3, insightKeys.length) && <p className="logging-cue-insight-prompt">Early summary from {cuePattern.observationDays} observed days in this period. More entries can make patterns easier to read.</p>}
            <p className="logging-cue-method-note">These summaries describe what appears in your entries. They do not show that a cue caused an urge.</p>
          </section>
          <section className="logging-insight-section logging-follow-up-insights">
            <div className="logging-section-heading"><div><span className="eyebrow">Check-in outcomes · {periodEyebrow}</span><h2>What happened after the urge?</h2></div></div>
            <div className="logging-follow-up-metrics">
              <article><span className="eyebrow">15-minute check-in</span><b>{urgeCheckIns.stayedGone} stayed gone</b><p>of {urgeCheckIns.answered} answered · {urgeCheckIns.lingeringOrReturned} lingered or returned</p><small>{urgeCheckIns.awaiting} awaiting · {urgeCheckIns.skipped} skipped · {urgeCheckIns.scheduled} scheduled</small></article>
              <article><span className="eyebrow">Satisfaction after engaging</span><b>{urgeCheckIns.satisfactionAnswered} of {urgeCheckIns.engaged} answered</b><p>{urgeCheckIns.satisfactionWorse} less than expected · {urgeCheckIns.satisfactionNeutral} neutral · {urgeCheckIns.satisfactionAsExpected} as expected</p><small>{urgeCheckIns.satisfactionAwaiting} awaiting · {urgeCheckIns.satisfactionSkipped} skipped</small></article>
            </div>
            <p className="logging-caveat">These counts describe the check-ins you completed. A skipped or unanswered question is not counted as an outcome.</p>
          </section>
          <section className="logging-insight-section logging-review-card logging-behavior-insights">
            <div className="logging-section-heading">
              <div><span className="eyebrow">02 · {periodEyebrow} · Behavioral insights</span><h2>Your Behavioral Insights</h2></div>
            </div>
            <div className="logging-behavior-summary">
              <article>
                <span className="eyebrow">Most common trigger</span>
                {commonTrigger
                  ? <><b>{commonTrigger.name}</b><p>Appeared in {commonTrigger.appearances} logged {commonTrigger.appearances === 1 ? 'entry' : 'entries'} during the selected {periodLabel}.</p></>
                  : <p>No trigger was logged during the selected {periodLabel}.</p>}
              </article>
              <article>
                <span className="eyebrow">Most practiced technique</span>
                {mostPracticed
                  ? <><b>{mostPracticed.name}</b><p>{mostPracticed.applications} {mostPracticed.applications === 1 ? 'use' : 'uses'} during the selected {periodLabel}.</p>{(() => {
                      const choice = metadataChoices.find(candidate => candidate.name === mostPracticed.name);
                      const laws = choice?.laws ?? [];
                      const label = laws.map(id => insightLaws.find(law => law.id === id)?.break).filter(Boolean).join(', ');
                      return <>{label && <small>{label}</small>}{choice?.detail && <small className="logging-technique-detail">{choice.detail}</small>}</>;
                    })()}</>
                  : <p>No technique applications were recorded during the selected {periodLabel}{hasTechniqueFilters ? ' with these filters' : ''}.</p>}
              </article>
            </div>
            <article className="logging-recommendation">
              <span className="eyebrow">Suggested experiment</span>
              <b>{suggestedExperiment.technique ? `Test ${suggestedExperiment.technique.name}` : suggestedExperiment.trigger ? `Build a strategy for ${suggestedExperiment.trigger.name}` : 'Keep recording the pattern'}</b>
              <p>{suggestedExperiment.action}</p>
              {suggestedExperiment.untestedForTrigger && <small className="logging-experiment-status">Untested in this period</small>}
              <button type="button" className="text-button" onClick={() => suggestedExperiment.technique
                ? openTechniqueInStrategy(suggestedExperiment.technique.techniqueId, suggestedExperiment.technique.variationId)
                : openStrategyPage()}>
                {suggestedExperiment.technique ? 'Review this technique' : 'Open Strategy'} <Icon name="arrow" size={14}/>
              </button>
            </article>
          </section>
          <section className="logging-insight-section logging-strategy-insights">
            <div className="logging-section-heading">
              <div><span className="eyebrow">03 · {periodEyebrow} · Four reverse laws</span><h2>What’s Working?</h2></div>
              <button type="button" className="text-button" onClick={openStrategyPage}>Open strategy <Icon name="arrow" size={14}/></button>
            </div>
            <div className="logging-law-overview">
              <div className="logging-law-overview-heading">
                <b>{techniquePractice.lawCounts.filter(item => item.count > 0).length} of {insightLaws.length} laws practiced</b>
                <small>Distinct techniques used during the selected {periodLabel}{hasTechniqueFilters ? ' with these filters' : ''}</small>
              </div>
              <div className="logging-law-overview-grid">
                {insightLaws.map((law, index) => <div key={law.id}>
                  <span>{law.break}</span>
                  <b>{techniquePractice.lawCounts[index]?.count ?? 0}</b>
                  <small>{(techniquePractice.lawCounts[index]?.count ?? 0) === 1 ? 'technique practiced' : 'techniques practiced'}</small>
                </div>)}
              </div>
            </div>
            <div className="logging-method-note">
              <details><summary>How to read these outcomes</summary><p>Techniques linked to the same episode share its recorded outcome. Counts describe associations and do not show that a technique caused an outcome. Unknown outcomes are excluded from resolved counts.</p></details>
            </div>
            <div className="logging-technique-cards">
              {techniquePractice.techniques.length
                ? techniquePractice.techniques.map(item => {
                    const lawLabel = item.laws.map(id => insightLaws.find(law => law.id === id)?.break).filter(Boolean).join(', ') || 'Law not recorded';
                    const outcomeText = item.resolved
                      ? `${item.resisted} of ${item.resolved} resolved episodes ended without ${isSmoke ? 'smoking' : 'engaging in the habit'}.`
                      : 'No resolved responsive outcomes yet.';
                    const triggers = item.triggers;
                    return <details className="logging-technique-card" key={item.key}>
                      <summary>
                        <span className="logging-technique-card-title"><b>{item.name}</b><small>{lawLabel}</small>{item.detail && <small className="logging-technique-detail">{item.detail}</small>}</span>
                        <span className="logging-technique-effectiveness"><b>{outcomeText}</b><small>{item.resolved < 5 ? 'Limited evidence' : 'Descriptive association'}</small></span>
                        <Icon name="chevron" size={16}/>
                      </summary>
                      <div className="logging-technique-card-body">
                        <div className="logging-technique-card-metrics">
                          <div><span>Total applications</span><b>{item.total}</b></div>
                          <div><span>Preventive applications</span><b>{item.preventive}</b><small>Across {item.preventiveDays} {item.preventiveDays === 1 ? 'day' : 'days'}</small></div>
                          <div><span>Responsive applications</span><b>{item.responsive}</b><small>During a craving or event</small></div>
                          <div><span>Resolved responsive episodes</span><b>{item.resolved}</b><small>{item.unknown} unresolved or unknown</small></div>
                          <div><span>Recorded outcomes</span><b>{item.resisted} without the habit · {item.engaged} with the habit</b><small>Shared episode outcomes, not exclusive credit</small></div>
                          <div><span>Occurrences on preventive days</span><b>{item.occurrencesOnPreventiveDays}</b><small>Descriptive count across {item.preventiveDays} days</small></div>
                        </div>
                        <div className="logging-technique-triggers">
                          <b>Associated triggers</b>
                          {triggers.length
                            ? <div>{triggers.map(([trigger, count]) => <span key={trigger}>{trigger}<small>{count} {count === 1 ? 'application' : 'applications'}</small></span>)}</div>
                            : <p>No trigger was linked to this technique in the selected period.</p>}
                        </div>
                        <div className="logging-technique-triggers">
                          <b>Recorded context</b>
                          {item.contexts.length
                            ? <div>{item.contexts.map(context => <span key={context}>{context}</span>)}</div>
                            : <p>No additional context was recorded for these applications.</p>}
                        </div>
                        <p className="logging-technique-period">Selected period: {periodRangeText}</p>
                        <button type="button" className="text-button" onClick={() => item.configured
                          ? openTechniqueInStrategy(item.techniqueId, item.variationId)
                          : openStrategyPage()}>
                          {item.configured ? 'Review on strategy page' : 'View strategy'} <Icon name="arrow" size={14}/>
                        </button>
                      </div>
                    </details>;
                  })
                : <p className="logging-empty-hint">No technique applications matched this period and its filters.</p>}
            </div>
            <div className="logging-strategy-gap">
              <div><span className="eyebrow">{strategyGap.title}</span><p>{strategyGap.description}</p></div>
              <button type="button" className="text-button" onClick={openStrategyPage}>Improve Strategy <Icon name="arrow" size={14}/></button>
            </div>
          </section>
          <div className="logging-insight-grid">
            <section className="logging-insight-section" id="logging-trigger-analytics"><div className="logging-section-heading"><div><span className="eyebrow">04 · {periodEyebrow} · Triggers</span><h2>Common triggers</h2></div></div>{triggerStats.length ? <div className="logging-trigger-list">{triggerStats.map(item => <div key={item.name} className="logging-trigger-analysis"><span>{item.name}</span><b>{item.count} logged · {item.episodes} episodes</b><i><em style={{ width: Math.max(8, item.count / Math.max(1, triggerStats[0]?.count ?? 1) * 100) + '%' }}/></i><small>{item.resolved ? item.resisted + '/' + item.resolved + ' resolved episodes resisted' : 'No resolved outcomes yet'}{item.resolved < 5 ? ' · limited observations' : ''}</small></div>)}</div> : <p className="logging-empty-hint">Add triggers to see their logged frequency and associated outcomes.</p>}<p className="logging-caveat">Counts show how often a trigger was recorded. Associated outcomes are descriptive, not causal.</p></section>
          <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">05 · {periodEyebrow} · Outcome trend</span><h2>{isSmoke ? 'Cigarette quantity trend' : 'Habit occurrence trend'}</h2></div><span className="logging-chart-note">{isHourlyWindow ? 'No event in an hour is not a confirmed zero' : 'No record is unknown'}</span></div><div className="logging-bars-scroll"><div className="logging-bars logging-bars-wide" role="img" aria-label={(isSmoke ? 'Cigarette quantities' : 'Habit occurrences') + (isHourlyWindow ? ' by hour over the past 24 hours.' : monthlyBuckets ? ' summarized by calendar month. Days without an occurrence record remain unknown.' : ' logged by local day. Unconfirmed days without an occurrence record are shown as unknown.')} style={{ minWidth: Math.max(320, periodBuckets.length * 25) + 'px' }}>{periodBuckets.map(bucket => { const value = isSmoke ? bucket.summary.quantity : bucket.summary.occurrenceEvents; const occurrenceKnown = Boolean(bucket.summary.knownOccurrenceCount); const quantityKnown = Boolean(bucket.summary.quantityKnown); const unquantifiedLegacy = isSmoke && bucket.summary.legacyOccurrences > 0 && !quantityKnown; const known = isSmoke ? quantityKnown : occurrenceKnown; const height = unquantifiedLegacy ? Math.max(8, Math.max(bucket.summary.legacyOccurrences, value) / maxOccurrence * 100) : value ? Math.max(8, value / maxOccurrence * 100) : known ? 4 : 3; const display = unquantifiedLegacy ? '?' : known ? value : '·'; const detail = unquantifiedLegacy ? `${bucket.summary.legacyOccurrences} older “Old behavior” episode${bucket.summary.legacyOccurrences === 1 ? '' : 's'}; cigarette quantity not recorded${value ? `; ${value} cigarettes also recorded` : ''}` : isSmoke ? quantityKnown ? `${value} cigarettes recorded or confirmed` : 'cigarette quantity not confirmed' : occurrenceKnown ? `${value} occurrences logged or confirmed` : 'no occurrence record'; const classes = ['logging-bar-day', !known && !unquantifiedLegacy ? 'unknown' : '', unquantifiedLegacy ? 'quantity-unknown' : ''].filter(Boolean).join(' '); return <div className={classes} key={bucket.key} title={`${bucket.detail}: ${detail}`}><span>{display}</span><i style={{ height: height + '%' }}/><small>{bucket.label}</small></div>; })}</div></div><div className="logging-legend">{isSmoke ? <><span><i/> Cigarette quantity recorded or confirmed</span><span><i className="legacy-quantity-marker"/> Older “Old behavior” episode, quantity unknown</span><span><i/> No occurrence data</span></> : <><span><i/> {isHourlyWindow ? 'Occurrence logged' : 'Logged or explicitly confirmed'}</span><span><i/> No occurrence data</span></>}</div><p className="logging-caveat">{isSmoke && currentPeriod.legacyOccurrences > 0 ? 'Older “Old behavior” check-ins are counted as smoking episodes. They do not include cigarette quantities.' : isHourlyWindow ? 'An hour without an occurrence record is not confirmed as zero.' : 'Confirmed no occurrence days require an explicit daily confirmation. Days without an occurrence entry are not counted as zero.'}</p></section>
            <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">06 · {periodEyebrow} · Craving analysis</span><h2>Cravings logged</h2></div></div><div className="logging-bars-scroll"><div className="logging-bars logging-bars-wide" role="img" aria-label={isHourlyWindow ? "Number of cravings logged in each hour of the past 24 hours." : monthlyBuckets ? "Number of cravings logged by calendar month. Counts describe logging activity." : "Number of cravings logged each local day. Counts describe logging activity."} style={{ minWidth: Math.max(320, periodBuckets.length * 25) + 'px' }}>{periodBuckets.map(bucket => { const value = bucket.summary.cravings; return <div className="logging-bar-day" key={bucket.key} title={bucket.detail + ': ' + value + ' craving logs'}><span>{value}</span><i style={{ height: (value ? Math.max(8, value / maxCravings * 100) : 4) + '%' }}/><small>{bucket.label}</small></div>; })}</div></div><div className="logging-stat-grid compact"><div><b>{rangeCravings.length}</b><span>cravings logged in period</span></div><div><b>{avgIntensity}</b><span>average recorded intensity</span></div><div><b>{resolvedCravings.length}</b><span>known outcomes</span></div><div><b>{rangeCravings.length - resolvedCravings.length}</b><span>unresolved or unknown</span></div><div><b>{averageResolutionMinutes === '—' ? '—' : averageResolutionMinutes + ' min'}</b><span>average time to resolution when recorded · {resolutionMinutes.length} episodes</span></div></div><div className="logging-intensity-distribution"><b>Recorded intensity distribution</b>{intensityDistribution.map(item => <span key={item.label}>{item.label}/10 <i>{item.count}</i></span>)}</div><p className="logging-caveat">Fewer logged cravings do not show that cravings decreased when logging completeness is unknown.</p></section>
            <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">07 · {periodEyebrow} · Time patterns</span><h2>When events are logged</h2></div></div><div className="logging-time-blocks">{occurrenceBins.map(bin => <div key={bin.name}><b>{bin.count} occurrences</b><span>{bin.name}</span><small>{cravingBins.find(item => item.name === bin.name)?.count ?? 0} cravings</small></div>)}</div><div className="logging-hour-grid" role="img" aria-label="Hourly logged habit occurrence and craving event counts from midnight to 11 PM">{hourly.map(item => <div key={item.hour} title={item.hour + ':00 · ' + item.count + ' occurrences · ' + item.cravings + ' cravings'}><i style={{ height: Math.max(3, item.count / Math.max(1, ...hourly.map(value => value.count)) * 42) + 'px' }}/><i className="craving-bar" style={{ height: Math.max(3, item.cravings / Math.max(1, ...hourly.map(value => value.cravings)) * 42) + 'px' }}/><small>{item.hour % 3 === 0 ? item.hour : ''}</small></div>)}</div><div className="logging-legend"><span><i/> Occurrences</span><span className="craving-legend"><i/> Cravings</span></div><div className="logging-weekday-grid">{weekdayCounts.map(item => <div key={item.day}><b>{item.count}</b><span>{item.label}</span><small>{item.cravings} cravings</small></div>)}</div><p className="logging-caveat">Periods with few records can look prominent by chance. Counts describe entries, not underlying risk.</p></section>
          </div>
          <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">08 · {periodEyebrow} · Comparison</span><h2>Selected period vs previous period</h2></div></div><div className="logging-weekly-grid"><div className="logging-table-header"><span>Measure</span><span>Previous period</span><span>Selected period</span><span>Change</span></div>{([
            [isSmoke ? 'Cigarettes recorded' : 'Occurrence quantity', previousPeriod.quantity, currentPeriod.quantity, delta(currentPeriod.quantity, previousPeriod.quantity)],
            ['Occurrence events', previousPeriod.occurrences, currentPeriod.occurrences, delta(currentPeriod.occurrences, previousPeriod.occurrences)],
            ...(isSmoke ? [['Older "Old behavior" episodes, quantity unknown', previousPeriod.legacyOccurrences, currentPeriod.legacyOccurrences, 'Not comparable to cigarettes']] : []),
            ['Cravings logged', previousPeriod.cravings, currentPeriod.cravings, delta(currentPeriod.cravings, previousPeriod.cravings)],
            ['Average recorded craving intensity', previousPeriod.averageIntensity, currentPeriod.averageIntensity, 'Descriptive'],
            ['Resolved cravings resisted', previousPeriod.resisted + '/' + previousPeriod.resolved + (previousPeriod.resolved ? ' (' + Math.round(previousPeriod.resisted / previousPeriod.resolved * 100) + '%)' : ''), currentPeriod.resisted + '/' + currentPeriod.resolved + (currentPeriod.resolved ? ' (' + Math.round(currentPeriod.resisted / currentPeriod.resolved * 100) + '%)' : ''), 'Counts and denominators shown'],
            ['Technique applications', previousPeriod.techniques, currentPeriod.techniques, delta(currentPeriod.techniques, previousPeriod.techniques)],
            ['No-occurrence confirmations', previousPeriod.noOccurrenceConfirmations, currentPeriod.noOccurrenceConfirmations, delta(currentPeriod.noOccurrenceConfirmations, previousPeriod.noOccurrenceConfirmations)],
            ['Days with logs / confirmations', previousPeriod.loggedDays + ' / ' + previousPeriod.days + ', ' + previousPeriod.confirmations + ' confirmed', currentPeriod.loggedDays + ' / ' + currentPeriod.days + ', ' + currentPeriod.confirmations + ' confirmed', 'Completeness'],
          ] as [string, string | number, string | number, string][]).map(row => <div className="logging-week-row" key={row[0]}><b>{row[0]}</b><span>{row[1]}</span><span>{row[2]}</span><span>{row[3]}</span></div>)}</div><p className="logging-caveat">The selected {periodLabel} is compared with the immediately previous equally long period. The 24 hour option compares exact rolling windows. A zero previous value has no percentage change.</p></section>
          {confirmationConflicts.length > 0 && <section className="logging-insight-section logging-conflict-list"><div className="logging-section-heading"><div><span className="eyebrow">Data check</span><h2>Confirmation conflicts</h2></div><span className="logging-chart-note">{confirmationConflicts.length} day{confirmationConflicts.length === 1 ? '' : 's'}</span></div><p className="logging-caveat">A daily confirmation disagrees with occurrence records on a date covered by this period. Correct either side; Habitly keeps both until you do.</p>{confirmationConflicts.map(day => <div className="logging-conflict-row" key={day.key}><div><b>{formatDay(day.key)}</b><small>{day.summary.confirmation?.status === 'no_occurrence' ? day.summary.occurrenceEvents + ' occurrence events are logged' : 'You confirmed an occurrence was recorded, but none is logged'}</small></div>{day.summary.confirmation?.status === 'no_occurrence' ? <><button type="button" onClick={() => saveDailyConfirmation('occurred_recorded', day.key)}>Occurred, logged</button><button type="button" onClick={() => saveDailyConfirmation('incomplete', day.key)}>Records incomplete</button></> : <><button type="button" onClick={() => saveDailyConfirmation('no_occurrence', day.key)}>No occurrence</button><button type="button" onClick={() => saveDailyConfirmation('incomplete', day.key)}>Records incomplete</button></>}<button type="button" className="text-button" onClick={() => { setHistoryFrom(day.key); setHistoryTo(day.key); setActive('History'); setLoggingView('History'); }}>Review events</button></div>)}</section>}
        </div>}
        {loggingView === 'History' && <section className="logging-history-section">
          <div className="logging-section-heading"><div><span className="eyebrow">Review and correct</span><h2>Behavior history <span className="soft-count">{historyLogs.length}</span></h2></div><span className="logging-chart-note">Grouped by local day and behavioral episode</span></div>
          <div className="logging-history-filters"><label>Type<select value={historyTypeFilter} onChange={event => { setHistoryTypeFilter(event.target.value); setHistoryLimit(30); }}><option value="all">All events</option><option value="craving">Cravings</option><option value="habit_occurrence">Habit occurrences</option><option value="technique_applied">Techniques</option><option value="recovery">Recovery actions</option></select></label><label>Trigger<input value={historyTriggerFilter} onChange={event => setHistoryTriggerFilter(event.target.value)} list="history-trigger-options" placeholder="All triggers"/><datalist id="history-trigger-options">{allTriggers.map(value => <option key={value} value={value}/>)}</datalist></label><label>Technique<input value={historyTechniqueFilter} onChange={event => setHistoryTechniqueFilter(event.target.value)} placeholder="Any technique"/></label><label>Law<select value={historyLawFilter} onChange={event => setHistoryLawFilter(event.target.value)}><option value="all">All laws</option>{lawGroups.slice(0, 4).map(item => <option key={item.id} value={item.id}>{item.break}</option>)}</select></label><label>Outcome<select value={historyOutcomeFilter} onChange={event => setHistoryOutcomeFilter(event.target.value)}><option value="all">All outcomes</option><option value="resisted">Resisted</option><option value="smoked">{isSmoke ? 'Smoked' : 'Engaged'}</option><option value="unknown">Unknown or unresolved</option></select></label><label className="logging-date-field">From<input type="date" value={historyFrom} onChange={event => setHistoryFrom(event.target.value)}/></label><label className="logging-date-field">To<input type="date" value={historyTo} onChange={event => setHistoryTo(event.target.value)}/></label><button type="button" className="text-button logging-clear-filters" onClick={() => { setHistoryTypeFilter('all'); setHistoryTriggerFilter(''); setHistoryTechniqueFilter(''); setHistoryLawFilter('all'); setHistoryOutcomeFilter('all'); setHistoryFrom(''); setHistoryTo(''); }}>Clear filters</button></div>
          {timelineGroups.length ? <div className="logging-history-days">{timelineGroups.map(day => <section key={day.day}><h3>{formatDay(day.day)}</h3>{day.checkins.map(({habit, missed}) => <article className="logging-episode" key={`checkin-${day.day}-${habit.id}`}><div className="logging-episode-summary"><span className="logging-episode-mark"><Icon name={missed ? 'refresh' : 'check'} size={17}/></span><span><b>{habit.name} · {missed ? 'Missed' : 'Completed'}</b><small>Daily check-in · Time not recorded</small>{!missed && difficultyHistory[day.day]?.[habit.id] && <small className="difficulty-history-note">Level {difficultyHistory[day.day][habit.id].level_number}{difficultyHistory[day.day][habit.id].name ? ` · ${difficultyHistory[day.day][habit.id].name}` : ''} · {difficultyHistory[day.day][habit.id].activity}{difficultyHistory[day.day][habit.id].target ? ` · ${difficultyHistory[day.day][habit.id].target}` : ''}</small>}</span><button type="button" className="text-button" onClick={() => { setLoggingHabitId(habit.id); setActive('Tracker'); setLoggingView('Insights'); }}>View tracker</button></div></article>)}{day.episodes.map(episode => { const multi = episode.rows.length > 1; const episodeTitle = multi ? 'Behavioral episode · ' + episode.rows.length + ' linked events' : eventLabel(episode.rows[0]); const outcome = episode.rows.map(getOutcome).find(value => value !== 'unknown') ?? resolvedEpisodeOutcome(analyticsLogs, episode.id); const expanded = expandedEpisodes.includes(episode.id); return <details key={episode.id} className="logging-episode" open={expanded || undefined} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedEpisodes(current => isOpen ? [...new Set([...current, episode.id])] : current.filter(id => id !== episode.id)); }}><summary><span className="logging-episode-mark"><Icon name={multi ? 'refresh' : episode.rows[0].type === 'craving' ? 'spark' : episode.rows[0].type === 'habit_occurrence' ? 'arrow-up-right' : 'check'} size={17}/></span><span><b>{episodeTitle}</b><small>{formatTime(episode.rows[0].at, episode.rows[0].timezone)}{episode.rows[0].trigger ? ' · ' + episode.rows[0].trigger : ''}</small></span>{outcome !== 'unknown' && <em className={'behavior-outcome ' + outcome}>{outcomeLabel(outcome)}</em>}<Icon name="chevron" size={16}/></summary><ol className="behavior-timeline">{episode.rows.map(log => <li key={log.id}><span className={'behavior-type-mark ' + log.type}><Icon name={log.type === 'craving' ? 'spark' : log.type === 'habit_occurrence' ? 'arrow-up-right' : 'check'} size={16}/></span><div className="behavior-log-main"><div className="behavior-log-title"><b>{eventLabel(log)}</b><time>{formatTime(log.at, log.timezone)}</time></div><p>{eventDetails(log)}</p>{log.legacyEvent && <small>From an older check-in. Original record kept unchanged.</small>}{log.type === 'craving' && <span className={'behavior-outcome ' + getOutcome(log)}>{outcomeLabel(getOutcome(log))}</span>}{log.context && <small>{contextDetails(log)}</small>}{(log.automaticThought || log.belief || log.reframing) && <small>{[log.automaticThought, log.belief, log.reframing].filter(Boolean).join(' · ')}</small>}{log.note && <small>{log.note}</small>}{!log.legacyEvent && <div className="behavior-log-actions"><button type="button" onClick={() => editBehaviorLog(log)}>Edit</button><button type="button" onClick={() => deleteBehaviorLog(log.id)}>Remove</button></div>}</div></li>)}</ol></details>; })}</section>)}</div> : <div className="logging-empty-state"><Icon name="clock" size={23}/><b>No matching events</b><span>Adjust the filters or record a new event in the Log tab.</span><button type="button" className="text-button" onClick={() => { setActive('Journal'); setLoggingView('Log'); }}>Go to Journal <Icon name="arrow" size={14}/></button></div>}
          {historyLogs.length > visibleHistory.length && <button type="button" className="secondary-button logging-load-more" onClick={() => setHistoryLimit(value => value + 30)}>Load 30 more events</button>}
        </section>}
      </div>
      {loggingView === 'Log' && <p className="logging-storage-note">{remoteToken ? 'Account sync is active. Changes remain available on this device.' : 'Saved in this browser. Connect an account in Settings to sync across devices.'}</p>}
    </>;
  }

  function renderToday() {
    return <>
      <div className="page-heading-row today-page-heading"><div className="today-greeting"><div className="today-greeting-top"><div className="eyebrow">{currentDate}</div><button type="button" className="habit-arrange-button" aria-label={reorderingHabits ? 'Done arranging habits' : 'Arrange habits'} title={reorderingHabits ? 'Done arranging' : 'Arrange habits'} aria-pressed={reorderingHabits} onClick={() => setReorderingHabits(value => !value)}>{reorderingHabits ? <Icon name="check" size={18}/> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>}</button></div><h1>Today</h1></div></div>
      {(buildHabits.length > 0 || breakHabits.length > 0) && <section className="today-quick-wins" aria-labelledby="todayQuickWinsTitle">
        <div className="today-quick-wins-heading"><div><h2 id="todayQuickWinsTitle">Quick check-in</h2></div><p>{todayCheckinTab === 'BUILD' ? 'Mark a habit when you finish it' : 'Choose a replacement when the old cue shows up'}</p></div>
        <div className="today-checkin-tabs" role="tablist" aria-label="Quick check-in type">
          <button id="today-checkin-build-tab" type="button" role="tab" tabIndex={todayCheckinTab === 'BUILD' ? 0 : -1} aria-selected={todayCheckinTab === 'BUILD'} aria-controls="today-checkin-build-panel" className={todayCheckinTab === 'BUILD' ? 'is-active' : ''} onClick={() => setTodayCheckinTab('BUILD')} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setTodayCheckinTab('REPLACEMENT'); document.getElementById('today-checkin-replacement-tab')?.focus(); } }}>Build habits</button>
          <button id="today-checkin-replacement-tab" type="button" role="tab" tabIndex={todayCheckinTab === 'REPLACEMENT' ? 0 : -1} aria-selected={todayCheckinTab === 'REPLACEMENT'} aria-controls="today-checkin-replacement-panel" className={todayCheckinTab === 'REPLACEMENT' ? 'is-active' : ''} onClick={() => setTodayCheckinTab('REPLACEMENT')} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setTodayCheckinTab('BUILD'); document.getElementById('today-checkin-build-tab')?.focus(); } }}>Replacement</button>
        </div>
        {todayCheckinTab === 'BUILD' ? <div id="today-checkin-build-panel" role="tabpanel" aria-labelledby="today-checkin-build-tab" className="today-checkin-panel">
          {buildHabits.length ? <div className="today-quick-wins-pills">{[...buildHabits].reverse().map(habit => <button key={habit.id} type="button" className={`today-quick-win${habit.completed ? ' is-complete' : ''}`} onClick={() => void completeHabit(habit)} disabled={habit.completed && (habit.dailyTarget ?? 1) <= 1} aria-pressed={habit.completed} aria-label={`Log a completion for ${habit.name}, ${(habit.completionCount ?? (habit.completed ? 1 : 0))} of ${habit.dailyTarget ?? 1} today`}><span>{habit.name} · {(habit.completionCount ?? (habit.completed ? 1 : 0))}/{habit.dailyTarget ?? 1}</span>{habit.completed && <Icon name="check" size={14}/>}</button>)}</div> : <div className="today-checkin-empty"><p>No build habits yet.</p><button type="button" className="text-button" onClick={() => startNewHabit('BUILD')}>Create a build habit</button></div>}
        </div> : <div id="today-checkin-replacement-panel" role="tabpanel" aria-labelledby="today-checkin-replacement-tab" className="today-checkin-panel today-replacement-list">
          {breakHabits.length ? [...breakHabits].reverse().map(habit => {
            const steps = habit.replacementMode === 'OPTIONS' ? [] : getReplacementActions(habit);
            const options = getReplacementOptions(habit);
            return <article className="today-replacement-item" key={habit.id}>
              <div className="today-replacement-heading" title={habit.cue ? `Cue: ${habit.cue}` : undefined}><b>{habit.name}</b>{habit.cue && <span>{habit.cue}</span>}</div>
              <div className="today-replacement-choices">
                {steps.length > 1 && <details className="today-replacement-stack"><summary className="today-replacement-choice" aria-label={`View the ${steps.length} steps in the habit stack for ${habit.name}`}><small>Stack</small><span>{steps[0]} +{steps.length - 1}</span><span className="today-replacement-stack-hint">View steps</span></summary><div className="today-replacement-stack-details"><ol>{steps.map((step, index) => <li key={`${habit.id}-stack-step-${index}`}>{step}</li>)}</ol><button type="button" className="today-replacement-stack-log" onClick={() => void recordHabitEvent(habit, 'REPLACEMENT_USED', undefined, steps.join(' → '))}>I used this stack</button></div></details>}
                {steps.length === 1 && <button type="button" className="today-replacement-choice" onClick={() => void recordHabitEvent(habit, 'REPLACEMENT_USED', undefined, steps[0])} aria-label={`Log single replacement habit for ${habit.name}: ${steps[0]}`}><small>Single</small><span>{steps[0]}</span></button>}
                {options.map((action, index) => <button key={`${habit.id}-replacement-${index}`} type="button" className="today-replacement-choice" onClick={() => void recordHabitEvent(habit, 'REPLACEMENT_USED', undefined, action)} aria-label={`Log single replacement habit ${action} for ${habit.name}`}><small>Single</small><span>{action}</span></button>)}
                {!steps.length && !options.length && <span className="today-replacement-unset">No replacement set</span>}
              </div>
              <button type="button" className="today-replacement-urge" onClick={() => void recordHabitEvent(habit, 'URGE_PASSED')}>Urge passed</button>
              <details className="today-replacement-more"><summary>More</summary><button type="button" onClick={() => void recordHabitEvent(habit, 'OLD_HABIT')}>Log old behavior</button></details>
            </article>;
          }) : <div className="today-checkin-empty"><p>No replacement plans yet.</p><button type="button" className="text-button" onClick={() => startNewHabit('BREAK')}>Create a replacement plan</button></div>}
        </div>}
      </section>}
      <section className="today-section"><div className="section-heading today-section-heading"><div><h2>Today’s habits <span className="soft-count">{todayHabits.length}</span></h2><p className={`today-progress-note${completed ? ' has-completions' : ''}`}>{completed ? `You showed up today · ${completed} of ${buildHabits.length} habit${buildHabits.length === 1 ? '' : 's'} complete` : `${completed} of ${buildHabits.length} build habits completed`}</p>{buildHabits.length > 0 && <div className="today-progress-track" role="progressbar" aria-label="Today’s completed habits" aria-valuemin={0} aria-valuemax={buildHabits.length} aria-valuenow={completed}><span style={{ width: `${progress}%` }}/></div>}</div><div className="today-list-actions"><button className="text-button today-add-button" onClick={() => startNewHabit('BUILD')}><Icon name="plus" size={15}/> Add habit</button></div></div><div className="habit-list">{todayHabits.length ? todayHabits.map((habit, i) => <div className={`today-order-item${dragState?.id === habit.id ? ' is-dragging' : ''}${dragState && dragState.id !== habit.id && dragState.target === i ? ' is-drop-target' : ''}`} key={habit.id} style={dragState?.id === habit.id ? { transform: `translateY(${dragState.offset}px)` } : undefined}>{renderHabitCard(habit, i)}{reorderingHabits && <button type="button" className="habit-drag-handle" aria-label={`Drag to move ${habit.name}. Use up or down arrow keys to reorder.`} onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = { id: habit.id, y: event.clientY, target: i }; setDragState({ id: habit.id, offset: 0, target: i }); }} onPointerMove={event => { const drag = dragStart.current; if (!drag || drag.id !== habit.id) return; const target = dragTarget(event.clientY); drag.target = target; setDragState({ id: drag.id, offset: event.clientY - drag.y, target }); if (event.clientY < 70) window.scrollBy(0, -14); else if (event.clientY > window.innerHeight - 70) window.scrollBy(0, 14); }} onPointerUp={event => { const drag = dragStart.current; if (drag?.id === habit.id) moveHabit(i, drag.target); dragStart.current = null; setDragState(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragStart.current = null; setDragState(null); }} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); moveHabit(i, i + (event.key === 'ArrowUp' ? -1 : 1)); } }}><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg><span>Drag to reorder</span></button>}</div>) : <div className="empty-card"><div className="empty-flower"><Icon name="spark" size={18}/></div><h3>Start with one tiny promise.</h3><p>Choose a cue, make the action easy, and give your future self a clear path.</p><button className="primary-button" onClick={() => startNewHabit('BUILD')}><Icon name="plus"/> Create your first habit</button></div>}</div></section>
    </>;
  }

  function renderHabits() {
    const good = todayHabits.filter(h => h.kind === 'BUILD');
    return <><div className="page-heading-row"><div><div className="eyebrow">Make it obvious, make it easy</div><h1>Your habits</h1><p className="page-subtitle">Small actions, attached to the life you already live.</p></div><button className="primary-button" onClick={() => startNewHabit('BUILD')}><Icon name="plus"/> Create habit</button></div><div className="habits-intro"><div className="intro-badge"><Icon name="spark"/></div><div><b>Start tiny. Stay consistent.</b><p>Choose an action and a pace that work for you. A smaller starter action is there if you want one.</p></div></div><div className="section-heading"><div><span className="eyebrow">Building who you are</span><h2>Habits to build <span className="soft-count">{good.length}</span></h2></div></div><div className="habit-list">{good.length ? good.map(renderHabitCard) : <div className="empty-card"><div className="empty-flower"><Icon name="spark" size={18}/></div><h3>One small promise is enough.</h3><p>Pick a cue and an easy starter action. You can build up once the routine feels familiar.</p><button className="primary-button" onClick={() => startNewHabit('BUILD')}><Icon name="plus"/> Create a habit</button></div>}</div><button className="text-button anti-link" onClick={() => setActive('Habit to break')}>Manage habits you want to break <Icon name="arrow" size={15}/></button></>;
  }

  function renderRecovery() {
    const needs = habits.filter(h => h.missedYesterday);
    const circuitBreaker = needs.some(h => getResilientStreak(history, h.id).broken);
    const trackerDate = new Date(`${todayKey()}T12:00:00`);
    const recentDays = Array.from({ length: 28 }, (_, i) => { const d = new Date(trackerDate); d.setDate(trackerDate.getDate() - (27 - i)); const key = todayKeyFromDate(d); const statuses = history[key] ?? []; return { key, day: d.getDate(), done: statuses.filter(x => !x.startsWith('missed:')).length, missed: statuses.filter(x => x.startsWith('missed:')).length }; });
    return <><div className="page-heading-row"><div><div className="eyebrow">The comeback counts</div><h1>History and recovery</h1><p className="page-subtitle">You never have to be perfect. Just return to the path.</p></div></div><section className="calendar-card"><div className="calendar-heading"><div><span className="eyebrow">Progress you can see</span><h3>Last 28 days</h3></div><div className="calendar-legend"><span><i className="activity-done"/> Showed up</span><span><i className="activity-missed"/> Rest / miss</span></div></div><div className="activity-calendar">{recentDays.map(d => <div key={d.key} title={`${d.key}: ${d.done} votes, ${d.missed} missed`} className={`activity-cell ${d.done ? 'activity-done' : d.missed ? 'activity-missed' : ''}`}><span>{d.day}</span></div>)}</div></section>{needs.length > 0 && <div className={`recovery-hero ${circuitBreaker ? 'recovery-circuit-breaker' : ''}`}><div className="recovery-sun"><Icon name="arrow-up-right" size={24}/></div><span className="overline">{circuitBreaker ? 'CIRCUIT BREAKER · RESET THE ACTION, NOT YOUR IDENTITY' : 'RECOVERY RULE · NEVER MISS TWICE'}</span><h2>{circuitBreaker ? 'Two misses are a signal to shrink the next step.' : needs.length ? 'You missed a day. You still belong here.' : 'You’re back in rhythm.'}</h2><p>{circuitBreaker ? 'Make the next action almost impossible to skip. Choose the smallest gateway action and put the cue directly in your path. Your identity votes are still here.' : needs.length ? 'After a lapse, return to your plan at the next opportunity. One slip does not have to become a pattern.' : 'No recovery needed right now. Keep your next step small and your cues clear.'}</p><div className="recovery-stats"><div><b>{votes}</b><span>identity votes kept</span></div><div><b>{needs.filter(h => h.completed).length}/{needs.length || 0}</b><span>comeback actions</span></div><div><b>1 day</b><span>grace built in</span></div></div></div>}<div className="section-heading space-top"><div><span className="eyebrow">A gentle nudge</span><h2>{needs.length ? 'Pick one to restart' : 'Your habits today'}</h2></div></div><div className="habit-list">{(needs.length ? needs : todayHabits).map(renderHabitCard)}</div></>;
  }

  function renderVault() {
    return <><div className="page-heading-row"><div><div className="eyebrow">Make it attractive</div><h1>The reward vault</h1><p className="page-subtitle">Pair something you want with the habit you need.</p></div></div><div className="vault-hero"><div className="vault-hero-icon"><Icon name="spark" size={18}/></div><div><span className="overline">Temptation bundling</span><h2>Earn the thing you love.</h2><p>Your wants wait here until you complete the action they’re paired with.</p></div><div className="vault-unlocked"><b>{unlockedRewards.length}</b><span>unlocked today</span></div></div><div className="vault-grid">{rewards.filter(r => habits.some(h => h.id === r.habitId)).map(r => { const need = habits.find(h => h.id === r.habitId); const isUnlocked = !!need?.completed; return <article className={`reward-card ${isUnlocked ? 'reward-card-open' : ''}`} key={r.id}><div className={`reward-symbol ${isUnlocked ? 'reward-symbol-open' : ''}`}>{isUnlocked ? <Icon name="spark" size={21}/> : <Icon name="lock" size={21}/>}</div><span className={`reward-status ${isUnlocked ? 'status-open' : ''}`}>{isUnlocked ? 'UNLOCKED' : 'WAITING FOR YOU'}</span><h3>{r.name}</h3><p>{r.detail}</p><div className="reward-linked">{isUnlocked ? <Icon name="check" size={13}/> : <Icon name="lock" size={13}/>} Linked to: <b>{need?.name ?? 'Habit removed'}</b></div></article>; })}</div><form className="vault-add-card" onSubmit={addVaultReward}><div><span className="eyebrow">Add a want</span><h3>What sounds good after you show up?</h3></div><div className="vault-form"><input value={vaultName} onChange={e => setVaultName(e.target.value)} placeholder="e.g. Watch one episode" required/><select value={vaultHabit} onChange={e => setVaultHabit(e.target.value)} required><option value="">Choose the habit it unlocks</option>{habits.filter(h => h.kind === 'BUILD').map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select><input value={vaultDetail} onChange={e => setVaultDetail(e.target.value)} placeholder="A note to future you (optional)"/><button className="primary-button" type="submit"><Icon name="plus"/> Add to vault</button></div></form></>;
  }

  function renderTechniqueChooser(law: Law) {
    const options = techniques.filter(item => item.laws.includes(law) && item.modes.includes(habitType));
    const count = options.filter(item => techniqueIds.includes(item.id)).length;
    return <details className="strategy-disclosure" open={undefined}>
      <summary>Explore techniques <span>{count ? `${count} selected` : 'Optional'}</span></summary>
      <div className="strategy-list">{options.map(item => <article className={`technique-option ${techniqueIds.includes(item.id) ? 'technique-option-selected' : ''}`} key={item.id}>
        <label><input type="checkbox" checked={techniqueIds.includes(item.id)} onChange={() => toggleTechnique(item.id)}/><span><b>{item.name}</b><small>{item.description}</small></span></label>
        <button type="button" className="technique-info" aria-label={`Learn about ${item.name}`} title={`Learn about ${item.name}`} onClick={() => setInfoModal({ type: 'technique', id: item.id })}>i</button>
        {techniqueIds.includes(item.id) && <label className="technique-note">How will you use this? <span className="optional">Optional</span><textarea aria-label={`${law} setup for ${item.id}`} value={techniqueNoteFor(techniqueNotes, item.id, law)} onChange={e => setTechniqueNotes(current => ({ ...current, [item.id]: e.target.value, ...Object.fromEntries((techniqueMap[item.id]?.laws ?? []).filter(value => lawGroups.some(group => group.id === value)).map(value => [`${value}:${item.id}`, e.target.value])) }))} placeholder="Make it specific to your routine" rows={2}/></label>}
      </article>)}</div>
    </details>;
  }

  function guideList(value: string) {
    return value.split(/;\s*|(?=\(\d+\)\s*)/).map(item => item.replace(/^\(\d+\)\s*/, '').trim()).filter(Boolean);
  }

  function getNotebookTechnique(id: string, mode: 'BUILD' | 'BREAK' = habitType) {
    const aliases: Record<string, string> = { 'stacking-bundling': 'Habit Stacking + Temptation Bundling', 'stacking-tracking': 'Habit Stacking + Habit Tracking' };
    const name = aliases[id] ?? techniqueMap[id]?.name;
    return notebookLMContent.techniques.find(item => item.name === name && item.mode === mode) ?? notebookLMContent.techniques.find(item => item.name === name);
  }

  function renderPlaybook() {
    return <><div className="page-heading-row"><div><div className="eyebrow">The habit toolkit</div><h1>Four laws. Many methods</h1><p className="page-subtitle">Browse the full set, then choose the methods that fit one behavior.</p></div></div>
      <div className="playbook-switch"><button className={playbookMode === 'BUILD' ? 'selected' : ''} onClick={() => setPlaybookMode('BUILD')}>Build a habit</button><button className={playbookMode === 'BREAK' ? 'selected' : ''} onClick={() => setPlaybookMode('BREAK')}>Break a habit</button></div>
      <div className="law-board">{lawGroups.map((law, index) => <article key={law.id} className="law-board-card"><span>0{index + 1}</span><div><b>{playbookMode === 'BUILD' ? law.build : law.break}</b><small>{law.prompt}</small></div></article>)}</div>
      {lawGroups.map((law, index) => <details className="law-techniques playbook-law" key={law.id}><summary><span className="law-number">0{index + 1}</span><span className="law-title"><b>{playbookMode === 'BUILD' ? law.build : law.break}</b><small>{law.prompt}</small></span><span className="law-count">{techniques.filter(item => item.laws.includes(law.id) && item.modes.includes(playbookMode)).length} methods</span></summary><div className="playbook-options">{techniques.filter(item => item.laws.includes(law.id) && item.modes.includes(playbookMode)).map(item => <article key={item.id}><b>{item.name}</b><p>{item.description}</p><small>Example: {item.example}</small></article>)}</div></details>)}
      <details className="law-techniques playbook-law"><summary><span className="law-number"><Icon name="spark" size={18}/></span><span className="law-title"><b>Foundations and advanced tactics</b><small>Optional methods that support the whole process</small></span><span className="law-count">{techniques.filter(item => item.laws.some(law => law === 'foundation' || law === 'advanced') && item.modes.includes(playbookMode)).length} methods</span></summary><div className="playbook-options">{techniques.filter(item => item.laws.some(law => law === 'foundation' || law === 'advanced') && item.modes.includes(playbookMode)).map(item => <article key={item.id}><b>{item.name}</b><p>{item.description}</p><small>Example: {item.example}</small></article>)}</div></details>
    </>;
  }

  function renderAntiHabit() {
    const anti = habits.filter(h => h.kind === 'BREAK');
    const lastWeek = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return <><div className="page-heading-row"><div><div className="eyebrow">The four anti laws</div><h1>Break the loop</h1><p className="page-subtitle">Make the cue invisible, the routine unattractive, the response difficult, and the reward unsatisfying.</p></div><button className="primary-button" onClick={() => startNewHabit('BREAK')}><Icon name="plus"/> Change a habit</button></div>
      <div className="law-board law-board-break">{lawGroups.map((law, index) => <article key={law.id} className="law-board-card"><span>0{index + 1}</span><div><b>{law.break}</b><small>{law.prompt}</small></div></article>)}</div>
      {anti.length ? <div className="anti-list">{anti.map(h => {
        const events = habitEvents.filter(event => event.habitId === h.id);
        const weekEvents = events.filter(event => new Date(event.at).getTime() >= lastWeek);
        const urgesPassedThisWeek = weekEvents.filter(event => event.type === 'URGE_PASSED').length;
        const replacementsThisWeek = weekEvents.filter(event => event.type === 'REPLACEMENT_USED').length;
        const oldThisWeek = weekEvents.filter(event => event.type === 'OLD_HABIT').length;
        const weeklyReduction = typeof h.baselineDaily === 'number' && h.baselineDaily > 0 ? Math.max(0, Math.round((1 - oldThisWeek / (h.baselineDaily * 7)) * 100)) : null;
        const planAnswers = getBreakPlanAnswers(h);
        const answerSummary = (values: string[]) => values.map(value => value.trim()).filter(Boolean).join(' · ');
        const replacementSteps = h.replacementMode === 'OPTIONS' ? [] : getReplacementActions(h);
        const replacementOptions = getReplacementOptions(h);
        const cueSummary = h.cueType === 'STACK'
          ? planAnswers.cueTriggers.map(value => value.trim()).filter(Boolean).join(' · ')
          : planAnswers.cueTimes.map((value, index) => [value, planAnswers.cueLocations[index]].map(part => part?.trim()).filter(Boolean).join(' · ')).filter(Boolean).join(' · ');
        return <article className="anti-card" key={h.id}><div className="anti-card-top"><div className="anti-card-icon"><Icon name="spark"/></div><div><span className="eyebrow">Behavior you’re changing</span><h3>{h.name}</h3></div>{renderHabitActions(h)}<span className="shield-badge">{h.techniqueIds?.length ?? 0} strategies</span></div>
          <div className="anti-stats"><div><b>{urgesPassedThisWeek}</b><span>urges passed this week</span></div><div><b>{replacementsThisWeek}</b><span>replacement actions</span></div><div><b>{oldThisWeek}</b><span>old routine episodes</span></div>{weeklyReduction !== null && <div><b>{weeklyReduction}%</b><span>below baseline</span></div>}</div><p className="anti-review">Use this seven day pattern to keep the methods that helped or adjust one of the four law levers.</p>
          <div className="anti-steps">{lawGroups.map((law, index) => {
            const selected = (h.techniqueIds ?? []).map(id => techniqueMap[id]).filter(item => item?.laws.includes(law.id));
            const customPlan = answerSummary(planAnswers[customLawAnswerKeys[law.id as HabitLaw]]);
            const guidedPlan = law.id === 'cue' ? answerSummary(planAnswers.cuesToHide) : law.id === 'craving' ? [...planAnswers.underlyingNeeds, ...planAnswers.reframes].filter(Boolean).join(' · ') : law.id === 'response' ? answerSummary(planAnswers.frictionIdeas) : [...planAnswers.oldPayoffs, ...planAnswers.agreements].filter(Boolean).join(' · ');
            const summary = [customPlan, selected.length ? selected.map(item => item.name).join(', ') : guidedPlan].filter(Boolean).join(' · ');
            return <div key={law.id}><span>0{index + 1} · {law.break}</span><p>{summary || 'Choose a method when you’re ready to expand this plan.'}</p>{selected.map(item => (h.techniqueNotes?.[`${law.id}:${item.id}`] ?? h.techniqueNotes?.[item.id]) && <small key={item.id}>{h.techniqueNotes?.[`${law.id}:${item.id}`] ?? h.techniqueNotes?.[item.id]}</small>)}</div>;
          })}</div>
          <div className="replacement-plan"><span className="eyebrow">When the urge shows up</span>{replacementSteps.length > 0 && <><b>Stack these steps</b><ol className="replacement-plan-steps">{replacementSteps.map((action, index) => <li key={`${h.id}-replacement-${index}`}>{action}</li>)}</ol></>}{replacementOptions.length > 0 && <><b>{h.replacementMode === 'BOTH' ? 'Or choose one of these' : 'Choose one option'}</b><ul className="replacement-plan-steps">{replacementOptions.map((action, index) => <li key={`${h.id}-replacement-option-${index}`}>{action}</li>)}</ul></>}{!replacementSteps.length && !replacementOptions.length && <p>Choose a small replacement action that meets the same need.</p>}{cueSummary && <small>Your cue: {cueSummary}</small>}</div>
          <div className="habit-checkin-workspace"><div className="checkin-controls"><label>What happened just now?<textarea value={checkinNotes[h.id] ?? ''} onChange={e => setCheckinNotes(current => ({ ...current, [h.id]: e.target.value }))} placeholder="Optional note about the moment" rows={2}/></label><div className="urge-actions"><span>Log an event</span><div><button type="button" onClick={() => void recordHabitEvent(h, 'URGE_PASSED')}>Urge passed</button><button type="button" onClick={() => void recordHabitEvent(h, 'REPLACEMENT_USED')}>Used replacement</button><button type="button" onClick={() => void recordHabitEvent(h, 'OLD_HABIT')}>Old behavior</button></div></div></div>
          <details className="variation-workspace" open={variations.some(v => v.habitId === h.id)}><summary>Try a variation <small>{variations.filter(v => v.habitId === h.id).length} saved</small></summary><div className="variation-create"><p>Your current plan stays in place. Save an alternative, then activate it when you want to try it.</p><div className="variation-fields"><select aria-label={`Variation law for ${h.name}`} value={(variationDrafts[h.id] ?? { law: 'response' }).law} onChange={e => setVariationDrafts(current => ({ ...current, [h.id]: { ...(current[h.id] ?? { law: 'response', name: '', techniqueId: '', setup: '' }), law: e.target.value as Law } }))}>{lawGroups.map(law => <option key={law.id} value={law.id}>{law.break}</option>)}</select><select aria-label={`Variation technique for ${h.name}`} value={variationDrafts[h.id]?.techniqueId ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [h.id]: { ...(current[h.id] ?? { law: 'response', name: '', techniqueId: '', setup: '' }), techniqueId: e.target.value } }))}><option value="">Custom setup</option>{techniques.filter(item => item.modes.includes('BREAK')).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label={`Variation name for ${h.name}`} placeholder="Name this alternative" value={variationDrafts[h.id]?.name ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [h.id]: { ...(current[h.id] ?? { law: 'response', name: '', techniqueId: '', setup: '' }), name: e.target.value } }))}/><textarea aria-label={`Variation setup for ${h.name}`} placeholder="What will you try?" value={variationDrafts[h.id]?.setup ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [h.id]: { ...(current[h.id] ?? { law: 'response', name: '', techniqueId: '', setup: '' }), setup: e.target.value } }))}/><button type="button" className="secondary-button" onClick={() => void createVariation(h)}>Save variation</button></div></div>{variations.filter(v => v.habitId === h.id).map(v => <article className="variation-row" id={`anti-variation-${v.id}`} tabIndex={-1} key={v.id}><div className="variation-row-main"><div><b>{v.name}</b>{v.isActive && <span className="variation-active">Testing now</span>}<p>{lawGroups.find(law => law.id === v.law)?.break}: {v.setup}</p>{v.techniqueId && <small>{techniqueMap[v.techniqueId]?.name}</small>}</div><button type="button" className={v.isActive ? 'secondary-button' : 'text-button'} onClick={() => void updateVariation(v, { isActive: !v.isActive })}>{v.isActive ? 'Active' : 'Make active'}</button></div><div className="variation-outcome"><span>{v.triedAt ? `Tried ${new Date(v.triedAt).toLocaleDateString()}` : 'Not tried yet'}</span><label>Did it help?<select value={v.helped === true ? 'yes' : v.helped === false ? 'no' : ''} onChange={e => void updateVariation(v, { helped: e.target.value === '' ? null : e.target.value === 'yes' })}><option value="">Not rated</option><option value="yes">Yes</option><option value="no">Not yet</option></select></label><button type="button" className="text-button" onClick={async () => { setVariations(current => current.filter(item => item.id !== v.id)); if (apiUrl && remoteIdentityId && !h.id.startsWith('demo-')) await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${h.id}/variations/${v.id}`, { method: 'DELETE' }).catch(() => {}); }}>Remove</button></div>{v.outcomeNote && <p className="variation-note">{v.outcomeNote}</p>}</article>)}</details>
          <details className="event-history"><summary>Today’s check-ins <small>{events.filter(event => new Date(event.at).toDateString() === new Date().toDateString()).length}</small></summary>{events.length ? <ol>{events.slice(0, 30).map(event => <li key={event.id}><b>{event.type === 'URGE_PASSED' ? 'Urge passed' : event.type === 'REPLACEMENT_USED' ? 'Replacement used' : 'Old behavior'}</b><time>{new Date(event.at).toLocaleString()}</time>{event.variationName && <small>Testing: {event.variationName}</small>}{event.strategy && !event.variationName && <small>Strategy: {event.strategy}</small>}{event.note && <p>{event.note}</p>}</li>)}</ol> : <p>No check-ins yet. Any number of events can be recorded each day.</p>}</details></div>
          <details className="accountability-optional"><summary>Optional accountability</summary><p>{h.contract || 'Add an agreement only if accountability would help you.'} {h.accountabilityPartner ? `Partner: ${h.accountabilityPartner}.` : ''}</p>{h.accountabilityCost && <small>Agreed commitment: {h.accountabilityCost}</small>}{h.inviteLink && <a className="text-button" href={`mailto:${encodeURIComponent(h.accountabilityEmail || '')}?subject=${encodeURIComponent(`Habitly check-in: ${h.name}`)}&body=${encodeURIComponent(`Would you support me with this habit plan? ${h.inviteLink}`)}`}>Email partner invite</a>}</details>
        </article>;
      })}</div> : <div className="empty-card anti-empty"><div className="empty-flower"><Icon name="arrow-down-right" size={24}/></div><h3>Choose one behavior to change.</h3><p>We’ll build a plan around all four anti laws, and you can choose as many methods as you need.</p><button className="primary-button" onClick={() => startNewHabit('BREAK')}><Icon name="plus"/> Create a change plan</button></div>}
    </>;
  }

  function renderScorecard() {
    const positive = scorecard.filter(entry => entry.rating === '+').length;
    const negative = scorecard.filter(entry => entry.rating === '-').length;
    return <><div className="page-heading-row"><div><div className="eyebrow">Notice before you change</div><h1>Your habit scorecard</h1><p className="page-subtitle">A curious snapshot of the routines already shaping your day.</p></div><button className="primary-button" onClick={() => { setDiagnosticOpen(true); setDiagnosticStep(0); }}><Icon name="plus"/> Diagnose a routine</button></div><div className="scorecard-hero"><span className="scorecard-mark"><Icon name="spark" size={24}/></span><div><span className="overline">Identity check in</span><h2>What does today’s routine say about who you’re becoming?</h2><p>Grade each behavior in relation to your chosen identity: helpful, harmful, or neutral. There’s no judgment in the inventory.</p></div><div className="scorecard-totals"><b>{scorecard.length}</b><small>behaviors noticed</small></div></div><form className="scorecard-add" onSubmit={addScorecardEntry}><label className="field-label">Add a behavior you already do<input value={scorecardDraft} onChange={e => setScorecardDraft(e.target.value)} placeholder="e.g. Check my phone before getting out of bed"/></label><button className="primary-button" type="submit"><Icon name="plus"/> Add behavior</button></form><div className="scorecard-summary"><span><b className="rating-positive">+ {positive}</b> supports my identity</span><span><b className="rating-negative">− {negative}</b> pulls me away</span><span><b>{scorecard.length - positive - negative}</b> neutral so far</span></div><div className="scorecard-list">{scorecard.length ? scorecard.map(entry => <article className="scorecard-row" key={entry.id}><span className={`rating-symbol rating-${entry.rating === '+' ? 'positive' : entry.rating === '-' ? 'negative' : 'neutral'}`}>{entry.rating}</span><b>{entry.behavior}</b><div className="rating-controls" aria-label={`Grade ${entry.behavior}`}>{(['+', '=', '-'] as const).map(rating => <button key={rating} type="button" className={entry.rating === rating ? 'rating-selected' : ''} onClick={() => rateScorecard(entry.id, rating)}>{rating === '+' ? 'Helpful' : rating === '-' ? 'Harmful' : 'Neutral'}</button>)}</div></article>) : <div className="empty-card"><div className="empty-flower"><Icon name="spark" size={24}/></div><h3>Begin with one thing you notice.</h3><p>Think through a normal morning, afternoon, or evening. Add the behavior, then grade it gently.</p></div>}</div>{diagnostics.length > 0 && <><div className="section-heading space-top"><div><span className="eyebrow">Four step loop analysis</span><h2>Routine diagnostics <span className="soft-count">{diagnostics.length}</span></h2></div></div><div className="diagnostic-list">{diagnostics.map(item => <article className="diagnostic-card" key={item.id}><span className="eyebrow">Routine</span><h3>{item.routine}</h3><p><b>Craving:</b> {item.craving} · <b>Reward experiment:</b> {item.rewardExperiment}</p><p><b>Cue:</b> {[item.cueTime, item.cueLocation, item.cueEmotion, item.cuePeople].filter(Boolean).join(' · ') || 'Not isolated yet'}</p><p><b>Plan:</b> {item.plan}</p></article>)}</div></> }</>;
  }

  function renderCommunity() {
    return <><div className="page-heading-row"><div><div className="eyebrow">Make it normal to show up</div><h1>Find your people</h1><p className="page-subtitle">Join a small tribe where the behavior you want is part of the culture.</p></div></div><div className="community-hero"><span className="community-orbit"><Icon name="spark" size={18}/></span><div><span className="overline">Culture beats willpower</span><h2>Spend time with people who already live the way you want to live.</h2><p>Pick a circle that matches the identity you’re practicing. Membership syncs to your Habitly account when connected.</p></div></div><div className="tribe-grid">{communityCircles.map((tribe, index) => { const joined = joinedTribes.includes(tribe.id); return <article className="tribe-card" key={tribe.id}><div className={`tribe-art tribe-art-${index % 3 + 1}`}><Icon name={['arrow-up-right','grid','spark'][index % 3]} size={30}/></div><span className="eyebrow">{tribe.category.toUpperCase()}</span><h3>{tribe.name}</h3><p>{tribe.detail}</p><div className="tribe-card-foot"><span>{tribe.members + (joined ? 1 : 0)} people</span><button className={joined ? 'secondary-button' : 'primary-button'} onClick={() => void toggleCircle(tribe, joined)}>{joined ? 'Joined' : 'Join circle'}</button></div></article>; })}</div><form className="circle-create-form" onSubmit={createCircle}><div><span className="eyebrow">Start a culture</span><h3>Create an identity circle</h3></div><input value={circleName} onChange={e => setCircleName(e.target.value)} placeholder="Circle name" required/><input value={circleIdentity} onChange={e => setCircleIdentity(e.target.value)} placeholder="Identity, e.g. The Runners" required/><input value={circleDescription} onChange={e => setCircleDescription(e.target.value)} placeholder="What do members practice together?" required/><button className="primary-button" type="submit"><Icon name="plus"/> Create circle</button></form></>;
  }

  function renderSettings() {
    return <><div className="page-heading-row"><div><div className="eyebrow">Your space, your rules</div><h1>Settings</h1><p className="page-subtitle">Manage your workspace and optional features.</p></div></div><section className="settings-card backup-export-card"><h2>Back up logging data</h2><p>Save this browser copy to Files before connecting or syncing.</p><div className="settings-actions"><button type="button" className="primary-button" onClick={() => void exportWorkspaceBackup()}>Save current browser copy</button>{typeof window !== 'undefined' && localStorage.getItem(RECOVERY_STORAGE) && <button type="button" className="secondary-button" onClick={() => void exportWorkspaceBackup(RECOVERY_STORAGE, 'habitly-recovery-backup.json')}>Save previous browser copy</button>}<label className="secondary-button backup-restore-button">Restore from backup<input type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { restoreLocalWorkspace(JSON.parse(await file.text())); } catch (error) { setToast(error instanceof Error ? error.message : 'The backup could not be restored. Existing data is unchanged.'); } event.currentTarget.value = ''; }}/></label></div></section><section className="settings-card appearance-settings"><div className="appearance-heading"><div><span className="eyebrow">Make it yours</span><h2>Appearance</h2><p>Choose a color mood and switch between light, dark, or a softer look.</p></div></div><div className="appearance-mode" role="group" aria-label="Display mode">{([{ id: false, name: 'Light', icon: 'sun' }, { id: true, name: 'Dark', icon: 'moon' }] as const).map(mode => <button type="button" key={mode.name} className={darkMode === mode.id ? 'appearance-mode-option selected' : 'appearance-mode-option'} aria-pressed={darkMode === mode.id} onClick={() => setDarkMode(mode.id)}><Icon name={mode.icon} size={17}/>{mode.name}</button>)}</div><div className="palette-heading"><b>Color themes</b><span>{palettes.find(option => option.id === palette)?.name}</span></div><div className="palette-options" role="group" aria-label="Color theme">{palettes.map(option => <button type="button" key={option.id} className={palette === option.id ? 'palette-option selected' : 'palette-option'} aria-pressed={palette === option.id} onClick={() => setPalette(option.id)}><span className="palette-swatches" aria-hidden="true">{option.colors.map(color => <i key={color} style={{ backgroundColor: color }}/>)}</span><span>{option.name}</span></button>)}</div></section><section className="settings-card"><label><input type="checkbox" checked={labs} onChange={e => setLabs(e.target.checked)}/> Experimental features</label><p>Enable optional Telegram linking.</p></section><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Icon name="leaf"/></div><div><span className="eyebrow">Habitly API</span><h2>Connect your data</h2><p>Create or sign in to an account to sync your habits across browsers and devices.</p></div><span className={`connection-badge ${workspaceReady && !connectionError ? 'connected' : ''}`}><i/>{connectionError ? 'Connection issue' : workspaceReady ? 'Synced account' : remoteUserId ? 'Import needed' : 'Local workspace'}</span></div><div className="settings-fields"><label className="field-label">API base URL<input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://your-api.example.com"/></label><label className="field-label">Email<input value={accountEmail} onChange={e => setAccountEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="username"/></label><label className="field-label">Password<input value={accountPassword} onChange={e => setAccountPassword(e.target.value)} placeholder="At least 10 characters" type="password" autoComplete={connectionMode === 'create' ? 'new-password' : 'current-password'}/></label><div className="settings-actions"><button className="primary-button" disabled={settingsBusy || !apiUrl} onClick={setupAccount}>{settingsBusy ? 'Connecting…' : connectionMode === 'create' ? 'Create account' : 'Sign in'} <Icon name="arrow" size={15}/></button><button className="text-button" type="button" onClick={() => setConnectionMode(connectionMode === 'create' ? 'login' : 'create')}>{connectionMode === 'create' ? 'I already have an account' : 'Create a new account'}</button>{remoteUserId && <span className="settings-id">Account {remoteUserId.slice(0, 8)}…</span>}</div>{remoteToken && !serverHasWorkspace && <div className="import-panel"><p>Your server account has no saved workspace. Import habits and related data from this browser. Sample habits are excluded. Your local copy will remain in this browser until the server confirms the import.</p><button className="secondary-button" type="button" onClick={() => void importLocalWorkspace()}>Import this browser’s data</button><label className="text-button">Restore from backup<input type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { await importLocalWorkspace(JSON.parse(await file.text())); } catch { setConnectionError("That backup file could not be read as Habitly JSON. The original file is unchanged."); } event.currentTarget.value = ""; }}/></label><button type="button" className="text-button" onClick={() => void exportWorkspaceBackup()}>Save current browser copy</button></div>}</div></section>{labs && <section className="settings-card telegram-settings"><div className="settings-card-head"><div className="telegram-icon"><Icon name="send" size={20}/></div><div><span className="eyebrow">Habit changer bot</span><h2>Log from Telegram</h2><p>Link a private chat, then text “done” with the habit name.</p></div><span className={`connection-badge ${telegramCommand ? 'connected' : ''}`}><i/>{telegramCommand ? 'Link ready' : 'Not linked'}</span></div><div className="telegram-steps"><div><b>01</b><span>Configure <code>Telegram_bot_token</code> and <code>Telegram_webhook_secret</code> on the API.</span></div><div><b>02</b><span>Generate a one-time link command below, then send it to your bot.</span></div><div><b>03</b><span>Send “done Read one page” to log a habit and get your resilient streak.</span></div></div><div className="settings-actions"><button className="secondary-button" disabled={settingsBusy || !remoteUserId} onClick={connectTelegram}>Generate Telegram link <Icon name="arrow" size={14}/></button>{telegramCommand && <code className="telegram-command">{telegramCommand}</code>}</div></section>}<section className="settings-card settings-privacy"><div><span className="eyebrow">Your data</span><h2>Identity is a practice, not a performance.</h2><p>Demo habits are sample data. User habits and workspace records sync to your authenticated Habitly account when connected. Offline edits stay on this device until you reconnect and are never presented as server saved.</p></div></section></>;
  }

  function renderPage() {
    if (active === 'Logging' || active === 'Journal' || active === 'Tracker' || active === 'History') return renderLogging();
    if (active === 'My habits') return renderHabits();
    if (active === 'Habit scorecard') return renderScorecard();
    if (active === 'Community') return renderCommunity();
    if (active === 'Recovery') return renderRecovery();
    if (active === 'Reward vault') return renderVault();
    if (active === 'Habit to break') return renderAntiHabit();
    if (active === 'Playbook') return renderPlaybook();
    if (active === 'Settings') return renderSettings();
    return renderToday();
  }

  return <div className="app-shell">
    <aside id="main-navigation" className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#today" onClick={e => { e.preventDefault(); setActive('Today'); setMobileNav(false); }}><span className="brand-mark">h</span><span>habitly<span className="brand-dot">.</span></span></a>
      <div className="sidebar-caption">Your space</div>
      <nav className="side-nav">{nav.map(item => <button key={item.title} className={`nav-item ${active === item.title ? 'nav-active' : ''}`} onClick={() => { setActive(item.title); if (item.title === 'Journal') setLoggingView('Log'); if (item.title === 'Tracker') setLoggingView('Insights'); if (item.title === 'History') setLoggingView('History'); setMobileNav(false); }}><Icon name={item.icon}/><span>{item.title === 'Recovery' ? 'Recovery' : item.title === 'My habits' ? 'Habits' : item.title === 'Habit scorecard' ? 'Scorecard' : item.title === 'Reward vault' ? 'Rewards' : item.title}</span>{item.title === 'Recovery' && needRecovery && <i className="nav-alert"/>}{item.title === 'Reward vault' && unlockedRewards.length > 0 && <i className="nav-unlocked"/>}</button>)}</nav>
      <button className="sidebar-new" onClick={() => { setMobileNav(false); startNewHabit('BUILD'); }}><span><Icon name="plus" size={17}/></span><span>Build a habit</span><kbd>⌘ K</kbd></button>
      <div className="sidebar-bottom"><button className="identity-link" onClick={() => { setMobileNav(false); setShowIdentity(true); }}>Edit identity</button></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label={mobileNav ? "Close navigation" : "Open navigation"} aria-expanded={mobileNav} aria-controls="main-navigation"><Icon name={mobileNav ? 'x' : 'menu'}/></button><div className="breadcrumb"><button type="button" className="breadcrumb-home" aria-label="Go to Habitly home" onClick={() => { setActive('Today'); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Habitly</button><span className="crumb-slash">/</span><b>{active}</b></div><div className="topbar-right"><button className="theme-toggle" onClick={() => setDarkMode(value => !value)} aria-label={`Switch to ${darkMode ? 'light' : 'dark'} theme`} title={`Switch to ${darkMode ? 'light' : 'dark'} theme`}><Icon name={darkMode ? 'sun' : 'moon'} size={16}/></button><button className="theme-toggle" onClick={refreshApp} aria-label="Refresh app" title="Refresh app"><Icon name="refresh" size={16}/></button></div></header>
      <div className="content-wrap">{connectionError && <div className="connection-error" role="alert">{connectionError} <button type="button" className="text-button" onClick={() => void exportWorkspaceBackup()}>Save current browser copy</button></div>}{accountabilityInvite && <section className="accountability-invite-banner"><div><span className="eyebrow">Accountability invitation</span><h2>{accountabilityInvite.partner_name || accountabilityInvite.partner_email} was asked to support a habit</h2><p><b>{accountabilityInvite.habit}</b><br/>{accountabilityInvite.agreement} · Commitment: {accountabilityInvite.consequence}</p><small>Recent activity: {(accountabilityInvite.recent_activity ?? []).map((log: any) => `${log.date} ${log.status.toLowerCase()}`).join(' · ') || 'No check-ins logged yet'}</small></div>{accountabilityInvite.status === 'ACCEPTED' ? <span className="connection-badge connected">Accepted</span> : <button className="primary-button" onClick={() => void acceptAccountabilityInvite()}>Accept invitation</button>}</section>}{renderPage()}</div>
      <footer className="main-footer"><span>Made of small things.</span><span>Consistency over intensity <i><Icon name="spark" size={15}/></i></span></footer>
    </main>

    {hydrated && createPortal(<>
    {habitToDelete && <div className="modal-backdrop delete-habit-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setHabitToDelete(null); }}><section className="identity-modal delete-habit-modal" role="dialog" aria-modal="true" aria-labelledby="delete-habit-title"><h2 id="delete-habit-title">Delete this habit?</h2><p>“{habitToDelete.name}” will be removed from your active habits. Past activity is retained.</p><div className="delete-habit-actions"><button type="button" className="secondary-button" onClick={() => setHabitToDelete(null)}>Cancel</button><button type="button" className="delete-confirm-button" onClick={() => deleteHabit(habitToDelete)}>Delete habit</button></div></section></div>}

    {showBuilder && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowBuilder(false); }}><section className="builder-modal habit-builder" role="dialog" aria-modal="true" aria-labelledby="builder-title">
      <header className="modal-header"><div><span className="eyebrow">Your habit plan</span><h2 id="builder-title">{editingHabitId ? 'Edit your plan' : habitType === 'BREAK' ? 'Change a habit' : 'Build a habit'}</h2><p>{habitType === 'BREAK' ? 'Name the habit you want to change, then make a replacement routine for the moments it shows up.' : 'Name your habit and choose a cue. Add a starter action if it would help.'}</p></div><button type="button" className="modal-close" onClick={() => setShowBuilder(false)} aria-label="Close builder"><Icon name="x"/></button></header>
      <div className="builder-form"><div className="basics-page">
        {!editingHabitId && <div className="form-kind-tabs"><button type="button" className={habitType === 'BUILD' ? 'selected' : ''} onClick={() => { setHabitType('BUILD'); setGatewayMinutes(0); setCueType('STACK'); setTechniqueIds([]); setTechniqueNotes({}); }}>Build a habit</button><button type="button" className={habitType === 'BREAK' ? 'selected' : ''} onClick={() => { setHabitType('BREAK'); setGatewayMinutes(0); setCueType('STACK'); setTechniqueIds([]); setTechniqueNotes({}); }}>Break a habit</button></div>}
        {editingHabitId && <label className="field-label">Habit name <span className="optional">Shown on your habit card</span><input value={habitName} onChange={e => setHabitName(e.target.value)} placeholder="Name this habit" required/></label>}
        <label className="field-label">{editingHabitId ? 'Target action' : habitType === 'BUILD' ? 'What do you want to do?' : 'What habit do you want to change?'}<input value={targetAction} onChange={e => setTargetAction(e.target.value)} placeholder={habitType === 'BUILD' ? 'e.g. Run three miles' : 'e.g. Scroll social media in bed'} required/></label>
        {habitType === 'BUILD' && <><label className="field-label">How many times per day? <span className="optional">Default: once</span><input type="number" min="1" max="20" step="1" value={dailyTarget} onChange={e => updateDailyTargetDraft(e.target.value)} onBlur={() => updateDailyTargetDraft(String(Math.max(1, Math.min(20, Number(dailyTarget) || 1))))}/><span className="field-example">Set this above 1 for routines you want to repeat during the day.</span></label>{Number(dailyTarget) > 1 && <section className="daily-step-editor"><div className="daily-step-editor-heading"><div><b>Daily repetitions</b><p>Drag to reorder. Rename or remove any entry.</p></div><span>{dailySteps.length} / 20</span></div><div className="daily-step-editor-list">{dailySteps.map((step, index) => <div key={step.id} className={`daily-step-editor-row${dailyStepDragId === step.id ? ' is-dragging' : ''}${dailyStepDropId === step.id ? ' is-drop-target' : ''}`} onDragOver={event => { event.preventDefault(); setDailyStepDropId(step.id); }} onDrop={event => { event.preventDefault(); moveDailyStep(dailyStepDragId, step.id); setDailyStepDragId(''); setDailyStepDropId(''); }}><button type="button" className="daily-step-grip" draggable aria-label={`Drag ${step.label} to reorder`} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; setDailyStepDragId(step.id); }} onDragEnd={() => { setDailyStepDragId(''); setDailyStepDropId(''); }}><span aria-hidden="true">⠿</span></button><input aria-label={`Repetition ${index + 1} name`} value={step.label} onChange={event => setDailySteps(current => current.map(item => item.id === step.id ? { ...item, label: event.target.value } : item))}/><button type="button" className="daily-step-remove" onClick={() => removeDailyStep(step.id)} aria-label={`Remove ${step.label}`}>×</button></div>)}</div><button type="button" className="daily-step-add" onClick={addDailyStep} disabled={dailySteps.length >= 20}>＋ Add repetition</button></section>}</>}
        {habitType === 'BREAK' && <label className="field-label">How often does it happen now? <span className="optional">Optional estimate per day</span><input type="number" min="0" max="1000" value={baselineDaily} onChange={e => setBaselineDaily(e.target.value)}/></label>}
{habitType === 'BREAK' ? <><div className="field-label">How do you want to use replacement habits?<div className="cue-tabs" role="group" aria-label="Choose how replacement habits work"><button type="button" aria-pressed={replacementMode === 'STACK'} className={replacementMode === 'STACK' ? 'cue-tab-selected' : ''} onClick={() => setReplacementMode('STACK')}>Stack only</button><button type="button" aria-pressed={replacementMode === 'OPTIONS'} className={replacementMode === 'OPTIONS' ? 'cue-tab-selected' : ''} onClick={() => setReplacementMode('OPTIONS')}>Choose one (OR)</button><button type="button" aria-pressed={replacementMode === 'BOTH'} className={replacementMode === 'BOTH' ? 'cue-tab-selected' : ''} onClick={() => setReplacementMode('BOTH')}>Stack + options</button></div></div>{replacementMode !== 'OPTIONS' && <MultiAnswerField label="Steps for your replacement routine" helper="When the cue appears, move through these steps in order. Keep the first one small enough to repeat." values={replacementActions} onChange={setReplacementActions} ordered addLabel="Add another step" placeholder="Write one step"/>}{replacementMode !== 'STACK' && <MultiAnswerField label="Alternative replacement habits" helper={replacementMode === 'BOTH' ? 'Use one of these instead of the stacked routine when another option fits better.' : 'Add different actions you could take when the cue appears. Choose whichever option fits the moment.'} values={replacementOptions} onChange={setReplacementOptions} addLabel="Add another option" placeholder="Write one replacement habit"/>}</> : <label className="field-label">Starter action <span className="optional">Optional</span><input value={gatewayAction} onChange={e => setGatewayAction(e.target.value)} placeholder={targetAction ? suggestStarter(targetAction) : 'Add a starter if it would help'}/></label>}{habitType === 'BUILD' && targetAction && <p className="form-note">Add a smaller first step only if it would help. You can also start with the full habit.</p>}{habitType === 'BUILD' && renderDifficultyBuilder()}      </div><div className="laws-page">
        <section className="builder-law" data-law="cue"><div className="builder-law-heading"><span className="builder-law-index"><Icon name="clock" size={16}/></span><div><small>Set the moment</small><h3>{habitType === 'BUILD' ? 'When will you start?' : 'What usually triggers it?'}</h3></div></div><div className="law-fields">        <div className="field-label">{habitType === 'BUILD' ? 'Choose a cue for your routine' : 'Notice the cue that starts the old routine'}<div className="cue-tabs" role="group" aria-label="Choose a cue type"><button type="button" aria-pressed={cueType === 'STACK'} className={cueType === 'STACK' ? 'cue-tab-selected' : ''} onClick={() => setCueType('STACK')}>After a routine or cue</button><button type="button" aria-pressed={cueType === 'TIME_LOCATION'} className={cueType === 'TIME_LOCATION' ? 'cue-tab-selected' : ''} onClick={() => setCueType('TIME_LOCATION')}>At a time and place</button></div></div>
        {habitType === 'BREAK' && cueType === 'STACK' ? <MultiAnswerField label="Cue details" helper="" values={breakPlanAnswers.cueTriggers} onChange={values => updateBreakAnswer('cueTriggers', values)} addLabel="Add another cue" placeholder="Add a cue" optional/> : habitType === 'BREAK' && cueType === 'TIME_LOCATION' ? <div className="multi-answer-field"><div className="multi-answer-heading"><span className="field-label multi-answer-label">Time and place cues</span><span className="optional">Optional</span></div><p className="multi-answer-helper">Add a time and place for each situation. Examples: around 9 PM in bed; after work at my desk.</p><div className="break-cue-pairs">{breakPlanAnswers.cueTimes.map((value, index) => <div className="break-cue-pair" key={`break-cue-${index}`}><span className="multi-answer-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><input aria-label={`Cue ${index + 1} time`} value={value} placeholder="Add time" onChange={event => updateBreakCuePair(index, 'cueTimes', event.target.value)}/><input aria-label={`Cue ${index + 1} place`} value={breakPlanAnswers.cueLocations[index] ?? ''} placeholder="Add place" onChange={event => updateBreakCuePair(index, 'cueLocations', event.target.value)}/><button type="button" className="multi-answer-remove" aria-label={`Remove cue ${index + 1}`} onClick={() => removeBreakCuePair(index)}>×</button></div>)}</div><button type="button" className="multi-answer-add" onClick={addBreakCuePair}><span aria-hidden="true">+</span>Add another time and place</button></div> : cueType === 'TIME_LOCATION' ? <div className="field-two"><label className="field-label">Time<input type="text" inputMode="text" value={time} onChange={e => setTime(e.target.value)} placeholder="Add time" required={habitType === 'BUILD'}/></label><label className="field-label">Location<input value={location} onChange={e => setLocation(e.target.value)} placeholder="Add place" required={habitType === 'BUILD'}/></label></div> : <label className="field-label">After this existing habit<input value={cue} onChange={e => setCue(e.target.value)} placeholder="Add a cue" required={habitType === 'BUILD'}/><span className="field-example">Example: after I pour my first coffee.</span></label>}

</div></section><section className="law-picker" aria-label="Choose habit laws to apply">
        <div className="law-picker-heading"><b>Choose which laws to apply</b><p>{habitType === 'BREAK' ? 'Open any laws you want to work on, then choose at least one strategy. You can keep multiple open.' : 'Your cue is already part of every plan. Open any law for extra details or strategies. You can keep multiple open.'}</p></div>
        <details className="law-choice"><summary><span className="law-choice-index">01</span><span className="law-choice-label"><b>Cue</b><small>{lawGroups[0][habitType === 'BUILD' ? 'build' : 'break']}</small></span></summary><div className="law-choice-body">
          {renderLawAnswerTabs('cue', habitType === 'BUILD' ? <label className="field-label">Prepare your environment <span className="optional">Optional</span><input value={prepStep} onChange={e => setPrepStep(e.target.value)} placeholder="e.g. leave my book on the pillow"/></label> : <MultiAnswerField label="Cue to hide" helper="List reminders or triggers you can remove or make less visible. Example: keep my phone outside the bedroom." values={breakPlanAnswers.cuesToHide} onChange={values => updateBreakAnswer('cuesToHide', values)} optional placeholder="Add a cue to hide"/>)}
          <button type="button" className="text-button" onClick={() => setInfoModal({ type: 'law', law: lawGroups[0].id })}>Learn about this law</button>{renderTechniqueChooser(lawGroups[0].id)}
        </div></details>
        <details className="law-choice"><summary><span className="law-choice-index">02</span><span className="law-choice-label"><b>Craving</b><small>{lawGroups[1][habitType === 'BUILD' ? 'build' : 'break']}</small></span></summary><div className="law-choice-body">
        <section className="builder-law" data-law="craving"><div className="law-choice-info-row"><span>{lawGroups[1].prompt}</span><button type="button" className="law-info" aria-label={`Learn about ${habitType === 'BUILD' ? lawGroups[1].build : lawGroups[1].break}`} title="Learn about this law" onClick={() => setInfoModal({ type: 'law', law: lawGroups[1].id })}>i</button></div>{renderLawAnswerTabs('craving', <div className="law-fields">{habitType === 'BUILD' ? <label className="field-label">Why do you want this? <span className="optional">Optional</span><input value={motive} onChange={e => setMotive(e.target.value)} placeholder="Add your reason"/></label> : <MultiAnswerField label="What need does the old habit meet?" helper="Add each need it meets, such as relief, stimulation, comfort, or connection." values={breakPlanAnswers.underlyingNeeds} onChange={values => updateBreakAnswer('underlyingNeeds', values)} placeholder="Add a need"/>}{habitType === 'BUILD' ? <><label className="field-label">Motivation ritual <span className="optional">Optional</span><input value={ritual} onChange={e => setRitual(e.target.value)} placeholder="e.g. play a favorite song before starting"/></label><label className="field-label">Temptation bundle <span className="optional">Optional</span><input value={bundle} onChange={e => setBundle(e.target.value)} placeholder="Something enjoyable to pair with your habit"/></label></> : <MultiAnswerField label="Reframe the old routine" helper="Write benefits of changing that matter to you. Example: I have more energy when I sleep well." values={breakPlanAnswers.reframes} onChange={values => updateBreakAnswer('reframes', values)} optional placeholder="Add a reminder"/>}</div>)}{renderTechniqueChooser(lawGroups[1].id)}</section></div></details>
        <details className="law-choice"><summary><span className="law-choice-index">03</span><span className="law-choice-label"><b>Response</b><small>{lawGroups[2][habitType === 'BUILD' ? 'build' : 'break']}</small></span></summary><div className="law-choice-body"><section className="builder-law" data-law="response"><div className="law-choice-info-row"><span>{lawGroups[2].prompt}</span><button type="button" className="law-info" aria-label={`Learn about ${habitType === 'BUILD' ? lawGroups[2].build : lawGroups[2].break}`} title="Learn about this law" onClick={() => setInfoModal({ type: 'law', law: lawGroups[2].id })}>i</button></div>{renderLawAnswerTabs('response', <div className="law-fields">{habitType === 'BUILD' ? <><label className="field-label">Starter length <span className="optional">Optional minutes</span><input type="number" min="1" max="1440" step="1" value={gatewayMinutes || ''} onChange={e => setGatewayMinutes(e.target.value === '' ? 0 : Number(e.target.value))} placeholder="Set a length only if useful"/></label><p className="duration-hint">Choose any length that fits, or leave this blank to use your full habit target.</p></> : <MultiAnswerField label="Friction to add" helper="List practical ways to make the old routine harder to start. Example: leave my phone charging in another room." values={breakPlanAnswers.frictionIdeas} onChange={values => updateBreakAnswer('frictionIdeas', values)} optional placeholder="Add a friction idea"/>}</div>)}{renderTechniqueChooser(lawGroups[2].id)}</section></div></details>
        <details className="law-choice"><summary><span className="law-choice-index">04</span><span className="law-choice-label"><b>Reward</b><small>{lawGroups[3][habitType === 'BUILD' ? 'build' : 'break']}</small></span></summary><div className="law-choice-body"><section className="builder-law" data-law="reward"><div className="law-choice-info-row"><span>{lawGroups[3].prompt}</span><button type="button" className="law-info" aria-label={`Learn about ${habitType === 'BUILD' ? lawGroups[3].build : lawGroups[3].break}`} title="Learn about this law" onClick={() => setInfoModal({ type: 'law', law: lawGroups[3].id })}>i</button></div>{renderLawAnswerTabs('reward', <div className="law-fields">{habitType === 'BUILD' ? <label className="field-label">What immediate reward will make this satisfying? <span className="optional">Optional</span><input value={reward} onChange={e => setReward(e.target.value)} placeholder="Add a small reward"/></label> : <MultiAnswerField label="What payoff does the old routine give you?" helper="List what it gives you in the moment. Examples: relief, entertainment, comfort, or connection." values={breakPlanAnswers.oldPayoffs} onChange={values => updateBreakAnswer('oldPayoffs', values)} placeholder="Add a payoff"/>}{habitType === 'BREAK' ? <MultiAnswerField label="Habit contract" helper="Add each clear commitment you want to make. Example: when the urge starts, I will wait five minutes before deciding." values={breakPlanAnswers.agreements} onChange={values => updateBreakAnswer('agreements', values)} optional placeholder="Add a commitment"/> : <label className="field-label">Habit contract <span className="optional">Optional</span><input value={contract} onChange={e => setContract(e.target.value)} placeholder="Add a commitment"/></label>}</div>)}<div className="field-two"><label className="field-label">Accountability partner <span className="optional">Optional</span><input value={accountabilityPartner} onChange={e => setAccountabilityPartner(e.target.value)} placeholder="Someone you trust"/></label><label className="field-label">Partner email <span className="optional">Optional</span><input type="email" value={accountabilityEmail} onChange={e => setAccountabilityEmail(e.target.value)} placeholder="friend@example.com"/></label></div><label className="field-label">Agreed consequence <span className="optional">Optional</span><input value={accountabilityCost} onChange={e => setAccountabilityCost(e.target.value)} placeholder="A specific, agreed stake"/></label><p className="contract-safety-note">Keep any stake safe, affordable, and agreed with your partner.</p>{renderTechniqueChooser(lawGroups[3].id)}</section></div></details>
      </section></div>
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowBuilder(false)}>Cancel</button><button className="primary-button" type="button" onClick={e => { for (const field of Array.from(e.currentTarget.closest('.habit-builder')?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[required], textarea[required]') ?? [])) if (!field.reportValidity()) return; void createHabit(); }}>{editingHabitId ? 'Save changes' : habitType === 'BREAK' ? 'Save change plan' : 'Add my habit'} <Icon name="arrow" size={16}/></button></div></section></div>}

    {infoModal && <div className="modal-backdrop info-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setInfoModal(null); }}>
      <section key={infoModal.type === 'law' ? `law-${infoModal.law}` : infoModal.type === 'technique' ? `technique-${infoModal.id}` : `suggested-${infoModal.index}`} className="builder-modal learning-modal" role="dialog" aria-modal="true" aria-labelledby="learning-title">
        <header className="modal-header"><div>
          <span className="eyebrow">{infoModal.type === 'law' ? 'Four laws guide' : infoModal.type === 'technique' ? 'Technique guide' : 'Additional NotebookLM idea'}</span>
          <h2 id="learning-title">{infoModal.type === 'law' ? ((infoModal.mode ?? habitType) === 'BUILD' ? notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws]?.buildName : notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws]?.breakName) : infoModal.type === 'technique' ? techniqueMap[infoModal.id]?.name : notebookLMContent.suggestedTechniques[infoModal.index]?.name}</h2>
          <p>{infoModal.type === 'law' ? ((infoModal.mode ?? habitType) === 'BUILD' ? notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws]?.cardText : 'A practical guide to changing an unwanted habit.') : infoModal.type === 'technique' ? techniqueMap[infoModal.id]?.description : notebookLMContent.suggestedTechniques[infoModal.index]?.assignment}</p>
        </div><button className="modal-close" onClick={() => setInfoModal(null)} aria-label="Close"><Icon name="x"/></button></header>
        <div className="learning-modal-body">{infoModal.type === 'law' && notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws] ? (() => { const guide = notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws]; return <div className="learning-content">
          <h3>What this law means</h3><p>{(infoModal.mode ?? habitType) === 'BREAK' ? guide.breakExplanation : guide.explanation}</p>
          {(infoModal.mode ?? habitType) === 'BREAK' && <><h3>Practical steps</h3><ol>{guide.breakSteps.map((step, index) => <li key={index}>{step}</li>)}</ol>
          <h3>Examples</h3><ul className="learning-example-list">{guide.breakExamples.map((example, index) => <li key={index}>{example}</li>)}</ul></>}
          {(infoModal.mode ?? habitType) === 'BUILD' && <><h3>Practical steps</h3><ol>{guideList(guide.steps).map((step, index) => <li key={index}>{step}</li>)}</ol>
          <h3>Examples</h3><ul className="learning-example-list">{guideList(guide.examples).map((example, index) => <li key={index}>{example}</li>)}</ul>
          <div className="learning-inversion"><b>{guide.breakName}</b><p>{guide.breakGuidance}</p></div></>}
          <p className="learning-source">Source: <i>Atomic Habits</i>, {guide.source}{(infoModal.mode ?? habitType) === 'BREAK' && <> See also <a href="https://jamesclear.com/atomic-habits-summary" target="_blank" rel="noopener noreferrer">James Clear’s guide to the four laws</a>.</>}</p>
        </div>; })() : infoModal.type === 'technique' && techniqueMap[infoModal.id] ? (() => { const item = techniqueMap[infoModal.id]; const guide = getNotebookTechnique(infoModal.id, infoModal.mode ?? habitType); const suggestedNames: Record<string, string> = { 'habits-scorecard': 'The Habits Scorecard', 'activity-zones': 'One Space', 'group-norms': 'Imitating the Close', 'active-practice': 'Action vs. Motion', 'goldilocks-rule': 'The Goldilocks Rule', 'paper-clips': 'The Paper Clip Strategy', 'nonscale-victories': 'Nonscale Victories Tracking' }; const suggestion = notebookLMContent.suggestedTechniques.find(entry => entry.name.includes(suggestedNames[infoModal.id] ?? '\u0000')); return <div className="learning-content">
          {guide?.cardText && <div className="learning-example"><b>Technique at a glance</b><p>{guide.cardText}</p></div>}
          <h3>How it works</h3><p>{guide?.explanation ?? suggestion?.rationale ?? item.description}</p>
          <h3>Practical steps</h3><ol>{guideList(guide?.steps ?? suggestion?.rationale ?? item.description).map((step, index) => <li key={index}>{step}</li>)}</ol>
          <h3>Examples for {(infoModal.mode ?? habitType) === 'BUILD' ? 'building a habit' : 'changing a habit'}</h3><ul className="learning-example-list">{(guide?.examples.length ? guide.examples : [item.example]).map((example, index) => <li key={index}>{example}</li>)}</ul>
          <h3>Related laws</h3><div className="learning-related-laws">{item.laws.filter(id => lawGroups.some(law => law.id === id)).map(id => <button type="button" key={id} onClick={() => setInfoModal({ type: 'law', law: id, mode: infoModal.mode })}>{(infoModal.mode ?? habitType) === 'BUILD' ? lawGroups.find(law => law.id === id)?.build : lawGroups.find(law => law.id === id)?.break} <Icon name="arrow-up-right" size={14}/></button>)}</div>
          {guide?.sources.length ? <p className="learning-source">Source: <i>Atomic Habits</i>, {guide.sources.join(' ')}</p> : suggestion ? <p className="learning-source">Source: <i>Atomic Habits</i>, {suggestion.source}</p> : <p className="learning-source">Example from Habitly’s technique guide.</p>}
        </div>; })() : infoModal.type === 'suggested' ? (() => { const idea = notebookLMContent.suggestedTechniques[infoModal.index]; return <div className="learning-content"><div className="learning-example"><b>Suggested placement</b><p>{idea.assignment}</p></div><h3>Why it fits</h3><p>{idea.rationale}</p><p className="learning-source">Source reference: <i>Atomic Habits</i>, {idea.source}</p></div>; })() : null}</div>
      </section>
    </div>}
    {diagnosticOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDiagnosticOpen(false); }}><section className="builder-modal diagnostic-modal" role="dialog" aria-modal="true" aria-labelledby="diagnostic-title"><header className="modal-header"><div><span className="eyebrow">ROUTINE DIAGNOSTIC · STEP {diagnosticStep + 1} OF 4</span><h2 id="diagnostic-title">Understand the loop</h2><p>Observe the behavior with curiosity before you try to change it.</p></div><button className="modal-close" onClick={() => setDiagnosticOpen(false)} aria-label="Close"><Icon name="x"/></button></header><form className="builder-form" onSubmit={saveDiagnostic}><div hidden={diagnosticStep !== 0} data-diagnostic-step="0"><label className="field-label">1. Identify the routine<input value={diagnosticDraft.routine} onChange={e => setDiagnosticDraft(d => ({ ...d, routine: e.target.value }))} placeholder="What do you do, step by step?" required/></label><p className="form-note">Describe the action as it happens, without judging yourself.</p></div><div hidden={diagnosticStep !== 1} data-diagnostic-step="1"><label className="field-label">2. What craving might it satisfy?<input value={diagnosticDraft.craving} onChange={e => setDiagnosticDraft(d => ({ ...d, craving: e.target.value }))} placeholder="Relief, connection, stimulation, rest…" required/></label><label className="field-label">Experiment with the reward<input value={diagnosticDraft.rewardExperiment} onChange={e => setDiagnosticDraft(d => ({ ...d, rewardExperiment: e.target.value }))} placeholder="What quick reward could meet that need?" required/></label></div><div hidden={diagnosticStep !== 2} data-diagnostic-step="2"><p className="form-note">3. ISOLATE THE CUE. What was happening just before the routine?</p><div className="field-two"><label className="field-label">Time<input value={diagnosticDraft.cueTime} onChange={e => setDiagnosticDraft(d => ({ ...d, cueTime: e.target.value }))} placeholder="e.g. 3 PM"/></label><label className="field-label">Location<input value={diagnosticDraft.cueLocation} onChange={e => setDiagnosticDraft(d => ({ ...d, cueLocation: e.target.value }))} placeholder="e.g. at my desk"/></label><label className="field-label">Emotion<input value={diagnosticDraft.cueEmotion} onChange={e => setDiagnosticDraft(d => ({ ...d, cueEmotion: e.target.value }))} placeholder="e.g. bored or stressed"/></label><label className="field-label">People<input value={diagnosticDraft.cuePeople} onChange={e => setDiagnosticDraft(d => ({ ...d, cuePeople: e.target.value }))} placeholder="Who was around?"/></label></div><p className="form-note">Leave any cue blank if you have not noticed it yet.</p></div><div hidden={diagnosticStep !== 3} data-diagnostic-step="3"><label className="field-label">4. Make a plan<input value={diagnosticDraft.plan} onChange={e => setDiagnosticDraft(d => ({ ...d, plan: e.target.value }))} placeholder="When I notice the cue, I’ll try…" required/></label><p className="form-note">Choose one small experiment for the next time the cue appears.</p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => diagnosticStep ? setDiagnosticStep(diagnosticStep - 1) : setDiagnosticOpen(false)}>{diagnosticStep ? 'Back' : 'Cancel'}</button>{diagnosticStep < 3 ? <button type="button" className="primary-button" onClick={e => { const section = e.currentTarget.closest('form')?.querySelector(`[data-diagnostic-step="${diagnosticStep}"]`); const fields = section?.querySelectorAll<HTMLInputElement>('input[required]'); for (const field of Array.from(fields ?? [])) if (!field.reportValidity()) return; setDiagnosticStep(diagnosticStep + 1); }}>Continue <Icon name="arrow" size={16}/></button> : <button className="primary-button" type="submit">Save diagnostic <Icon name="arrow" size={16}/></button>}</div></form></section></div>}
    {showIdentity && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowIdentity(false); }}><section className="identity-modal" role="dialog" aria-modal="true" aria-labelledby="identity-title"><button className="modal-close" onClick={() => setShowIdentity(false)} aria-label="Close"><Icon name="x"/></button><span className="identity-modal-star"><Icon name="spark" size={18}/></span><span className="eyebrow">Identity before outcome</span><h2 id="identity-title">Who do you want to become?</h2><p>An outcome tells you what you want. An identity gives you a direction to practice.</p><form onSubmit={saveIdentity}><label className="field-label">What’s the outcome you’re after?<input value={goal} onChange={e => { setGoal(e.target.value); const reframe = reframeGoal(e.target.value); if (reframe) setIdentity(reframe); }} placeholder="e.g. write a book"/></label><div className="reframe-card"><span>To move toward that, practice being…</span><input value={identity} onChange={e => setIdentity(e.target.value)} placeholder="e.g. The Writer"/><small>Every small action becomes a vote for this person.</small></div><button className="primary-button identity-save" type="submit">Save my identity <Icon name="arrow" size={16}/></button></form></section></div>}
    {celebrating && <div className="celebration-overlay" aria-hidden="true"><div className="celebration-spark"><Icon name="spark" size={18}/></div><div className="celebration-copy"><span>A vote cast</span><b>That’s how you become<br/>{identity.toLowerCase()}.</b><small>One small action matters.</small></div><i className="confetti confetti-one"/><i className="confetti confetti-two"/><i className="confetti confetti-three"/><i className="confetti confetti-four"/><i className="confetti confetti-five"/><i className="confetti confetti-six"/></div>}
    {pendingHabitDeletions.map((deletion, index) => <div className="toast-message toast-habit-delete" role="status" key={deletion.id} style={{ bottom: `${24 + (pendingHabitDeletions.length - index - 1) * 62}px` }}><span className="toast-star"><Icon name="spark" size={18}/></span><span className="toast-delete-copy">Habit removed.</span><button type="button" className="toast-undo-button" onClick={() => undoHabitDeletion(deletion.id)} aria-label={`Undo deleting ${deletion.habit.name}`}>Undo</button></div>)}
    {toast && <div className="toast-message" role="status" style={pendingHabitDeletions.length ? { bottom: `${24 + pendingHabitDeletions.length * 62}px` } : undefined}><span className="toast-star"><Icon name="spark" size={18}/></span><span>{toast}</span>{toastUndo?.message === toast && <button type="button" className="toast-undo-button" onClick={toastUndo.onUndo}>{toastUndo.label}</button>}</div>}
    </>, document.body)}
  </div>;
}
