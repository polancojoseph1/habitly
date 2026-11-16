'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { buildStrategyGap, buildSuggestedExperiment, buildTechniquePracticeStats, mostCommonTrigger, mostPracticedTechnique } from './insights';
import { isPeriodOccurrenceCoverageComplete } from './period-checkin';
import { PeriodCheckin } from './period-checkin-view';
import notebookLMContent from './notebooklm-content.json';
import { lawGroups, techniques, techniqueMap } from './techniques';
import type { ChangeMode, Law } from './techniques';
import { applyBehaviorLogChanges, behaviorDayKey, dateKeyInZone, episodeKey, episodeResolvedOutcome, isRecoveryPrincipleApplication, localDateKeys, metadataForEditedTimestamp, minutesToCravingResolution, outcomeForCraving, removeBehaviorLogRecord, resolvedEpisodeOutcome, summarizeDay, withoutSampleBehaviorLogs } from './behavioral-logging';
import type { BehaviorLog, BehaviorType, DailyConfirmation, DailyConfirmationStatus } from './behavioral-logging';
import { createSampleSmokingConfirmations, createSampleSmokingLogs } from './sample-smoking-data';

type CueType = 'TIME_LOCATION' | 'STACK';
type Habit = {
  id: string; name: string; target: string; gateway: string; cueType: CueType;
  gatewayMinutes: number;
  cue: string; time?: string; location?: string; motive: string; reward: string;
  prep: string; completed: boolean; missedYesterday: boolean; streak: number;
  kind: 'BUILD' | 'BREAK'; hideCue?: string; friction?: string; contract?: string; aversionReminder?: string; frictionVotes?: number; rewardBundle?: string;
  alternativeRoutine?: string;
  ritual?: string; milestones?: string[]; milestoneIndex?: number; accountabilityPartner?: string; accountabilityEmail?: string; accountabilityCost?: string; inviteLink?: string;
  techniqueIds?: string[]; techniqueNotes?: Record<string, string>; baselineDaily?: number;
};
type HabitEvent = { id: string; habitId: string; type: 'ACTION_COMPLETED' | 'URGE_PASSED' | 'REPLACEMENT_USED' | 'OLD_HABIT'; at: string; note?: string; actualMinutes?: number; strategy?: string; variationId?: string; variationName?: string };
type HabitVariation = { id: string; habitId: string; law: Law; name: string; techniqueId?: string; setup: string; isActive: boolean; triedAt?: string; helped?: boolean | null; outcomeNote?: string; createdAt: string };
type ScorecardEntry = { id: string; behavior: string; rating: '+' | '-' | '=' };
type Diagnostic = { id: string; routine: string; craving: string; rewardExperiment: string; cueTime: string; cueLocation: string; cueEmotion: string; cuePeople: string; plan: string };
type Circle = { id: string; name: string; category: string; members: number; detail: string };
type Reward = { id: string; name: string; habitId: string; detail: string };
type Tab = 'Today' | 'Logging' | 'My habits' | 'Habit scorecard' | 'Community' | 'Recovery' | 'Reward vault' | 'Habit to break' | 'Playbook' | 'Settings';
type Palette = 'lavender' | 'ocean' | 'rose' | 'amber' | 'sage';
const palettes: { id: Palette; name: string; colors: [string, string, string] }[] = [
  { id: 'lavender', name: 'Lavender', colors: ['#6256c8', '#b8adff', '#efedff'] },
  { id: 'ocean', name: 'Ocean', colors: ['#287c9b', '#77c2d5', '#e3f5f8'] },
  { id: 'rose', name: 'Rose', colors: ['#b65d78', '#ec9cab', '#fff0f2'] },
  { id: 'amber', name: 'Amber', colors: ['#a96b25', '#e3ad62', '#fff3dc'] },
  { id: 'sage', name: 'Sage', colors: ['#527e70', '#91b6a2', '#e6f2eb'] },
];

const STORAGE = 'habitly-workspace-v2';
const REFRESH_VIEW_STORAGE = 'habitly-refresh-view-v1';
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
function localBackupHref() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
    delete snapshot.remoteToken;
    return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(snapshot, null, 2))}`;
  } catch { return 'data:application/json;charset=utf-8,%7B%7D'; }
}
function expandInviteLink(habit: Habit): Habit {
  const demoDefaults = habit.id === 'demo-smoking' ? demoHabits.find(item => item.id === habit.id) : undefined;
  const normalized = {
    ...demoDefaults,
    ...habit,
    techniqueIds: [...new Set([...(habit.techniqueIds ?? []), ...(demoDefaults?.techniqueIds ?? [])].filter(id => id !== 'never-miss-twice'))],
    techniqueNotes: { ...(demoDefaults?.techniqueNotes ?? {}), ...(habit.techniqueNotes ?? {}) },
  };
  return normalized.inviteLink?.startsWith('/?') && typeof window !== 'undefined'
    ? { ...normalized, inviteLink: `${window.location.origin}${normalized.inviteLink}` }
    : normalized;
}
const demoHabits: Habit[] = [
  { id: 'demo-smoking', name: 'Smoking', target: 'Quit smoking', gateway: 'Wait ten minutes and take a short walk', gatewayMinutes: 0, cueType: 'STACK', cue: 'I finish a meal or feel stressed', motive: '', reward: '', prep: 'Keep gum and water nearby', completed: false, missedYesterday: false, streak: 0, kind: 'BREAK', hideCue: 'Keep cigarettes and lighters out of reach', friction: 'Keep cigarettes and lighters out of the home, and take a route that avoids the shop.', alternativeRoutine: 'Walk outside without cigarettes or chew gum', techniqueIds: ['increase-friction', 'reframe-mindset', 'habit-tracking', 'commitment-device'], techniqueNotes: { 'increase-friction': 'Keep cigarettes and lighters out of the home; take a route that avoids the shop.', 'reframe-mindset': 'When stressed, remind myself that a craving passes without a cigarette.', 'habit-tracking': 'Mark each craving I resist on the calendar right away.', 'commitment-device': 'Set a ten-minute delay before opening cigarette delivery sites.' }, baselineDaily: 12 },
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
  { title: 'Today', icon: 'grid' }, { title: 'Logging', icon: 'clock' }, { title: 'My habits', icon: 'leaf' },
  { title: 'Habit to break', icon: 'spark' }, { title: 'Recovery', icon: 'heart' }, { title: 'Habit scorecard', icon: 'check' },
  { title: 'Reward vault', icon: 'lock' }, { title: 'Community', icon: 'heart' },
  { title: 'Playbook', icon: 'spark' }, { title: 'Settings', icon: 'heart' },
];

function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function weekDays() {
  const now = new Date(); const day = (now.getDay() + 6) % 7; const start = new Date(now); start.setDate(now.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), day: d.getDate(), today: d.toDateString() === now.toDateString(), date: todayKeyFromDate(d) }; });
}
function todayKeyFromDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function newRecordId(prefix: string) { return `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
function splitTags(value: string) { return [...new Set(value.split(',').map(tag => tag.trim()).filter(Boolean))]; }
function isSmokingHabit(habit: Habit) { return /smok|cigarette|tobacco/i.test(`${habit.name} ${habit.target}`); }
function occurrenceActionLabel(habit: Habit) {
  if (isSmokingHabit(habit)) return 'I Smoked';
  const name = habit.name.trim();
  if (/^i\s/i.test(name)) return name;
  if (/scroll/i.test(name)) return 'I Scrolled';
  if (/snack|eat/i.test(name)) return 'I Ate';
  if (/vape/i.test(name)) return 'I Vaped';
  return `I engaged in ${name.toLowerCase()}`;
}
function dayOffsetKey(offset: number) { const d = new Date(); d.setDate(d.getDate() + offset); return todayKeyFromDate(d); }
function getResilientStreak(history: Record<string, string[]>, habitId: string) {
  const today = new Date();
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
  const [habitEvents, setHabitEvents] = useState<HabitEvent[]>([]);
  const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>([]);
  const [loggingHabitId, setLoggingHabitId] = useState('demo-smoking');
  const [loggingView, setLoggingView] = useState<'Log' | 'Insights' | 'History'>('Log');
  const [logType, setLogType] = useState<BehaviorLog['type']>('craving');
  const [logTrigger, setLogTrigger] = useState('');
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
  const [insightDays, setInsightDays] = useState<number | '24h'>(30);
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
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderReturnTo, setBuilderReturnTo] = useState<Tab>('Today');
  const [infoModal, setInfoModal] = useState<{ type: 'law'; law: Law; mode?: 'BUILD' | 'BREAK' } | { type: 'technique'; id: string; mode?: 'BUILD' | 'BREAK' } | { type: 'suggested'; index: number } | null>(null);
  const [editingHabitId, setEditingHabitId] = useState('');
  const [habitToDelete, setHabitToDelete] = useState<Habit | null>(null);
  const [deletingHabit, setDeletingHabit] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [habitType, setHabitType] = useState<'BUILD' | 'BREAK'>('BUILD');
  const [cueType, setCueType] = useState<CueType>('TIME_LOCATION');
  const [targetAction, setTargetAction] = useState('');
  const [gatewayAction, setGatewayAction] = useState('');
  const [gatewayMinutes, setGatewayMinutes] = useState(2);
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
    let hasLocalWorkspace = false;
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        hasLocalWorkspace = true;
        const data = JSON.parse(saved);
        setHabitOrder(Array.isArray(data.habitOrder) ? data.habitOrder : []);
        const originalHabits: Habit[] = data.habits ?? demoHabits;
        const demoIds = new Set(demoHabits.map(habit => habit.id));
        const isSampleWorkspace = originalHabits.every(habit => habit.id.startsWith('demo-'));
        const savedById = new Map(originalHabits.map(habit => [habit.id, habit]));
        const savedHabits: Habit[] = (isSampleWorkspace
          ? [...demoHabits.map(habit => ({ ...habit, ...savedById.get(habit.id) })), ...originalHabits.filter(habit => !demoIds.has(habit.id))]
          : originalHabits).map(expandInviteLink);
        const savedHistory: Record<string, string[]> = data.history ?? demoHistory();
        if (data.dayKey && data.dayKey !== todayKey()) {
          const missedIds = savedHistory[dayOffsetKey(-1)] ?? [];
          setHabits(savedHabits.map(h => ({ ...h, completed: false, missedYesterday: missedIds.includes(`missed:${h.id}`) })));
        } else setHabits(savedHabits);
        const savedBehaviorLogs: BehaviorLog[] = data.behaviorLogs ?? [];
        const isUnconnectedSmokingSample = !data.remoteToken && isSampleWorkspace && originalHabits.some(habit => habit.id === 'demo-smoking');
        const hasCurrentSmokingSample = savedBehaviorLogs.some(log => log.id.startsWith('sample-log-smoking-') && log.techniqueId === 'commitment-device');
        const sampleSmokingLogs = isUnconnectedSmokingSample
          ? hasCurrentSmokingSample ? savedBehaviorLogs.filter(log => log.id.startsWith('sample-log-smoking-')) : createSampleSmokingLogs()
          : [];
        const loadedBehaviorLogs = isUnconnectedSmokingSample
          ? [...savedBehaviorLogs.filter(log => !log.id.startsWith('sample-log-smoking-')), ...sampleSmokingLogs]
          : withoutSampleBehaviorLogs(savedBehaviorLogs);
        const savedConfirmations: DailyConfirmation[] = data.dailyConfirmations ?? [];
        const sampleConfirmations = createSampleSmokingConfirmations(sampleSmokingLogs);
        const confirmationByDate = new Map(sampleConfirmations.map(item => [`${item.habitId}:${item.date}`, item]));
        savedConfirmations.forEach(item => confirmationByDate.set(`${item.habitId}:${item.date}`, item));
        const accountConfirmations = savedConfirmations.filter(item => !item.habitId.startsWith('demo-'));
        setHistory(savedHistory); setHabitEvents(data.habitEvents ?? []); setBehaviorLogs(loadedBehaviorLogs); setVariations(data.variations ?? []); setPreppedHabits(data.preppedHabits ?? {}); setRewards(data.rewards ?? demoRewards);
        setDailyConfirmations(isUnconnectedSmokingSample ? [...confirmationByDate.values()] : accountConfirmations); setCustomContextTags(data.customContextTags ?? []);
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
    if (!hasLocalWorkspace) {
      const sampleLogs = createSampleSmokingLogs();
      setHistory(demoHistory()); setBehaviorLogs(sampleLogs); setDailyConfirmations(createSampleSmokingConfirmations(sampleLogs));
    }
    if (!apiUrl && !process.env.NEXT_PUBLIC_API_URL) setApiUrl(window.location.origin);
    try {
      const savedView = sessionStorage.getItem(REFRESH_VIEW_STORAGE);
      if (savedView) {
        sessionStorage.removeItem(REFRESH_VIEW_STORAGE);
        const view = JSON.parse(savedView) as Record<string, unknown>;
        if (typeof view.active === 'string' && nav.some(item => item.title === view.active)) setActive(view.active as Tab);
        if (view.loggingView === 'Log' || view.loggingView === 'Insights' || view.loggingView === 'History') setLoggingView(view.loggingView);
        if (typeof view.loggingHabitId === 'string') setLoggingHabitId(view.loggingHabitId);
        if (view.insightDays === '24h' || [7, 14, 30, 90].includes(view.insightDays as number)) setInsightDays(view.insightDays as number | '24h');
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
    try { localStorage.setItem(STORAGE, JSON.stringify({ habits, habitOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, habitEvents, behaviorLogs, dailyConfirmations, customContextTags, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, dayKey: todayKey(), apiUrl, accountEmail, remoteUserId, remoteIdentityId, remoteToken, telegramCommand })); } catch { setConnectionError('Browser storage is unavailable. Export your local data before continuing.'); }
  }, [hydrated, habits, habitOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, habitEvents, behaviorLogs, dailyConfirmations, customContextTags, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, apiUrl, accountEmail, remoteUserId, remoteIdentityId, remoteToken, telegramCommand]);

  useEffect(() => {
    if (!hydrated || !workspaceReady || !apiUrl || !remoteToken) return;
    const payload = { habits, habitOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, habitEvents, behaviorLogs, dailyConfirmations, customContextTags, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, telegramCommand, dayKey: todayKey() };
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/workspace`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: payload, expected_revision: workspaceRevision }) });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const saved = await response.json(); setWorkspaceRevision(saved.revision);
        setConnectionError('');
      } catch (error) { setConnectionError(error instanceof Error && error.message.includes('409') ? 'Another browser saved newer data. Reconnect to load the server copy before editing here. Your local backup is still available.' : 'Could not save to the server. Your device copy remains available; retry the connection before switching devices.'); }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [hydrated, workspaceReady, apiUrl, remoteToken, habits, habitOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, habitEvents, behaviorLogs, dailyConfirmations, customContextTags, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, telegramCommand, workspaceRevision]);

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
        setWorkspaceRevision(workspace.revision ?? 0);
        if (hasData) {
          setHabitOrder(Array.isArray(data.habitOrder) ? data.habitOrder : []);
          setHabits((data.habits ?? []).map(expandInviteLink).filter((habit: Habit) => !habit.id.startsWith('demo-')));
          setRewards((data.rewards ?? []).filter((reward: Reward) => !reward.id.startsWith('reward-show')));
          setIdentity(data.identity ?? 'The Writer'); setGoal(data.goal ?? ''); setVotes(data.votes ?? 0);
          setPrepped(data.prepped ?? false); setPreppedHabits(data.preppedHabits ?? {});
          setHistory(data.history ?? {}); setHabitEvents(data.habitEvents ?? []); setBehaviorLogs(withoutSampleBehaviorLogs(data.behaviorLogs ?? [])); setDailyConfirmations(data.dailyConfirmations ?? []); setCustomContextTags(data.customContextTags ?? []); setVariations(data.variations ?? []);
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
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
  const orderedIds = habitOrder.filter(id => habits.some(habit => habit.id === id));
  const todayHabits = [...habits].sort((a, b) => {
    const ai = orderedIds.indexOf(a.id), bi = orderedIds.indexOf(b.id);
    return (ai < 0 ? orderedIds.length : ai) - (bi < 0 ? orderedIds.length : bi);
  });
  function moveHabit(from: number, to: number) {
    const next = todayHabits.map(habit => habit.id);
    if (from < 0 || to < 0 || to >= next.length || from === to) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setHabitOrder(next);
  }
  function dragTarget(y: number) {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.today-order-item:not(.is-dragging)'));
    return items.filter(item => y >= item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2).length;
  }
  const completed = buildHabits.filter(h => h.completed).length;
  const progress = buildHabits.length ? Math.round((completed / buildHabits.length) * 100) : 0;
  const unlockedRewards = useMemo(() => rewards.filter(r => habits.find(h => h.id === r.habitId)?.completed), [rewards, habits]);
  const needRecovery = habits.some(h => h.missedYesterday && !h.completed);
  const currentDate = hydrated ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Today';

  function save() {
    setToast(remoteToken ? 'Changes are syncing to your Habitly account.' : 'Saved on this device. Connect an account to sync across browsers.');
  }

  async function importLocalWorkspace(backup?: any) {
    if (!apiUrl || !remoteToken) return;
    let local: any = {};
    try { local = backup ?? JSON.parse(localStorage.getItem(STORAGE) ?? '{}'); } catch { setConnectionError('Could not read this browser’s saved data. Export it from browser storage before retrying.'); return; }
    const importHabits: Habit[] = (local.habits ?? habits).filter((h: Habit) => !h.id.startsWith('demo-')).map(expandInviteLink);
    const importHabitIds = new Set(importHabits.map(habit => habit.id));
    const importLogs: BehaviorLog[] = (local.behaviorLogs ?? behaviorLogs).filter((log: BehaviorLog) => importHabitIds.has(log.habitId) && !log.id.startsWith('sample-log-'));
    const payload = { habits: importHabits, rewards: (local.rewards ?? rewards).filter((r: Reward) => !r.id.startsWith('reward-show') && !r.habitId.startsWith('demo-')), identity: local.identity ?? identity, goal: local.goal ?? goal, votes: local.votes ?? votes, prepped: local.prepped ?? prepped, preppedHabits: local.preppedHabits ?? preppedHabits, history: local.history ?? history, habitEvents: local.habitEvents ?? habitEvents, behaviorLogs: importLogs, dailyConfirmations: (local.dailyConfirmations ?? dailyConfirmations).filter((item: DailyConfirmation) => importHabitIds.has(item.habitId)), customContextTags: local.customContextTags ?? customContextTags, variations: local.variations ?? variations, scorecard: local.scorecard ?? scorecard, joinedTribes: local.joinedTribes ?? joinedTribes, communityCircles: local.communityCircles ?? communityCircles, diagnostics: local.diagnostics ?? diagnostics, darkMode: local.darkMode ?? darkMode, palette: local.palette ?? palette, labs: local.labs ?? labs, telegramCommand: local.telegramCommand ?? telegramCommand, dayKey: local.dayKey ?? todayKey() };
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/workspace/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remoteToken}` }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Import failed (${response.status})`);
      const result = await response.json();
      if (!result.imported) throw new Error('Server data already exists. Reload the server copy before importing.');
      const inviteTokens = new Map((result.invites ?? []).map((invite: any) => [invite.habit_id, invite.token]));
      const importedHabits = payload.habits.map((habit: Habit) => { const token = inviteTokens.get(habit.id); return token ? { ...habit, inviteLink: `${window.location.origin}/?accountability=${token}` } : habit; });
      setHabits(importedHabits); setRewards(payload.rewards); setIdentity(payload.identity); setGoal(payload.goal); setVotes(payload.votes); setPrepped(payload.prepped); setPreppedHabits(payload.preppedHabits); setHistory(payload.history); setHabitEvents(payload.habitEvents); setBehaviorLogs(payload.behaviorLogs); setDailyConfirmations(payload.dailyConfirmations); setCustomContextTags(payload.customContextTags); setVariations(payload.variations); setScorecard(payload.scorecard); setJoinedTribes(payload.joinedTribes); setCommunityCircles(payload.communityCircles); setDiagnostics(payload.diagnostics); setDarkMode(payload.darkMode); if (palettes.some(option => option.id === payload.palette)) setPalette(payload.palette); setLabs(payload.labs); setTelegramCommand(payload.telegramCommand);
      setWorkspaceReady(true); setServerHasWorkspace(true); setConnectionError('');
      setWorkspaceRevision(result.revision ?? 1);
      setToast(`Imported ${result.habits} user habits and ${result.rewards} rewards. This browser’s original copy was kept.`);
    } catch (error) { setConnectionError(`${error instanceof Error ? error.message : 'Import failed'}. Local data is still in this browser. Export it in Settings before clearing site data.`); }
  }

  async function completeHabit(habit: Habit) {
    if (habit.completed) return;
    setHabits(current => current.map(h => h.id === habit.id ? { ...h, completed: true, missedYesterday: false } : h));
    const currentDay = todayKey();
    const nextHistory = { ...history, [currentDay]: [...(history[currentDay] ?? []).filter(x => x !== `missed:${habit.id}`), habit.id] };
    setHistory(nextHistory);
    setVotes(current => current + 1);
    setCelebrating(true); window.setTimeout(() => setCelebrating(false), 1150);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(18);
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: habit.missedYesterday ? 'RECOVERED' : 'COMPLETED', environment_prepped: !!preppedHabits[habit.id] }) });
        if (response.ok) { const result = await response.json(); setVotes(result.identity_votes); setToast(habit.missedYesterday ? `Recovery vote cast. Your ${result.resilient_streak}-day chain is back.` : `That's a vote for ${identity.toLowerCase()}. ${result.resilient_streak} day chain.`); return; }
      } catch { /* Local log remains available while the API is offline. */ }
      setToast('Saved here. API sync will resume when connected.'); return;
    }
    const updatedStreak = getResilientStreak(nextHistory, habit.id).count;
    setToast(habit.missedYesterday ? `Recovery vote cast. Your ${updatedStreak}-day chain is back.` : `That's a vote for ${identity.toLowerCase()}. ${updatedStreak} day chain.`);
  }

  async function markMissed(habit: Habit) {
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

  async function recordHabitEvent(habit: Habit, type: HabitEvent['type'], actualMinutes?: number) {
    const activeVariation = variations.find(item => item.habitId === habit.id && item.isActive);
    const activeStrategy = activeVariation ? `${activeVariation.name}: ${activeVariation.setup}` : (habit.techniqueIds ?? []).map(id => techniqueMap[id]?.name).filter(Boolean).join(', ');
    const note = checkinNotes[habit.id]?.trim() || undefined;
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
    setEditingLogId(''); setLogTrigger(''); setLogIntensity(''); setLogOutcome('pending'); setLogTechnique(''); setLogTechniqueId(''); setLogVariationId(''); setLogTiming('responsive'); setLogQuantity(1); setLogNote(''); setLogTimestamp(''); setLogResolvedTimestamp(''); setLogEpisodeId('');
    setLogEmotions(''); setLogEnvironments(''); setLogActivities(''); setLogSocial(''); setLogContextTags(''); setLogAutomaticThought(''); setLogBelief(''); setLogConfidence(''); setLogReframing(''); setLogIntensityAfter(''); setLogFormOpen(false);
  }

  function commitBehaviorLog(type: BehaviorType, quick = false) {
    if (saveLogLock.current) return;
    saveLogLock.current = true;
    window.setTimeout(() => { saveLogLock.current = false; }, 900);
    const habit = habits.find(item => item.id === loggingHabitId) ?? habits.find(item => item.kind === 'BREAK') ?? demoHabits[0];
    const previous = quick ? undefined : behaviorLogs.find(log => log.id === editingLogId);
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    const localInput = !quick ? logTimestamp : '';
    const occurredAt = localInput ? new Date(localInput) : previous && !quick ? new Date(previous.at) : now;
    if (!Number.isFinite(occurredAt.getTime())) { setToast('That date and time is invalid.'); saveLogLock.current = false; return; }
    const timestamp = occurredAt.toISOString();
    const eventMetadata = metadataForEditedTimestamp(previous && !quick ? previous : undefined, timestamp, timezone);
    const resolvedDate = logResolvedTimestamp ? new Date(logResolvedTimestamp) : undefined;
    if (!quick && type === 'craving' && logOutcome !== 'pending' && logResolvedTimestamp && (!resolvedDate || !Number.isFinite(resolvedDate.getTime()) || resolvedDate < occurredAt)) {
      setToast('Resolution time must be valid and after the craving started.'); saveLogLock.current = false; return;
    }
    const cutoff = now.getTime() - 8 * 60 * 60 * 1000;
    const latestOpenCraving = [...behaviorLogs].filter(log => log.habitId === habit.id && log.type === 'craving' && log.outcome !== 'resisted' && log.outcome !== 'smoked' && new Date(log.at).getTime() >= cutoff).sort((a, b) => b.at.localeCompare(a.at))[0];
    const selectedEpisodeId = !quick && logEpisodeId === '__new__' ? newRecordId('episode') : (!quick ? logEpisodeId : '');
    const episodeId = logEpisodeId === '__new__' && !quick ? selectedEpisodeId : ((!quick && logEpisodeId && logEpisodeId !== previous?.episodeId ? logEpisodeId : '') || previous?.episodeId || (!quick ? logEpisodeId : '') || (previous && type === 'craving' && logOutcome === 'smoked' ? newRecordId('episode') : '') || (type === 'habit_occurrence' || (type === 'technique_applied' && logTiming === 'responsive') ? latestOpenCraving?.episodeId : '') || (previous ? undefined : newRecordId('episode')));
    const existingOccurrence = episodeId ? behaviorLogs.find(log => log.habitId === habit.id && log.episodeId === episodeId && log.type === 'habit_occurrence' && log.id !== previous?.id) : undefined;
    if (type === 'craving' && logOutcome === 'resisted' && existingOccurrence) {
      setToast('This episode has an occurrence recorded. Correct or remove that occurrence before marking the craving resisted.');
      saveLogLock.current = false;
      return;
    }
    const technique = techniques.find(item => item.id === logTechniqueId);
    const variation = variations.find(item => item.id === logVariationId || (item.techniqueId && item.techniqueId === logTechniqueId));
    const tags = {
      emotions: quick ? [] : splitTags(logEmotions),
      environments: quick ? [] : splitTags(logEnvironments),
      activities: quick ? [] : splitTags(logActivities),
      social: quick ? [] : splitTags(logSocial),
      tags: quick ? [] : splitTags(logContextTags),
    };
    const context = Object.values(tags).some(values => values.length) ? tags : undefined;
    const item: BehaviorLog = {
      id: previous?.id ?? newRecordId('behavior'), habitId: habit.id, type, at: timestamp, createdAt: previous?.createdAt ?? now.toISOString(),
      localDate: eventMetadata.localDate, timezone: eventMetadata.timezone, episodeId,
      trigger: (quick ? '' : logTrigger.trim()) || (type === 'technique_applied' && logTiming === 'responsive' ? latestOpenCraving?.trigger : undefined) || undefined,
      ...(type === 'craving' || type === 'technique_applied' ? { intensity: !quick && logIntensity !== '' ? Number(logIntensity) : undefined } : {}),
      outcome: type === 'craving' ? (quick ? 'pending' : logOutcome) : undefined,
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
  }

  function saveBehaviorLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (logType === 'technique_applied' && !logTechniqueId && !logVariationId && !editingLogId) { setToast('Choose a technique from your strategy first.'); return; }
    if (logType === 'habit_occurrence' && (!Number.isFinite(Number(logQuantity)) || Number(logQuantity) < 1)) { setToast('Enter a quantity of at least one.'); return; }
    commitBehaviorLog(logType);
  }

  function quickLog(type: BehaviorType) {
    setLoggingView('Log');
    if (type === 'technique_applied') {
      resetBehaviorDraft(); setLogType(type); setLogTiming('responsive'); setLogFormOpen(true);
      document.querySelector('.logging-advanced-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    resetBehaviorDraft();
    commitBehaviorLog(type, true);
  }

  function editBehaviorLog(log: BehaviorLog) {
    setLoggingView('Log'); setLogFormOpen(true); setEditingLogId(log.id); setLogType(log.type); setLogTrigger(log.trigger ?? ''); setLogIntensity(log.intensity === undefined ? '' : String(log.intensity));
    setLogOutcome(log.outcome ?? 'pending'); setLogTechnique(log.technique ?? ''); setLogTechniqueId(log.techniqueId ?? ''); setLogVariationId(log.variationId ?? ''); setLogTiming(log.timing ?? 'responsive');
    setLogQuantity(log.quantity ?? 1); setLogNote(log.note ?? ''); setLogEpisodeId(log.episodeId ?? '');
    setLogEmotions(log.context?.emotions?.join(', ') ?? ''); setLogEnvironments(log.context?.environments?.join(', ') ?? ''); setLogActivities(log.context?.activities?.join(', ') ?? ''); setLogSocial(log.context?.social?.join(', ') ?? ''); setLogContextTags(log.context?.tags?.join(', ') ?? '');
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

  function logHabitMinutes(habit: Habit) {
    const minutes = durationDrafts[habit.id] ?? (habit.gatewayMinutes || 2);
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
    setEditingHabitId(''); setBuilderReturnTo(active); setHabitType(mode); setCueType('STACK');
    setTargetAction(''); setGatewayAction(''); setGatewayMinutes(mode === 'BUILD' ? 2 : 0); setCue(''); setTime(''); setLocation(''); setMotive(''); setReward('');
    setPrepStep(''); setBundle(''); setHideCue(''); setFriction(''); setContract(''); setAccountabilityPartner(''); setAccountabilityEmail('');
    setAccountabilityCost(''); setAlternativeRoutine(''); setAversionReminder(''); setRitual(''); setMilestoneDraft(''); setTechniqueIds([]);
    setTechniqueNotes({}); setBaselineDaily(''); setShowBuilder(true);
  }

  function toggleTechnique(id: string) {
    const removing = techniqueIds.includes(id);
    setTechniqueIds(current => removing ? current.filter(item => item !== id) : [...current, id]);
    if (removing) setTechniqueNotes(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id && !key.endsWith(`:${id}`))));
  }

  async function deleteHabit(habit: Habit) {
    if (deletingHabit) return;
    setDeletingHabit(true);
    const localOnly = habit.id.startsWith('demo-') || habit.id.startsWith('habit-');
    if (!localOnly) {
      if (!apiUrl || !remoteIdentityId) { setToast('Connect your account to delete this habit.'); setDeletingHabit(false); return; }
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }) });
        if (!response.ok) throw new Error('Delete failed');
      } catch { setToast('Could not delete this habit. Please try again.'); setDeletingHabit(false); return; }
    }
    setHabits(current => current.filter(item => item.id !== habit.id));
    setHabitToDelete(null);
    setDeletingHabit(false);
    setToast('Habit removed.');
  }

  function renderHabitActions(habit: Habit) {
    return <div className="habit-manage-actions"><button type="button" onClick={() => editHabitPlan(habit)} aria-label={`Edit ${habit.name}`}>Edit</button><button type="button" className="habit-delete-action" onClick={() => setHabitToDelete(habit)} aria-label={`Delete ${habit.name}`}>Delete</button></div>;
  }

  function editHabitPlan(habit: Habit) {
    setEditingHabitId(habit.id);
    setHabitType(habit.kind);
    setTargetAction(habit.target);
    setGatewayAction(habit.gateway ?? '');
    setGatewayMinutes(habit.gatewayMinutes ?? 2);
    setCueType(habit.cueType ?? 'STACK');
    setCue(habit.cueType === 'STACK' ? habit.cue : '');
    const oldTime = habit.time ?? '';
    const parsedTime = oldTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    setTime(parsedTime ? `${String((Number(parsedTime[1]) % 12) + (parsedTime[3].toUpperCase() === 'PM' ? 12 : 0)).padStart(2, '0')}:${parsedTime[2]}` : oldTime);
    setLocation(habit.location ?? '');
    setMotive(habit.motive ?? '');
    setReward(habit.reward ?? '');
    setPrepStep(habit.prep ?? '');
    setBundle(habit.rewardBundle ?? '');
    setHideCue(habit.hideCue ?? '');
    setFriction(habit.friction ?? '');
    setContract(habit.contract ?? '');
    setAccountabilityPartner(habit.accountabilityPartner ?? '');
    setAccountabilityEmail(habit.accountabilityEmail ?? '');
    setAccountabilityCost(habit.accountabilityCost ?? '');
    setAlternativeRoutine(habit.alternativeRoutine ?? '');
    setAversionReminder(habit.aversionReminder ?? '');
    setRitual(habit.ritual ?? '');
    setMilestoneDraft((habit.milestones ?? []).slice(1, -1).join('\n'));
    setTechniqueIds(habit.techniqueIds ?? []);
    setTechniqueNotes(habit.techniqueNotes ?? {});
    setBaselineDaily(habit.baselineDaily?.toString() ?? '');
    setBuilderReturnTo(active);
    setShowBuilder(true);
  }

  async function saveLawSection(law: Law) {
    const existing = habits.find(item => item.id === editingHabitId);
    if (!existing) { setToast('Finish the complete plan to save its law sections.'); return; }
    const updated: Habit = { ...existing, name: targetAction.trim() || existing.name, target: targetAction.trim() || existing.target, gateway: gatewayAction.trim() || targetAction.trim(), gatewayMinutes: habitType === 'BUILD' ? Math.max(1, Math.min(1440, gatewayMinutes || 2)) : gatewayMinutes, cueType, cue: cueType === 'STACK' ? cue.trim() : time.trim(), time: cueType === 'TIME_LOCATION' ? time : undefined, location: cueType === 'TIME_LOCATION' ? location : undefined, motive: motive.trim(), reward: reward.trim(), hideCue: cue.trim() || hideCue.trim(), friction: friction.trim(), contract: contract.trim(), alternativeRoutine: gatewayAction.trim() || alternativeRoutine.trim(), aversionReminder: aversionReminder.trim(), techniqueIds: [...techniqueIds], techniqueNotes: { ...techniqueNotes }, prep: prepStep.trim() };
    setHabits(current => current.map(item => item.id === existing.id ? updated : item));
    if (apiUrl && remoteIdentityId && !existing.id.startsWith('demo-')) {
      const payload = { target_action: updated.target, gateway_action: updated.gateway, gateway_minutes: updated.gatewayMinutes, cue_type: updated.cueType, cue_trigger: updated.cue, location: updated.location ?? null, craving_motive: updated.motive, reward_payoff: updated.reward, cue_to_hide: updated.hideCue ?? null, friction_strategy: updated.friction ?? null, habit_contract: updated.contract ?? null, alternative_routine: updated.alternativeRoutine ?? null, aversion_reminder: updated.aversionReminder ?? null, technique_ids: updated.techniqueIds ?? [], technique_notes: updated.techniqueNotes ?? {} };
      try { const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${existing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(); } catch { setToast(`${lawGroups.find(item => item.id === law)?.build ?? 'Law'} saved on this device; API sync is unavailable.`); return; }
    }
    setToast(`${lawGroups.find(item => item.id === law)?.[habitType === 'BUILD' ? 'build' : 'break'] ?? 'Law section'} saved. Keep editing or save the complete plan.`);
  }

  async function createHabit() {
    if (!targetAction.trim()) return;
    if (habitType === 'BREAK' && !gatewayAction.trim()) { setToast('Add a replacement action to use when the old cue appears.'); return; }
    if (habitType === 'BUILD' && /^(read|write|exercise|work out|study|meditate|eat|save|practice|journal|run|walk)\s*(more|better|regularly)?[.!]?$/i.test(targetAction.trim())) { setToast('Make the action specific, such as “Read one chapter” or “Walk for ten minutes.”'); return; }
    if (habitType === 'BUILD' && cueType === 'TIME_LOCATION' && (!time.trim() || !location.trim())) return;
    if (habitType === 'BUILD' && cueType === 'STACK' && !cue.trim()) return;
    if (habitType === 'BREAK' && !techniqueIds.length) { setToast('Choose at least one strategy from the four anti laws.'); return; }
    const savedGatewayMinutes = habitType === 'BUILD' ? Math.max(1, Math.min(1440, gatewayMinutes || 2)) : gatewayMinutes;
    const existingHabit = habits.find(habit => habit.id === editingHabitId);
    const starterAction = gatewayAction.trim() || (habitType === 'BUILD' ? suggestStarter(targetAction.trim()) : targetAction.trim());
    let habitId = editingHabitId || `habit-${Date.now()}`;
    let inviteLink = '';
    if (apiUrl && remoteIdentityId && !editingHabitId.startsWith('demo-')) {
      try {
        const payload = { habit_type: habitType, target_action: targetAction.trim(), gateway_action: starterAction, gateway_minutes: savedGatewayMinutes, cue_type: cueType, cue_trigger: cueType === 'STACK' ? cue.trim() : time.trim(), location: cueType === 'TIME_LOCATION' ? location.trim() || null : null, craving_motive: motive.trim(), reward_payoff: reward.trim(), prep_step: prepStep.trim() || null, reward_bundle: bundle.trim() || null, cue_to_hide: hideCue.trim() || null, friction_strategy: friction.trim() || null, habit_contract: contract.trim() || null, alternative_routine: gatewayAction.trim() || alternativeRoutine.trim() || null, aversion_reminder: aversionReminder.trim() || null, motivation_ritual: ritual.trim() || null, shaping_milestones: habitType === 'BUILD' ? [starterAction, ...milestoneDraft.split('\n').map(item => item.trim()).filter(Boolean), targetAction.trim()].filter((item, i, all) => all.indexOf(item) === i).join('\n') : null, shaping_current_step: existingHabit?.milestoneIndex ?? 0, accountability_partner: accountabilityPartner.trim() || null, accountability_partner_email: accountabilityEmail.trim() || null, accountability_cost: accountabilityCost.trim() || null, technique_ids: techniqueIds, technique_notes: techniqueNotes, baseline_daily: baselineDaily !== '' ? Number(baselineDaily) : null };
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
      id: habitId, name: targetAction.trim(), target: targetAction.trim(), gateway: starterAction, gatewayMinutes: savedGatewayMinutes,
      cueType, cue: cueType === 'STACK' ? cue.trim() : time.trim(), time: cueType === 'TIME_LOCATION' ? time : undefined,
      location: cueType === 'TIME_LOCATION' ? location : undefined, motive: motive.trim(), reward: reward.trim(),
      prep: prepStep.trim(), completed: existingHabit?.completed ?? false, missedYesterday: existingHabit?.missedYesterday ?? false, streak: existingHabit?.streak ?? 0, kind: habitType,
      hideCue: hideCue.trim(), friction: friction.trim(), contract: contract.trim(), alternativeRoutine: gatewayAction.trim() || alternativeRoutine.trim(), aversionReminder: aversionReminder.trim(), accountabilityEmail: accountabilityEmail.trim(), inviteLink: existingHabit?.inviteLink ?? inviteLink, frictionVotes: existingHabit?.frictionVotes ?? 0, rewardBundle: bundle.trim(),
      ritual: ritual.trim(), milestones: habitType === 'BUILD' ? [starterAction, ...(milestoneDraft.split('\n').map(item => item.trim()).filter(Boolean)), targetAction.trim()].filter((item, i, all) => all.indexOf(item) === i) : [], milestoneIndex: existingHabit?.milestoneIndex ?? 0,
      accountabilityPartner: accountabilityPartner.trim(), accountabilityCost: accountabilityCost.trim(),
      techniqueIds: [...techniqueIds], techniqueNotes: { ...techniqueNotes }, baselineDaily: baselineDaily !== '' ? Number(baselineDaily) : undefined,
    };
    setHabits(current => editingHabitId ? current.map(item => item.id === editingHabitId ? habit : item) : [...current, habit]);
    if (!editingHabitId && habitType === 'BUILD' && bundle.trim()) {
      let rewardId = `reward-${Date.now()}`;
      if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) {
        try { const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/rewards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habit_id: habit.id, name: bundle.trim(), detail: `A little treat after ${habit.name.toLowerCase()}` }) }); if (response.ok) rewardId = (await response.json()).id; } catch { /* Keep reward local if API is unavailable. */ }
      }
      setRewards(current => [...current, { id: rewardId, name: bundle.trim(), habitId: habit.id, detail: `A little treat after ${habit.name.toLowerCase()}` }]);
    }
    setShowBuilder(false); setActive(habitType === 'BREAK' ? 'Habit to break' : builderReturnTo === 'My habits' ? 'My habits' : 'Today');
    setToast(editingHabitId ? 'Your plan is updated.' : habitType === 'BUILD' ? 'Your new habit plan is ready.' : inviteLink ? 'Change plan saved. Partner link copied.' : 'Your change plan is ready.');
    setTargetAction(''); setGatewayAction(''); setGatewayMinutes(2); setCue(''); setTime(''); setLocation(''); setMotive(''); setReward(''); setPrepStep(''); setBundle(''); setHideCue(''); setFriction(''); setContract(''); setAccountabilityPartner(''); setAccountabilityEmail(''); setAccountabilityCost(''); setAlternativeRoutine(''); setAversionReminder(''); setRitual(''); setMilestoneDraft(''); setTechniqueIds([]); setTechniqueNotes({}); setBaselineDaily(''); setEditingHabitId(''); setHabitType('BUILD'); setCueType('STACK');
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
      setWorkspaceRevision(workspace.revision ?? 0);
      const hasData = Object.keys(data).length > 0;
      setServerHasWorkspace(hasData);
      if (hasData) {
        setHabitOrder(Array.isArray(data.habitOrder) ? data.habitOrder : []);
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
    const streak = getResilientStreak(history, habit.id);
    const events = habitEvents.filter(event => event.habitId === habit.id);
    const habitVariations = variations.filter(item => item.habitId === habit.id);
    if (active === 'Today') {
      const laws = lawGroups.map(law => {
        const configured: Partial<Record<Law, string>> = habit.kind === 'BUILD'
          ? { cue: cueLine, craving: [habit.motive, habit.ritual].filter(Boolean).join(' · '), response: [habit.gateway, habit.prep && `Setup: ${habit.prep}`].filter(Boolean).join(' · '), reward: habit.reward }
          : { cue: habit.hideCue || '', craving: habit.aversionReminder || '', response: [habit.friction, habit.alternativeRoutine && `Instead: ${habit.alternativeRoutine}`].filter(Boolean).join(' · '), reward: habit.contract || '' };
        const selected = (habit.techniqueIds ?? []).map(id => techniqueMap[id]).filter(item => item?.laws.includes(law.id));
        const methods = selected.map(item => ({ id: item.id, name: item.name, note: techniqueNoteFor(habit.techniqueNotes ?? {}, item.id, law.id) }));
        const setup = configured[law.id] ?? '';
        return setup || methods.length ? { law, setup, methods } : null;
      }).filter((item): item is { law: typeof lawGroups[number]; setup: string; methods: { id: string; name: string; note: string }[] } => !!item);
      const isBuild = habit.kind === 'BUILD';
      const actionSummary = isBuild ? habit.gateway : (habit.alternativeRoutine || habit.gateway);
      const helpfulChoices = events.filter(event => event.type === 'URGE_PASSED' || event.type === 'REPLACEMENT_USED').length;
      return <article key={habit.id} className={`today-quick-card ${habit.completed ? 'today-quick-card-done' : ''} ${isBuild ? '' : 'today-quick-card-break'}`}>
        <span className={`today-quick-mark ${isBuild && habit.completed ? 'checked' : ''}`} aria-hidden="true">{isBuild && habit.completed ? <Icon name="check" size={15}/> : <Icon name="spark" size={15}/>}</span>
        <div className="today-quick-main">
          <div className="today-quick-title"><h3>{habit.name}</h3>{!isBuild && <span className="today-choice-count">{helpfulChoices} helpful choice{helpfulChoices === 1 ? '' : 's'}</span>}{habit.missedYesterday && !habit.completed && <span className="recovery-pill">Recovery day</span>}{renderHabitActions(habit)}</div>
          <p className="today-quick-action"><span>{isBuild ? `${habit.gatewayMinutes || 2}-MIN START` : 'TRY INSTEAD'}</span>{actionSummary}</p>
        </div>
        <div className="today-quick-side">
          {isBuild
            ? <><span><Icon name="flame" size={13}/>{streak.hasHistory ? streak.count : habit.streak} day chain</span><button type="button" className="today-quick-complete" onClick={() => completeHabit(habit)}>{habit.completed ? 'Done' : 'I did it'}</button></>
            : <details className="today-choice-menu"><summary>Log choice <Icon name="chevron" size={12}/></summary><div className="today-quick-break-actions"><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void recordHabitEvent(habit, 'URGE_PASSED'); }}>Urge passed</button><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void recordHabitEvent(habit, 'REPLACEMENT_USED'); }}>Used replacement</button></div></details>}
        </div>
        {laws.length > 0 && <details className="today-law-details"><summary>Plan details <span>{laws.length} strategies</span></summary><div className="today-law-list">{laws.map(({ law, setup, methods }) => <section className="today-law-row" key={law.id}><button type="button" className="today-law-guide" onClick={() => setInfoModal({ type: 'law', law: law.id, mode: habit.kind })} aria-label={`Learn about ${isBuild ? law.build : law.break}`}><span>{isBuild ? law.build : law.break}</span><span className="today-law-guide-info" aria-hidden="true">i</span></button>{setup && <p>{setup}</p>}{methods.length > 0 && <div className="today-law-methods"><small>Your techniques</small><div>{methods.map(method => <button type="button" className="chosen-technique" key={`${law.id}:${method.id}`} onClick={() => setInfoModal({ type: 'technique', id: method.id, mode: habit.kind })} aria-label={`Learn about ${method.name}`}><Icon name="check" size={12}/>{method.name}</button>)}</div>{methods.filter(method => method.note).map(method => <p className="technique-note" key={`${law.id}:${method.name}:note`}>{method.note}</p>)}</div>}</section>)}</div></details>}
      </article>;
    }
    return <article key={habit.id} className={`habit-card ${habit.completed ? 'habit-card-done' : ''}`}>
      <div className="habit-card-top">
        <div className={`habit-check ${habit.completed ? 'checked' : ''}`}>
          {habit.completed ? <Icon name="check" size={19}/> : <span>{String(index + 1).padStart(2, '0')}</span>}
        </div>
        <div className="habit-main">
          <div className="habit-title-line"><h3>{habit.name}</h3>{habit.missedYesterday && !habit.completed && <span className="recovery-pill">Recovery day</span>}</div>
          <p className="habit-cue"><Icon name={habit.cueType === 'STACK' ? 'spark' : 'clock'} size={14}/>{cueLine}</p>
          <p className="habit-starter"><span>{habit.gatewayMinutes ? `${habit.gatewayMinutes}-MIN START` : 'START HERE'}</span>{habit.gateway}</p>
        </div>
        <button className={`complete-button ${habit.completed ? 'complete-button-done' : ''}`} onClick={() => completeHabit(habit)} aria-label={`${habit.completed ? 'Mark' : 'Complete'} ${habit.name} ${habit.completed ? 'incomplete' : ''}`}>
          {habit.completed ? <><Icon name="check" size={16}/> Done</> : 'I did it'}
        </button>
      </div>
      <div className="habit-card-foot">
        <span><Icon name="flame" size={14}/>{streak.hasHistory ? streak.count : habit.streak} day chain{streak.warning && !habit.completed ? ' · recover today' : ''}</span>
        <button className="quiet-button" onClick={() => markMissed(habit)}>Mark missed</button>
      </div>
      {renderHabitActions(habit)}
      <details className="habit-plan-details"><summary>Plan details, check-ins & settings</summary>
        {habit.kind === 'BUILD' && <section className="duration-tracker" aria-label={`Practice minutes for ${habit.name}`}>
          <div className="duration-tracker-heading"><div><b>Practice minutes</b><p>Current starter target: {habit.gatewayMinutes || 2} minutes</p></div><span>{events.reduce((total, event) => total + (event.actualMinutes ?? 0), 0)} min tracked</span></div>
          <div className="duration-tracker-controls"><label>Minutes this session<input type="number" min="1" max="1440" step="1" value={durationDrafts[habit.id] ?? (habit.gatewayMinutes || 2)} onChange={e => setDurationDrafts(current => ({ ...current, [habit.id]: e.target.value === '' ? 0 : Number(e.target.value) }))}/></label><button type="button" className="secondary-button" onClick={() => logHabitMinutes(habit)}>Log session</button><label>Next target<input type="number" min="1" max="1440" step="1" value={targetDrafts[habit.id] ?? (habit.gatewayMinutes || 2)} onChange={e => setTargetDrafts(current => ({ ...current, [habit.id]: e.target.value === '' ? 0 : Number(e.target.value) }))}/></label><button type="button" className="text-button" onClick={() => { const target = targetDrafts[habit.id] ?? (habit.gatewayMinutes || 2); if (Number.isInteger(target) && target >= 1 && target <= 1440) void updateHabitDuration(habit, target); else setToast('Choose a target from 1 to 1,440 minutes.'); }}>Update target</button></div>
          <small>Start small, log what you actually did, and raise the target whenever you feel ready.</small>
        </section>}
        {habit.motive && <p className="habit-why">Why it matters: {habit.motive}</p>}
        {habit.ritual && <p className="habit-ritual"><span>BEFORE YOU START</span> {habit.ritual}</p>}
        {!!habit.prep && <div className="prep-inline"><label><input type="checkbox" checked={!!preppedHabits[habit.id]} onChange={e => setHabitPrep(habit.id, e.target.checked)}/><span><b>Tonight's setup</b> · {habit.prep}</span></label><span className="prep-label">{preppedHabits[habit.id] ? 'Ready' : 'PREP'}</span></div>}
        <div className="habit-laws-inline">{lawGroups.map(law => { const detail = law.id === 'cue' ? cueLine : law.id === 'craving' ? habit.motive : law.id === 'response' ? habit.gateway : habit.reward; const selected = (habit.techniqueIds ?? []).map(id => techniqueMap[id]).filter(item => item?.laws.includes(law.id)); return <div key={law.id}><b>{habit.kind === 'BUILD' ? law.build : law.break}</b><p>{detail || 'Add a clear step for this law.'}</p>{selected.length > 0 && <small>{selected.map((item, itemIndex) => <span key={item.id} id={habit.kind === 'BUILD' && item.laws[0] === law.id ? `build-technique-${habit.id}-${item.id}` : undefined} tabIndex={habit.kind === 'BUILD' && item.laws[0] === law.id ? -1 : undefined}>{item.name}{(habit.techniqueNotes?.[`${law.id}:${item.id}`] ?? habit.techniqueNotes?.[item.id]) ? `: ${habit.techniqueNotes?.[`${law.id}:${item.id}`] ?? habit.techniqueNotes?.[item.id]}` : ''}{itemIndex < selected.length - 1 ? '; ' : ''}</span>)}</small>}</div>; })}</div>
        {habit.kind === 'BUILD' && <div className="action-checkin"><p>“I did it” marks today complete. Record an extra check-in only for another action.</p><textarea aria-label={`Extra check-in note for ${habit.name}`} value={checkinNotes[habit.id] ?? ''} onChange={e => setCheckinNotes(current => ({ ...current, [habit.id]: e.target.value }))} placeholder="Optional note about the extra action" rows={2}/><button type="button" className="text-button" onClick={() => void recordHabitEvent(habit, 'ACTION_COMPLETED')}>Record an extra check-in</button></div>}
        <details className="build-variation-workspace"><summary>Test a plan variation <small>{habitVariations.length} saved</small></summary><p>Keep this plan and compare another cue, action, or reward.</p><div className="variation-fields"><select aria-label={`Variation law for ${habit.name}`} value={(variationDrafts[habit.id] ?? { law: 'cue' }).law} onChange={e => setVariationDrafts(current => ({ ...current, [habit.id]: { ...(current[habit.id] ?? { law: 'cue', name: '', techniqueId: '', setup: '' }), law: e.target.value as Law } }))}>{lawGroups.map(law => <option key={law.id} value={law.id}>{law.build}</option>)}</select><input aria-label={`Variation name for ${habit.name}`} placeholder="Name this alternative" value={variationDrafts[habit.id]?.name ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [habit.id]: { ...(current[habit.id] ?? { law: 'cue', name: '', techniqueId: '', setup: '' }), name: e.target.value } }))}/><textarea aria-label={`Variation setup for ${habit.name}`} placeholder="What will you try?" value={variationDrafts[habit.id]?.setup ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [habit.id]: { ...(current[habit.id] ?? { law: 'cue', name: '', techniqueId: '', setup: '' }), setup: e.target.value } }))}/><button type="button" className="secondary-button" onClick={() => void createVariation(habit)}>Save variation</button></div>{habitVariations.map(v => <div className="variation-row" id={`build-variation-${v.id}`} tabIndex={-1} key={v.id}><div className="variation-row-main"><div><b>{v.name}</b>{v.isActive && <span className="variation-active">Testing now</span>}<p>{lawGroups.find(law => law.id === v.law)?.build}: {v.setup}</p></div><button type="button" className="text-button" onClick={() => void updateVariation(v, { isActive: !v.isActive })}>{v.isActive ? 'Active' : 'Make active'}</button></div><div className="variation-outcome"><span>{v.triedAt ? `Tried ${new Date(v.triedAt).toLocaleDateString()}` : 'Not tried yet'}</span><label>Did it help?<select value={v.helped === true ? 'yes' : v.helped === false ? 'no' : ''} onChange={e => void updateVariation(v, { helped: e.target.value === '' ? null : e.target.value === 'yes' })}><option value="">Not rated</option><option value="yes">Yes</option><option value="no">Not yet</option></select></label></div></div>)}</details>
        <details className="event-history"><summary>Check-in history <small>{events.length}</small></summary>{events.length ? <ol>{events.slice(0, 30).map(event => <li key={event.id}><b>{event.type === 'ACTION_COMPLETED' ? 'Action completed' : event.type === 'URGE_PASSED' ? 'Urge passed' : event.type === 'REPLACEMENT_USED' ? 'Replacement used' : 'Old behavior'}</b><time>{new Date(event.at).toLocaleString()}</time>{event.actualMinutes && <small>{event.actualMinutes} minutes practiced</small>}{event.variationName && <small>Testing: {event.variationName}</small>}{event.strategy && !event.variationName && <small>Strategy: {event.strategy}</small>}{event.note && <p>{event.note}</p>}</li>)}</ol> : <p>No events yet. Your history will appear here.</p>}</details>
        {habit.milestones && habit.milestones.length > 1 && <div className="milestone-progress"><div><b>Habit shaping</b><span>Step {(habit.milestoneIndex ?? 0) + 1} of {habit.milestones.length}</span></div><p>{habit.milestones[habit.milestoneIndex ?? 0]}</p><div className="milestone-track"><i style={{ width: `${(((habit.milestoneIndex ?? 0) + 1) / habit.milestones.length) * 100}%` }}/></div>{(habit.milestoneIndex ?? 0) < habit.milestones.length - 1 && <button type="button" onClick={() => advanceMilestone(habit)}>Ready for the next step <Icon name="arrow" size={13}/></button>}</div>}
      </details>
    </article>;
  }

  function renderLogging() {
    const selectedHabit = habits.find(habit => habit.id === loggingHabitId) ?? habits.find(habit => habit.kind === 'BREAK') ?? demoHabits[0];
    const logs = behaviorLogs.filter(log => log.habitId === selectedHabit.id).sort((a, b) => b.at.localeCompare(a.at));
    const hasSampleSmokingData = selectedHabit.id === 'demo-smoking' && logs.some(log => log.id.startsWith('sample-log-smoking-'));
    const today = todayKey();
    const todaySummary = summarizeDay(logs, selectedHabit.id, today, dailyConfirmations);
    const currentConfirmation = dailyConfirmations.find(row => row.habitId === selectedHabit.id && row.date === today);
    const isSmoke = isSmokingHabit(selectedHabit);
    const occurrenceUnit = isSmoke ? 'cigarette' : 'occurrence';
    const getOutcome = (log: BehaviorLog) => log.type === 'habit_occurrence' ? 'smoked' : log.type === 'craving' ? outcomeForCraving(logs, log) : episodeResolvedOutcome(logs, log);
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
    const windowEndMs = Date.now();
    const windowStartMs = windowEndMs - 24 * 60 * 60 * 1000;
    const dateOrdinal = (key: string) => { const [year, month, day] = key.split('-').map(Number); return Date.UTC(year, month - 1, day); };
    const dateKeyAtOrdinal = (ordinal: number) => new Date(ordinal).toISOString().slice(0, 10);
    const rangeStart = insightFrom || (isHourlyWindow ? dateKeyInZone(new Date(windowStartMs)) : localDateKeys(insightDays === '24h' ? 1 : insightDays)[0]);
    const rangeEnd = insightTo || (isHourlyWindow ? dateKeyInZone(new Date(windowEndMs)) : today);
    const requestedStartKey = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    const endKey = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    const requestedDayCount = Math.max(1, Math.floor((dateOrdinal(endKey) - dateOrdinal(requestedStartKey)) / 86400000) + 1);
    const dayCount = Math.min(180, requestedDayCount);
    const periodStartKey = dateKeyAtOrdinal(dateOrdinal(endKey) - (dayCount - 1) * 86400000);
    const insightKeys = Array.from({ length: dayCount }, (_, index) => dateKeyAtOrdinal(dateOrdinal(periodStartKey) + index * 86400000));
    const periodLabel = isHourlyWindow ? '24 hours' : `${dayCount} ${dayCount === 1 ? 'day' : 'days'}`;
    const periodEyebrow = isHourlyWindow ? 'PAST 24 HOURS' : insightFrom || insightTo ? `CUSTOM RANGE · ${dayCount} ${dayCount === 1 ? 'DAY' : 'DAYS'}` : `${dayCount} ${dayCount === 1 ? 'DAY' : 'DAYS'}`;
    const periodRangeText = isHourlyWindow
      ? `${new Date(windowStartMs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} to ${new Date(windowEndMs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      : `${periodStartKey} to ${endKey}`;
    const windowLogs = logs.filter(log => {
      if (isHourlyWindow) { const at = new Date(log.at).getTime(); return at >= windowStartMs && at <= windowEndMs; }
      const key = behaviorDayKey(log);
      return key >= periodStartKey && key <= endKey;
    });
    const dayData = insightKeys.map(key => ({ key, summary: summarizeDay(logs, selectedHabit.id, key, dailyConfirmations) }));
    const confirmationConflicts = dayData.filter(day => day.summary.conflict);
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
              quantity: occurrences.reduce((total, log) => total + (log.quantity ?? 1), 0),
              occurrenceEvents: occurrences.length,
              cravings: bucketLogs.filter(log => log.type === 'craving').length,
              knownOccurrenceCount: occurrences.length,
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
    const resolvedCravings = rangeCravings.filter(log => getOutcome(log) !== 'unknown');
    const resolutionMinutes = rangeCravings.map(log => minutesToCravingResolution(logs, log)).filter((value): value is number => value !== undefined);
    const averageResolutionMinutes = resolutionMinutes.length ? (resolutionMinutes.reduce((sum, value) => sum + value, 0) / resolutionMinutes.length).toFixed(1) : '—';
    const intensities = rangeCravings.map(log => log.intensity).filter((value): value is number => value !== undefined);
    const avgIntensity = intensities.length ? (intensities.reduce((sum, value) => sum + value, 0) / intensities.length).toFixed(1) : '—';
    const topTriggers = [...windowLogs.reduce((counts, log) => { if (log.trigger) counts.set(log.trigger, (counts.get(log.trigger) ?? 0) + 1); return counts; }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en', { sensitivity: 'base' })).slice(0, 6);
    const triggerStats = topTriggers.map(([name, count]) => {
      const triggered = windowLogs.filter(log => log.trigger === name);
      const episodes = [...new Set(triggered.map(episodeKey))];
      const resolved = episodes.map(id => resolvedEpisodeOutcome(logs, id)).filter(value => value !== 'unknown');
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
      logs,
      windowLogs,
      metadataChoices,
      configuredInsightChoices,
      insightLaws.map(law => law.id),
    );
    const suggestedExperiment = buildSuggestedExperiment(windowLogs, logs, configuredInsightChoices);
    const strategyGap = buildStrategyGap(windowLogs, logs, configuredInsightChoices, insightLaws);
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
    const previousWindowLogs = logs.filter(log => {
      if (isHourlyWindow) { const at = new Date(log.at).getTime(); return at >= previousWindowStartMs! && at < previousWindowEndMs!; }
      const key = behaviorDayKey(log);
      return key >= previousStartKey && key <= previousEndKey;
    });
    const summarizePeriod = (periodLogs: BehaviorLog[], keys: string[], hourlyWindow: boolean, startMs?: number, endMs?: number) => {
      const occurrences = periodLogs.filter(log => log.type === 'habit_occurrence');
      const cravings = periodLogs.filter(log => log.type === 'craving');
      const resolved = cravings.filter(log => getOutcome(log) !== 'unknown');
      const intensityValues = cravings.map(log => log.intensity).filter((value): value is number => value !== undefined);
      const occurrenceDays = keys.map(key => summarizeDay(logs, selectedHabit.id, key, dailyConfirmations));
      const confirmations = dailyConfirmations.filter(item => {
        if (item.habitId !== selectedHabit.id || item.status === 'skip') return false;
        if (hourlyWindow && startMs !== undefined && endMs !== undefined) { const updatedAt = new Date(item.updatedAt).getTime(); return updatedAt >= startMs && updatedAt < endMs; }
        return item.date >= keys[0] && item.date <= keys[keys.length - 1];
      });
      return {
        quantity: occurrences.reduce((sum, log) => sum + (log.quantity ?? 1), 0),
        occurrences: occurrences.length,
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
      };
    };
    const currentPeriod = summarizePeriod(windowLogs, insightKeys, isHourlyWindow, windowStartMs, windowEndMs);
    const previousPeriod = summarizePeriod(previousWindowLogs, previousKeys, isHourlyWindow, previousWindowStartMs, previousWindowEndMs);
    const delta = (current: number, previous: number) => previous === 0 ? (current === 0 ? '0' : 'New') : ((current - previous > 0 ? '+' : '') + Math.round((current - previous) / previous * 100) + '%');
    const rating = windowLogs.length === 0 ? 'No records in this period' : windowLogs.length < 12 ? 'Limited records in this period' : resolvedCravings.length < 5 ? 'Descriptive records, few resolved outcomes in this period' : 'Sufficient descriptive records for this period';
    const maxOccurrence = Math.max(1, ...periodBuckets.map(bucket => isSmoke ? bucket.summary.quantity : bucket.summary.occurrenceEvents));
    const maxCravings = Math.max(1, ...periodBuckets.map(bucket => bucket.summary.cravings));
    const historyLogs = logs.filter(log => {
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
    const historyDays = [...new Set(visibleHistory.map(behaviorDayKey))];
    const timelineGroups = historyDays.map(day => {
      const rows = visibleHistory.filter(log => behaviorDayKey(log) === day);
      const ids = [...new Set(rows.map(episodeKey))];
      return { day, episodes: ids.map(id => ({ id, rows: rows.filter(log => episodeKey(log) === id).sort((a, b) => a.at.localeCompare(b.at)) })) };
    });
    const formatDay = (key: string) => new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const formatTime = (value: string, timezone?: string) => {
      try { return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
      catch { return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
    };
    const eventLabel = (log: BehaviorLog) => isRecoveryPrincipleApplication(log) ? 'Recovery action' : log.type === 'craving' ? 'Craving' : log.type === 'habit_occurrence' ? occurrenceActionLabel(selectedHabit) : 'Technique applied';
    const eventDetails = (log: BehaviorLog) => {
      const bits: string[] = [];
      if (log.type === 'craving' && log.intensity !== undefined) bits.push('Intensity ' + log.intensity + '/10');
      if (log.type === 'habit_occurrence') bits.push((log.quantity ?? 1) + ' ' + occurrenceUnit + ((log.quantity ?? 1) === 1 ? '' : 's'));
      if (isRecoveryPrincipleApplication(log)) bits.push('Return to plan at the next opportunity');
      else if (log.type === 'technique_applied') {
        bits.push(log.technique || 'Technique');
        if (log.timing) bits.push(log.timing);
        const law = lawGroups.find(item => item.id === (log.law || chosenLaw(log)[0]));
        if (law) bits.push(law.break);
      }
      if (log.trigger) bits.push(log.trigger);
      return bits.join(' · ');
    };
    const outcomeLabel = (outcome: string) => outcome === 'resisted' ? 'Resisted' : outcome === 'smoked' ? (isSmoke ? 'Smoked' : 'Engaged in habit') : 'Outcome unknown';
    const configuredOpenEpisodes = [...new Set(logs.filter(log => log.episodeId).map(log => log.episodeId!))];
    return <>
      <div className="page-heading-row logging-heading logging-heading-compact">
        <div><div className="eyebrow">BEHAVIORAL LOG</div><h1>Notice the pattern<span className="heading-period">.</span></h1></div>
        <label className="logging-habit-picker">HABIT<select aria-label="Select habit to break" value={selectedHabit.id} onChange={event => { setLoggingHabitId(event.target.value); setHistoryLimit(30); }}>{habits.filter(habit => habit.kind === 'BREAK').map(habit => <option key={habit.id} value={habit.id}>{habit.name}</option>)}</select></label>
      </div>
      {hasSampleSmokingData && <p className="logging-caveat">Sample analytics preview: eight weeks of varied Smoking cravings, outcomes, cigarette counts, triggers, contexts, and technique use. These synthetic records stay in this browser’s sample workspace and are filtered out of account imports.</p>}
      <div className="logging-view-tabs" role="tablist" aria-label="Behavioral logging views">
        {(['Log', 'Insights', 'History'] as const).map(view => <button key={view} type="button" role="tab" id={'logging-tab-' + view.toLowerCase()} aria-selected={loggingView === view} aria-controls="logging-view-panel" className={loggingView === view ? 'selected' : ''} onClick={() => setLoggingView(view)}>{view}{view === 'History' && <span>{logs.length}</span>}</button>)}
      </div>
      <div id="logging-view-panel" role="tabpanel" aria-labelledby={'logging-tab-' + loggingView.toLowerCase()}>
        {loggingView === 'Log' && <>
          <div className="logging-today-strip">
            <div className="logging-mini-summary"><span className="eyebrow">TODAY · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><div><b>{todaySummary.quantity}</b><span>{isSmoke ? 'cigarettes' : 'occurrences'} logged</span><i/><b>{todaySummary.cravings}</b><span>cravings logged</span><i/><b>{todaySummary.techniqueApplications}</b><span>techniques used</span></div></div>
            <span className="logging-quality-pill">{todaySummary.resistedCravings}/{todaySummary.resolvedCravings} cravings resisted today</span>
          </div>
          <section className="logging-quick-panel">
            <div className="logging-section-heading"><div><span className="eyebrow">ONE TAP TO RECORD</span><h2>What’s happening?</h2></div><span className="logging-live"><i/>{remoteToken ? 'Syncing with account' : 'Saved on this device'}</span></div>
            <div className="logging-quick-actions">
              <button type="button" className="logging-quick-action craving" onClick={() => quickLog('craving')}><span className="logging-action-icon"><Icon name="spark" size={20}/></span><span><b>Craving</b><small>Save an unresolved urge</small></span><Icon name="plus" size={18}/></button>
              <button type="button" className="logging-quick-action occurrence" onClick={() => quickLog('habit_occurrence')}><span className="logging-action-icon"><Icon name="arrow-up-right" size={20}/></span><span><b>{occurrenceActionLabel(selectedHabit)}</b><small>One {occurrenceUnit} by default</small></span><Icon name="plus" size={18}/></button>
              <button type="button" className="logging-quick-action technique" onClick={() => quickLog('technique_applied')}><span className="logging-action-icon"><Icon name="check" size={20}/></span><span><b>Used a technique</b><small>Choose from your strategy</small></span><Icon name="plus" size={18}/></button>
            </div>
            {recentSavedLogId && <p className="logging-save-confirmation" role="status"><Icon name="check" size={16}/> Saved just now. <button type="button" onClick={() => { const saved = behaviorLogs.find(log => log.id === recentSavedLogId); if (saved) editBehaviorLog(saved); }}>Add details or change outcome</button></p>}
          </section>
          <section className="logging-confirm-card">
            <div><span className="eyebrow">OPTIONAL DAILY CONFIRMATION</span><h2>Confirm today’s record</h2><p>Only confirmed days count as habit free. You can change this later.</p></div>
            <div className="logging-confirm-actions" role="group" aria-label="Daily habit confirmation">
              {([
                ['no_occurrence', 'No ' + (isSmoke ? 'smoking' : selectedHabit.name)],
                ['occurred_recorded', 'Occurred, logged'],
                ['incomplete', 'Records incomplete'],
                ['skip', 'Skip today'],
              ] as [DailyConfirmationStatus, string][]).map(([status, title]) => <button key={status} type="button" className={currentConfirmation?.status === status ? 'selected' : ''} aria-pressed={currentConfirmation?.status === status} onClick={() => saveDailyConfirmation(status)}>{title}</button>)}
            </div>
            {todaySummary.conflict && <p className="logging-conflict" role="alert">Your {currentConfirmation?.status === 'no_occurrence' ? 'no occurrence' : 'occurred and recorded'} confirmation conflicts with {todaySummary.occurrenceEvents} logged occurrence events. Correct either record above.</p>}
          </section>
          <div className="logging-quick-footer">
            <button type="button" className="text-button" aria-expanded={logFormOpen} onClick={() => setLogFormOpen(value => !value)}>{logFormOpen ? 'Hide entry details' : 'Add context, backdate, or edit an entry'} <Icon name="chevron" size={14}/></button>
            <details className="logging-tag-manager"><summary>Manage custom context tags <span>{customContextTags.length}</span></summary><div><label>NEW TAG<input aria-label="New custom context tag" value={customTagDraft} onChange={event => setCustomTagDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustomContextTag(); } }} placeholder="e.g. after a long commute"/></label><button type="button" className="secondary-button" onClick={addCustomContextTag}>Add tag</button><div className="logging-custom-tags">{customContextTags.map(tag => <button type="button" key={tag} onClick={() => setCustomContextTags(current => current.filter(item => item !== tag))} aria-label={'Remove custom tag ' + tag}>{tag}<span aria-hidden="true">×</span></button>)}</div></div></details>
          </div>
          {logFormOpen && <form className="logging-form logging-advanced-form" onSubmit={saveBehaviorLog}>
            <div className="logging-form-head"><div><span className="eyebrow">{editingLogId ? 'EDIT ENTRY' : 'OPTIONAL DETAILS'}</span><h2>{editingLogId ? 'Correct this event' : 'Add detail if useful'}</h2></div><button type="button" className="text-button" onClick={resetBehaviorDraft}>Close</button></div>
            <div className="logging-type-tabs" role="group" aria-label="Choose event type">{([{ id: 'craving', title: 'Craving', icon: 'spark' }, { id: 'habit_occurrence', title: occurrenceActionLabel(selectedHabit), icon: 'arrow-up-right' }, { id: 'technique_applied', title: 'Technique', icon: 'check' }] as const).map(item => <button type="button" key={item.id} className={logType === item.id ? 'selected' : ''} aria-pressed={logType === item.id} onClick={() => { setLogType(item.id); setLogOutcome('pending'); }}><Icon name={item.icon} size={17}/><span>{item.title}</span></button>)}</div>
            <label className="logging-field">Trigger <span>OPTIONAL</span><input list="behavior-triggers" value={logTrigger} onChange={event => setLogTrigger(event.target.value)} placeholder="What was happening?"/><datalist id="behavior-triggers">{['After eating', 'Stress', 'Boredom', 'Coffee', 'Waking up', 'Social break', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label>
            {logType === 'craving' && <div className="logging-field-row"><label className="logging-field">Craving intensity <span>OPTIONAL · 0 TO 10</span><input type="number" min="0" max="10" value={logIntensity} onChange={event => setLogIntensity(event.target.value)} placeholder="Not recorded"/></label><label className="logging-field">Outcome<select value={logOutcome ?? 'pending'} onChange={event => setLogOutcome(event.target.value as BehaviorLog['outcome'])}><option value="pending">Still experiencing it</option><option value="resisted">Resisted without engaging</option><option value="smoked">{isSmoke ? 'Smoked' : 'Engaged in the habit'}</option></select></label></div>}{logType === 'craving' && logOutcome !== 'pending' && <label className="logging-field">Resolution time <span>OPTIONAL · LEAVE EMPTY IF UNKNOWN</span><input type="datetime-local" value={logResolvedTimestamp} onChange={event => setLogResolvedTimestamp(event.target.value)}/><small>Used for time to resolution only when you know when the craving ended.</small></label>}
            {logType === 'habit_occurrence' && <label className="logging-field">{isSmoke ? 'Cigarettes' : 'Quantity'}<span>DEFAULT 1</span><input type="number" min="1" max="100" value={logQuantity} onChange={event => setLogQuantity(Number(event.target.value))}/></label>}
            {logType === 'technique_applied' && <><label className="logging-field">Strategy technique<select aria-label="Choose a technique from this habit strategy" value={selectedTechniqueKey} onChange={event => { const choice = techniqueChoices.find(item => item.key === event.target.value); setLogTechniqueId(choice?.techniqueId ?? ''); setLogVariationId(choice?.variationId ?? ''); setLogTechnique(choice?.name ?? ''); }}><option value="">Choose a configured technique</option>{techniqueChoices.map(choice => <option key={choice.key} value={choice.key}>{choice.name} · {choice.laws.map(id => lawGroups.find(law => law.id === id)?.break).filter(Boolean).join(', ')}</option>)}{editingLogId && logTechnique && !techniqueChoices.some(item => item.key === selectedTechniqueKey) && <option value={selectedTechniqueKey}>{logTechnique} · historical technique</option>}</select>{!techniqueChoices.length && <small>Configure techniques under this habit’s strategy before logging an application.</small>}</label><div className="logging-field-row"><label className="logging-field">When was it used?<select value={logTiming} onChange={event => setLogTiming(event.target.value as 'preventive' | 'responsive')}><option value="responsive">During a craving or event</option><option value="preventive">Before a craving or risk</option></select></label><label className="logging-field">Craving intensity <span>OPTIONAL</span><input type="number" min="0" max="10" value={logIntensity} onChange={event => setLogIntensity(event.target.value)} placeholder="Not recorded"/></label></div></>}
            <label className="logging-field">Related episode <span>OPTIONAL · LEAVE AUTO TO LINK A RECENT OPEN CRAVING</span><select value={logEpisodeId} onChange={event => setLogEpisodeId(event.target.value)}><option value="">Auto link or start a new episode</option><option value="__new__">Start a new episode</option>{configuredOpenEpisodes.map(id => { const episodeEvent = logs.find(log => log.episodeId === id); return <option key={id} value={id}>Existing episode · {episodeEvent?.trigger || formatTime(episodeEvent?.at ?? new Date().toISOString(), episodeEvent?.timezone)}</option>; })}</select></label>
            <details className="logging-advanced-context"><summary>Add optional context</summary><div className="logging-context-grid"><label className="logging-field">Emotion<input list="emotion-tags" value={logEmotions} onChange={event => setLogEmotions(event.target.value)} placeholder="Stressed, bored"/><datalist id="emotion-tags">{['Stressed', 'Anxious', 'Bored', 'Sad', 'Angry', 'Excited', 'Relaxed', 'Frustrated', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label><label className="logging-field">Environment<input list="environment-tags" value={logEnvironments} onChange={event => setLogEnvironments(event.target.value)} placeholder="At home, in the car"/><datalist id="environment-tags">{['At home', 'At work', 'Outside', 'In the car', 'Social gathering', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label><label className="logging-field">Activity<input list="activity-tags" value={logActivities} onChange={event => setLogActivities(event.target.value)} placeholder="Coffee, after a meal"/><datalist id="activity-tags">{['Working', 'Scrolling', 'Drinking coffee', 'Finishing a meal', 'Watching television', 'Walking', 'Resting', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label><label className="logging-field">Social situation<input list="social-tags" value={logSocial} onChange={event => setLogSocial(event.target.value)} placeholder="Alone, with friends"/><datalist id="social-tags">{['Alone', 'With friends', 'With family', 'Around people engaging in the habit', ...customContextTags].map(value => <option key={value} value={value}/>)}</datalist></label><label className="logging-field">Other tags <span>SEPARATE WITH COMMAS</span><input value={logContextTags} onChange={event => setLogContextTags(event.target.value)} placeholder="Custom context"/></label></div></details>
            <details className="logging-advanced-context"><summary>Mindset notes <span>optional</span></summary><div className="logging-context-grid"><label className="logging-field">Automatic thought<input value={logAutomaticThought} onChange={event => setLogAutomaticThought(event.target.value)} placeholder="What went through your mind?"/></label><label className="logging-field">Belief<input value={logBelief} onChange={event => setLogBelief(event.target.value)} placeholder="What did it seem to promise?"/></label><label className="logging-field">Confidence resisting <span>0 TO 10</span><input type="number" min="0" max="10" value={logConfidence} onChange={event => setLogConfidence(event.target.value)} placeholder="Not recorded"/></label><label className="logging-field">Reframing used<input value={logReframing} onChange={event => setLogReframing(event.target.value)} placeholder="Optional cognitive reframe"/></label><label className="logging-field">Intensity after technique <span>0 TO 10</span><input type="number" min="0" max="10" value={logIntensityAfter} onChange={event => setLogIntensityAfter(event.target.value)} placeholder="Not recorded"/></label></div></details>
            <label className="logging-field">Notes <span>OPTIONAL</span><textarea value={logNote} onChange={event => setLogNote(event.target.value)} placeholder="Anything you want to remember" rows={2}/></label>
            <details className="logging-backdate" open={Boolean(editingLogId)}><summary>{editingLogId ? 'Date and time' : 'Log a past event'}</summary><label className="logging-field">DATE AND TIME<input type="datetime-local" value={logTimestamp} onChange={event => setLogTimestamp(event.target.value)}/></label><small>Leave blank to use the current time. Day grouping uses the recorded local date and timezone.</small></details>
            <div className="logging-form-actions"><button className="primary-button logging-submit" type="submit"><Icon name={editingLogId ? 'check' : 'plus'} size={17}/>{editingLogId ? 'Save changes' : 'Save entry'}</button>{editingLogId && <button type="button" className="text-button" onClick={resetBehaviorDraft}>Cancel edit</button>}</div>
            <p className="logging-privacy">Unknown outcomes stay unknown. A missing log is never treated as abstinence.</p>
          </form>}
        </>}
        {loggingView === 'Insights' && <div className="logging-insights-page">
          <div className="logging-insight-toolbar">
            <label className="logging-period-picker">PERIOD<select aria-label="Insights period" value={insightFrom || insightTo ? 'custom' : insightDays} onChange={event => { setInsightDays(event.target.value === '24h' ? '24h' : Number(event.target.value)); setInsightFrom(''); setInsightTo(''); }}><option value="24h">24 hours</option>{(insightFrom || insightTo) && <option value="custom" disabled>Custom date range</option>}<option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
            <details className="logging-insight-filter-disclosure">
              <summary><Icon name="chevron" size={15}/> Advanced filters <span>{[insightFrom || insightTo, insightLawFilter !== 'all', insightTriggerFilter !== 'all', insightIntensityFilter !== 'all', insightTimingFilter !== 'all'].filter(Boolean).length ? 'Active' : 'None active'}</span></summary>
              <div className="logging-insight-filter-fields">
                <p className="logging-filter-scope">Dates change the analytics period. Law, trigger, intensity, and use narrow technique results.</p>
                <label className="logging-date-field">FROM<input aria-label="Custom insights start date" type="date" value={insightFrom} onChange={event => setInsightFrom(event.target.value)}/></label>
                <label className="logging-date-field">TO<input aria-label="Custom insights end date" type="date" value={insightTo} onChange={event => setInsightTo(event.target.value)}/></label>
                <label>LAW<select aria-label="Filter technique applications by law" value={insightLawFilter} onChange={event => setInsightLawFilter(event.target.value)}><option value="all">All laws</option>{lawGroups.slice(0, 4).map(item => <option key={item.id} value={item.id}>{item.break}</option>)}</select></label>
                <label>TRIGGER<select aria-label="Filter technique applications by trigger" value={insightTriggerFilter} onChange={event => setInsightTriggerFilter(event.target.value)}><option value="all">All triggers</option>{allTriggers.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label>INTENSITY<select aria-label="Filter technique applications by craving intensity" value={insightIntensityFilter} onChange={event => setInsightIntensityFilter(event.target.value)}><option value="all">All intensities</option><option value="low">0 to 3</option><option value="medium">4 to 6</option><option value="high">7 to 10</option><option value="unknown">Not recorded</option></select></label>
                <label>USE<select aria-label="Filter preventive or responsive technique use" value={insightTimingFilter} onChange={event => setInsightTimingFilter(event.target.value)}><option value="all">All applications</option><option value="responsive">Responsive</option><option value="preventive">Preventive</option></select></label>
              </div>
            </details>
            <span className="logging-quality-pill" title="Descriptive evidence is based only on records in the selected period and the outcomes you entered">{rating}</span>
          </div>
          <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">01 · {periodEyebrow} · OVERVIEW</span><h2>Period Check-in</h2></div><span className="logging-date-pill">{periodRangeText}</span></div><PeriodCheckin habitName={selectedHabit.name} isSmoking={isSmoke} periodLabel={periodLabel} current={currentPeriod} previous={previousPeriod} configuredTechniques={configured.size} techniqueApplicationCount={techniqueApplicationLogs.length} hasTechniqueFilters={hasTechniqueFilters} usedTechniques={techniquePractice.techniques} topTrigger={topTriggers[0] ? { name: topTriggers[0][0], count: topTriggers[0][1] } : undefined}/></section>
          <section className="logging-insight-section logging-review-card logging-behavior-insights">
            <div className="logging-section-heading">
              <div><span className="eyebrow">02 · {periodEyebrow} · BEHAVIORAL INSIGHTS</span><h2>Your Behavioral Insights</h2></div>
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
              <div><span className="eyebrow">03 · {periodEyebrow} · FOUR REVERSE LAWS</span><h2>What’s Working?</h2></div>
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
            <section className="logging-insight-section" id="logging-trigger-analytics"><div className="logging-section-heading"><div><span className="eyebrow">04 · {periodEyebrow} · TRIGGERS</span><h2>Common triggers</h2></div></div>{triggerStats.length ? <div className="logging-trigger-list">{triggerStats.map(item => <div key={item.name} className="logging-trigger-analysis"><span>{item.name}</span><b>{item.count} logged · {item.episodes} episodes</b><i><em style={{ width: Math.max(8, item.count / Math.max(1, triggerStats[0]?.count ?? 1) * 100) + '%' }}/></i><small>{item.resolved ? item.resisted + '/' + item.resolved + ' resolved episodes resisted' : 'No resolved outcomes yet'}{item.resolved < 5 ? ' · limited observations' : ''}</small></div>)}</div> : <p className="logging-empty-hint">Add triggers to see their logged frequency and associated outcomes.</p>}<p className="logging-caveat">Counts show how often a trigger was recorded. Associated outcomes are descriptive, not causal.</p></section>
            <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">05 · {periodEyebrow} · OUTCOME TREND</span><h2>{isSmoke ? 'Cigarette quantity trend' : 'Habit occurrence trend'}</h2></div><span className="logging-chart-note">{isHourlyWindow ? 'No event in an hour is not a confirmed zero' : 'No record is unknown'}</span></div><div className="logging-bars-scroll"><div className="logging-bars logging-bars-wide" role="img" aria-label={(isSmoke ? 'Cigarettes' : 'Habit occurrences') + (isHourlyWindow ? ' by hour over the past 24 hours.' : ' logged by local day. Unconfirmed days without an occurrence record are shown as unknown.')} style={{ minWidth: Math.max(320, periodBuckets.length * 25) + 'px' }}>{periodBuckets.map(bucket => { const value = isSmoke ? bucket.summary.quantity : bucket.summary.occurrenceEvents; const known = Boolean(bucket.summary.knownOccurrenceCount); const height = value ? Math.max(8, value / maxOccurrence * 100) : known ? 4 : 3; return <div className={'logging-bar-day ' + (!known ? 'unknown' : '')} key={bucket.key} title={bucket.detail + ': ' + (known ? value + ' logged' : 'no occurrence record')}><span>{known ? value : '·'}</span><i style={{ height: height + '%' }}/><small>{bucket.label}</small></div>; })}</div></div><div className="logging-legend"><span><i/> {isHourlyWindow ? 'Occurrence logged' : 'Logged or explicitly confirmed'}</span><span><i/> No occurrence data</span></div><p className="logging-caveat">{isHourlyWindow ? 'An hour without an occurrence record is not confirmed as zero.' : 'Confirmed no occurrence days require an explicit daily confirmation. Days without an occurrence entry are not counted as zero.'}</p></section>
            <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">06 · {periodEyebrow} · CRAVING ANALYSIS</span><h2>Cravings logged</h2></div></div><div className="logging-bars-scroll"><div className="logging-bars logging-bars-wide" role="img" aria-label={isHourlyWindow ? "Number of cravings logged in each hour of the past 24 hours." : "Number of cravings logged each local day. Counts describe logging activity."} style={{ minWidth: Math.max(320, periodBuckets.length * 25) + 'px' }}>{periodBuckets.map(bucket => { const value = bucket.summary.cravings; return <div className="logging-bar-day" key={bucket.key} title={bucket.detail + ': ' + value + ' craving logs'}><span>{value}</span><i style={{ height: (value ? Math.max(8, value / maxCravings * 100) : 4) + '%' }}/><small>{bucket.label}</small></div>; })}</div></div><div className="logging-stat-grid compact"><div><b>{rangeCravings.length}</b><span>cravings logged in period</span></div><div><b>{avgIntensity}</b><span>average recorded intensity</span></div><div><b>{resolvedCravings.length}</b><span>known outcomes</span></div><div><b>{rangeCravings.length - resolvedCravings.length}</b><span>unresolved or unknown</span></div><div><b>{averageResolutionMinutes === '—' ? '—' : averageResolutionMinutes + ' min'}</b><span>average time to resolution when recorded · {resolutionMinutes.length} episodes</span></div></div><div className="logging-intensity-distribution"><b>Recorded intensity distribution</b>{intensityDistribution.map(item => <span key={item.label}>{item.label}/10 <i>{item.count}</i></span>)}</div><p className="logging-caveat">Fewer logged cravings do not show that cravings decreased when logging completeness is unknown.</p></section>
            <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">07 · {periodEyebrow} · TIME PATTERNS</span><h2>When events are logged</h2></div></div><div className="logging-time-blocks">{occurrenceBins.map(bin => <div key={bin.name}><b>{bin.count} occurrences</b><span>{bin.name}</span><small>{cravingBins.find(item => item.name === bin.name)?.count ?? 0} cravings</small></div>)}</div><div className="logging-hour-grid" role="img" aria-label="Hourly logged habit occurrence and craving event counts from midnight to 11 PM">{hourly.map(item => <div key={item.hour} title={item.hour + ':00 · ' + item.count + ' occurrences · ' + item.cravings + ' cravings'}><i style={{ height: Math.max(3, item.count / Math.max(1, ...hourly.map(value => value.count)) * 42) + 'px' }}/><i className="craving-bar" style={{ height: Math.max(3, item.cravings / Math.max(1, ...hourly.map(value => value.cravings)) * 42) + 'px' }}/><small>{item.hour % 3 === 0 ? item.hour : ''}</small></div>)}</div><div className="logging-legend"><span><i/> Occurrences</span><span className="craving-legend"><i/> Cravings</span></div><div className="logging-weekday-grid">{weekdayCounts.map(item => <div key={item.day}><b>{item.count}</b><span>{item.label}</span><small>{item.cravings} cravings</small></div>)}</div><p className="logging-caveat">Periods with few records can look prominent by chance. Counts describe entries, not underlying risk.</p></section>
          </div>
          <section className="logging-insight-section"><div className="logging-section-heading"><div><span className="eyebrow">08 · {periodEyebrow} · COMPARISON</span><h2>Selected period vs previous period</h2></div></div><div className="logging-weekly-grid"><div className="logging-table-header"><span>Measure</span><span>Previous period</span><span>Selected period</span><span>Change</span></div>{([
            [isSmoke ? 'Cigarettes recorded' : 'Occurrence quantity', previousPeriod.quantity, currentPeriod.quantity, delta(currentPeriod.quantity, previousPeriod.quantity)],
            ['Occurrence events', previousPeriod.occurrences, currentPeriod.occurrences, delta(currentPeriod.occurrences, previousPeriod.occurrences)],
            ['Cravings logged', previousPeriod.cravings, currentPeriod.cravings, delta(currentPeriod.cravings, previousPeriod.cravings)],
            ['Average recorded craving intensity', previousPeriod.averageIntensity, currentPeriod.averageIntensity, 'Descriptive'],
            ['Resolved cravings resisted', previousPeriod.resisted + '/' + previousPeriod.resolved + (previousPeriod.resolved ? ' (' + Math.round(previousPeriod.resisted / previousPeriod.resolved * 100) + '%)' : ''), currentPeriod.resisted + '/' + currentPeriod.resolved + (currentPeriod.resolved ? ' (' + Math.round(currentPeriod.resisted / currentPeriod.resolved * 100) + '%)' : ''), 'Counts and denominators shown'],
            ['Technique applications', previousPeriod.techniques, currentPeriod.techniques, delta(currentPeriod.techniques, previousPeriod.techniques)],
            ['No-occurrence confirmations', previousPeriod.noOccurrenceConfirmations, currentPeriod.noOccurrenceConfirmations, delta(currentPeriod.noOccurrenceConfirmations, previousPeriod.noOccurrenceConfirmations)],
            ['Days with logs / confirmations', previousPeriod.loggedDays + ' / ' + previousPeriod.days + ', ' + previousPeriod.confirmations + ' confirmed', currentPeriod.loggedDays + ' / ' + currentPeriod.days + ', ' + currentPeriod.confirmations + ' confirmed', 'Completeness'],
          ] as [string, string | number, string | number, string][]).map(row => <div className="logging-week-row" key={row[0]}><b>{row[0]}</b><span>{row[1]}</span><span>{row[2]}</span><span>{row[3]}</span></div>)}</div><p className="logging-caveat">The selected {periodLabel} is compared with the immediately previous equally long period. The 24 hour option compares exact rolling windows. A zero previous value has no percentage change.</p></section>
          {confirmationConflicts.length > 0 && <section className="logging-insight-section logging-conflict-list"><div className="logging-section-heading"><div><span className="eyebrow">DATA CHECK</span><h2>Confirmation conflicts</h2></div><span className="logging-chart-note">{confirmationConflicts.length} day{confirmationConflicts.length === 1 ? '' : 's'}</span></div><p className="logging-caveat">A daily confirmation disagrees with occurrence records on a date covered by this period. Correct either side; Habitly keeps both until you do.</p>{confirmationConflicts.map(day => <div className="logging-conflict-row" key={day.key}><div><b>{formatDay(day.key)}</b><small>{day.summary.confirmation?.status === 'no_occurrence' ? day.summary.occurrenceEvents + ' occurrence events are logged' : 'You confirmed an occurrence was recorded, but none is logged'}</small></div>{day.summary.confirmation?.status === 'no_occurrence' ? <><button type="button" onClick={() => saveDailyConfirmation('occurred_recorded', day.key)}>Occurred, logged</button><button type="button" onClick={() => saveDailyConfirmation('incomplete', day.key)}>Records incomplete</button></> : <><button type="button" onClick={() => saveDailyConfirmation('no_occurrence', day.key)}>No occurrence</button><button type="button" onClick={() => saveDailyConfirmation('incomplete', day.key)}>Records incomplete</button></>}<button type="button" className="text-button" onClick={() => { setHistoryFrom(day.key); setHistoryTo(day.key); setLoggingView('History'); }}>Review events</button></div>)}</section>}
        </div>}
        {loggingView === 'History' && <section className="logging-history-section">
          <div className="logging-section-heading"><div><span className="eyebrow">REVIEW AND CORRECT</span><h2>Behavior history <span className="soft-count">{historyLogs.length}</span></h2></div><span className="logging-chart-note">Grouped by local day and behavioral episode</span></div>
          <div className="logging-history-filters"><label>TYPE<select value={historyTypeFilter} onChange={event => { setHistoryTypeFilter(event.target.value); setHistoryLimit(30); }}><option value="all">All events</option><option value="craving">Cravings</option><option value="habit_occurrence">Habit occurrences</option><option value="technique_applied">Techniques</option><option value="recovery">Recovery actions</option></select></label><label>TRIGGER<input value={historyTriggerFilter} onChange={event => setHistoryTriggerFilter(event.target.value)} list="history-trigger-options" placeholder="All triggers"/><datalist id="history-trigger-options">{allTriggers.map(value => <option key={value} value={value}/>)}</datalist></label><label>TECHNIQUE<input value={historyTechniqueFilter} onChange={event => setHistoryTechniqueFilter(event.target.value)} placeholder="Any technique"/></label><label>LAW<select value={historyLawFilter} onChange={event => setHistoryLawFilter(event.target.value)}><option value="all">All laws</option>{lawGroups.slice(0, 4).map(item => <option key={item.id} value={item.id}>{item.break}</option>)}</select></label><label>OUTCOME<select value={historyOutcomeFilter} onChange={event => setHistoryOutcomeFilter(event.target.value)}><option value="all">All outcomes</option><option value="resisted">Resisted</option><option value="smoked">{isSmoke ? 'Smoked' : 'Engaged'}</option><option value="unknown">Unknown or unresolved</option></select></label><label className="logging-date-field">FROM<input type="date" value={historyFrom} onChange={event => setHistoryFrom(event.target.value)}/></label><label className="logging-date-field">TO<input type="date" value={historyTo} onChange={event => setHistoryTo(event.target.value)}/></label><button type="button" className="text-button logging-clear-filters" onClick={() => { setHistoryTypeFilter('all'); setHistoryTriggerFilter(''); setHistoryTechniqueFilter(''); setHistoryLawFilter('all'); setHistoryOutcomeFilter('all'); setHistoryFrom(''); setHistoryTo(''); }}>Clear filters</button></div>
          {timelineGroups.length ? <div className="logging-history-days">{timelineGroups.map(day => <section key={day.day}><h3>{formatDay(day.day)}</h3>{day.episodes.map(episode => { const multi = episode.rows.length > 1; const episodeTitle = multi ? 'Behavioral episode · ' + episode.rows.length + ' linked events' : eventLabel(episode.rows[0]); const outcome = episode.rows.map(getOutcome).find(value => value !== 'unknown') ?? resolvedEpisodeOutcome(logs, episode.id); const expanded = expandedEpisodes.includes(episode.id); return <details key={episode.id} className="logging-episode" open={expanded || undefined} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedEpisodes(current => isOpen ? [...new Set([...current, episode.id])] : current.filter(id => id !== episode.id)); }}><summary><span className="logging-episode-mark"><Icon name={multi ? 'refresh' : episode.rows[0].type === 'craving' ? 'spark' : episode.rows[0].type === 'habit_occurrence' ? 'arrow-up-right' : 'check'} size={17}/></span><span><b>{episodeTitle}</b><small>{formatTime(episode.rows[0].at, episode.rows[0].timezone)}{episode.rows[0].trigger ? ' · ' + episode.rows[0].trigger : ''}</small></span>{outcome !== 'unknown' && <em className={'behavior-outcome ' + outcome}>{outcomeLabel(outcome)}</em>}<Icon name="chevron" size={16}/></summary><ol className="behavior-timeline">{episode.rows.map(log => <li key={log.id}><span className={'behavior-type-mark ' + log.type}><Icon name={log.type === 'craving' ? 'spark' : log.type === 'habit_occurrence' ? 'arrow-up-right' : 'check'} size={16}/></span><div className="behavior-log-main"><div className="behavior-log-title"><b>{eventLabel(log)}</b><time>{formatTime(log.at, log.timezone)}</time></div><p>{eventDetails(log)}</p>{log.type === 'craving' && <span className={'behavior-outcome ' + getOutcome(log)}>{outcomeLabel(getOutcome(log))}</span>}{log.context && <small>{[...(log.context.emotions ?? []), ...(log.context.environments ?? []), ...(log.context.activities ?? []), ...(log.context.social ?? []), ...(log.context.tags ?? [])].join(' · ')}</small>}{(log.automaticThought || log.belief || log.reframing) && <small>{[log.automaticThought, log.belief, log.reframing].filter(Boolean).join(' · ')}</small>}{log.note && <small>{log.note}</small>}<div className="behavior-log-actions"><button type="button" onClick={() => editBehaviorLog(log)}>Edit</button><button type="button" onClick={() => deleteBehaviorLog(log.id)}>Remove</button></div></div></li>)}</ol></details>; })}</section>)}</div> : <div className="logging-empty-state"><Icon name="clock" size={23}/><b>No matching events</b><span>Adjust the filters or record a new event in the Log tab.</span><button type="button" className="text-button" onClick={() => setLoggingView('Log')}>Go to Log <Icon name="arrow" size={14}/></button></div>}
          {historyLogs.length > visibleHistory.length && <button type="button" className="secondary-button logging-load-more" onClick={() => setHistoryLimit(value => value + 30)}>Load 30 more events</button>}
        </section>}
      </div>
      {loggingView === 'Log' && <p className="logging-storage-note">{remoteToken ? 'Account sync is active. Changes remain available on this device.' : 'Saved in this browser. Connect an account in Settings to sync across devices.'}</p>}
    </>;
  }

  function renderToday() {
    return <>
      <div className="page-heading-row today-page-heading"><div className="today-greeting"><div className="today-greeting-top"><div className="eyebrow">{currentDate}</div><button type="button" className="habit-arrange-button" aria-label={reorderingHabits ? 'Done arranging habits' : 'Arrange habits'} title={reorderingHabits ? 'Done arranging' : 'Arrange habits'} aria-pressed={reorderingHabits} onClick={() => setReorderingHabits(value => !value)}>{reorderingHabits ? <Icon name="check" size={18}/> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>}</button></div><h1>{hydrated ? greeting() : 'Welcome'}, Joseph<span className="heading-period">.</span></h1></div></div>
      <section className="today-section"><div className="section-heading today-section-heading"><div><span className="eyebrow">YOUR SMALL PROMISES</span><h2>Today’s habits <span className="soft-count">{todayHabits.length}</span></h2><p className="today-progress-note">{completed} of {buildHabits.length} build habits completed</p></div><div className="today-list-actions"><button className="text-button today-add-button" onClick={() => startNewHabit('BUILD')}><Icon name="plus" size={15}/> Add habit</button></div></div><div className="habit-list">{todayHabits.length ? todayHabits.map((habit, i) => <div className={`today-order-item${dragState?.id === habit.id ? ' is-dragging' : ''}${dragState && dragState.id !== habit.id && dragState.target === i ? ' is-drop-target' : ''}`} key={habit.id} style={dragState?.id === habit.id ? { transform: `translateY(${dragState.offset}px)` } : undefined}>{renderHabitCard(habit, i)}{reorderingHabits && <button type="button" className="habit-drag-handle" aria-label={`Drag to move ${habit.name}. Use up or down arrow keys to reorder.`} onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = { id: habit.id, y: event.clientY, target: i }; setDragState({ id: habit.id, offset: 0, target: i }); }} onPointerMove={event => { const drag = dragStart.current; if (!drag || drag.id !== habit.id) return; const target = dragTarget(event.clientY); drag.target = target; setDragState({ id: drag.id, offset: event.clientY - drag.y, target }); if (event.clientY < 70) window.scrollBy(0, -14); else if (event.clientY > window.innerHeight - 70) window.scrollBy(0, 14); }} onPointerUp={event => { const drag = dragStart.current; if (drag?.id === habit.id) moveHabit(i, drag.target); dragStart.current = null; setDragState(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragStart.current = null; setDragState(null); }} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); moveHabit(i, i + (event.key === 'ArrowUp' ? -1 : 1)); } }}><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg><span>Drag to reorder</span></button>}</div>) : <div className="empty-card"><div className="empty-flower"><Icon name="spark" size={18}/></div><h3>Start with one tiny promise.</h3><p>Choose a cue, make the action easy, and give your future self a clear path.</p><button className="primary-button" onClick={() => startNewHabit('BUILD')}><Icon name="plus"/> Create your first habit</button></div>}</div></section>
    </>;
  }

  function renderHabits() {
    const good = habits.filter(h => h.kind === 'BUILD');
    return <><div className="page-heading-row"><div><div className="eyebrow">MAKE IT OBVIOUS. MAKE IT EASY.</div><h1>Your habits<span className="heading-period">.</span></h1><p className="page-subtitle">Small actions, attached to the life you already live.</p></div><button className="primary-button" onClick={() => startNewHabit('BUILD')}><Icon name="plus"/> Create habit</button></div><div className="habits-intro"><div className="intro-badge"><Icon name="spark"/></div><div><b>Start tiny. Stay consistent.</b><p>Choose an action and a pace that work for you. A smaller starter action is there if you want one.</p></div></div><div className="section-heading"><div><span className="eyebrow">BUILDING WHO YOU ARE</span><h2>Habits to build <span className="soft-count">{good.length}</span></h2></div></div><div className="habit-list">{good.length ? good.map(renderHabitCard) : <div className="empty-card"><div className="empty-flower"><Icon name="spark" size={18}/></div><h3>One small promise is enough.</h3><p>Pick a cue and an easy starter action. You can build up once the routine feels familiar.</p><button className="primary-button" onClick={() => startNewHabit('BUILD')}><Icon name="plus"/> Create a habit</button></div>}</div><button className="text-button anti-link" onClick={() => setActive('Habit to break')}>Manage habits you want to break <Icon name="arrow" size={15}/></button></>;
  }

  function renderRecovery() {
    const needs = habits.filter(h => h.missedYesterday);
    const circuitBreaker = needs.some(h => getResilientStreak(history, h.id).broken);
    const recentDays = Array.from({ length: 28 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (27 - i)); const key = todayKeyFromDate(d); const statuses = history[key] ?? []; return { key, day: d.getDate(), done: statuses.filter(x => !x.startsWith('missed:')).length, missed: statuses.filter(x => x.startsWith('missed:')).length }; });
    return <><div className="page-heading-row"><div><div className="eyebrow">THE COMEBACK COUNTS</div><h1>History and recovery<span className="heading-period">.</span></h1><p className="page-subtitle">You never have to be perfect. Just return to the path.</p></div></div><section className="calendar-card"><div className="calendar-heading"><div><span className="eyebrow">PROGRESS YOU CAN SEE</span><h3>Last 28 days</h3></div><div className="calendar-legend"><span><i className="activity-done"/> Showed up</span><span><i className="activity-missed"/> Rest / miss</span></div></div><div className="activity-calendar">{recentDays.map(d => <div key={d.key} title={`${d.key}: ${d.done} votes, ${d.missed} missed`} className={`activity-cell ${d.done ? 'activity-done' : d.missed ? 'activity-missed' : ''}`}><span>{d.day}</span></div>)}</div></section>{needs.length > 0 && <div className={`recovery-hero ${circuitBreaker ? 'recovery-circuit-breaker' : ''}`}><div className="recovery-sun"><Icon name="arrow-up-right" size={24}/></div><span className="overline">{circuitBreaker ? 'CIRCUIT BREAKER · RESET THE ACTION, NOT YOUR IDENTITY' : 'RECOVERY RULE · NEVER MISS TWICE'}</span><h2>{circuitBreaker ? 'Two misses are a signal to shrink the next step.' : needs.length ? 'You missed a day. You still belong here.' : 'You’re back in rhythm.'}</h2><p>{circuitBreaker ? 'Make the next action almost impossible to skip. Choose the smallest gateway action and put the cue directly in your path. Your identity votes are still here.' : needs.length ? 'After a lapse, return to your plan at the next opportunity. One slip does not have to become a pattern.' : 'No recovery needed right now. Keep your next step small and your cues clear.'}</p><div className="recovery-stats"><div><b>{votes}</b><span>identity votes kept</span></div><div><b>{needs.filter(h => h.completed).length}/{needs.length || 0}</b><span>comeback actions</span></div><div><b>1 day</b><span>grace built in</span></div></div></div>}<div className="section-heading space-top"><div><span className="eyebrow">A GENTLE NUDGE</span><h2>{needs.length ? 'Pick one to restart' : 'Your habits today'}</h2></div></div><div className="habit-list">{(needs.length ? needs : todayHabits).map(renderHabitCard)}</div></>;
  }

  function renderVault() {
    return <><div className="page-heading-row"><div><div className="eyebrow">MAKE IT ATTRACTIVE</div><h1>The reward vault<span className="heading-period">.</span></h1><p className="page-subtitle">Pair something you want with the habit you need.</p></div></div><div className="vault-hero"><div className="vault-hero-icon"><Icon name="spark" size={18}/></div><div><span className="overline">TEMPTATION BUNDLING</span><h2>Earn the thing you love.</h2><p>Your wants wait here until you complete the action they’re paired with.</p></div><div className="vault-unlocked"><b>{unlockedRewards.length}</b><span>unlocked today</span></div></div><div className="vault-grid">{rewards.filter(r => habits.some(h => h.id === r.habitId)).map(r => { const need = habits.find(h => h.id === r.habitId); const isUnlocked = !!need?.completed; return <article className={`reward-card ${isUnlocked ? 'reward-card-open' : ''}`} key={r.id}><div className={`reward-symbol ${isUnlocked ? 'reward-symbol-open' : ''}`}>{isUnlocked ? <Icon name="spark" size={21}/> : <Icon name="lock" size={21}/>}</div><span className={`reward-status ${isUnlocked ? 'status-open' : ''}`}>{isUnlocked ? 'UNLOCKED' : 'WAITING FOR YOU'}</span><h3>{r.name}</h3><p>{r.detail}</p><div className="reward-linked">{isUnlocked ? <Icon name="check" size={13}/> : <Icon name="lock" size={13}/>} Linked to: <b>{need?.name ?? 'Habit removed'}</b></div></article>; })}</div><form className="vault-add-card" onSubmit={addVaultReward}><div><span className="eyebrow">ADD A WANT</span><h3>What sounds good after you show up?</h3></div><div className="vault-form"><input value={vaultName} onChange={e => setVaultName(e.target.value)} placeholder="e.g. Watch one episode" required/><select value={vaultHabit} onChange={e => setVaultHabit(e.target.value)} required><option value="">Choose the habit it unlocks</option>{habits.filter(h => h.kind === 'BUILD').map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select><input value={vaultDetail} onChange={e => setVaultDetail(e.target.value)} placeholder="A note to future you (optional)"/><button className="primary-button" type="submit"><Icon name="plus"/> Add to vault</button></div></form></>;
  }

  function renderTechniqueChooser(law: Law) {
    const options = techniques.filter(item => item.laws.includes(law) && item.modes.includes(habitType));
    const count = options.filter(item => techniqueIds.includes(item.id)).length;
    return <details className="strategy-disclosure" open={undefined}>
      <summary>Explore techniques <span>{count ? `${count} selected` : 'Optional'}</span></summary>
      <div className="strategy-list">{options.map(item => <article className={`technique-option ${techniqueIds.includes(item.id) ? 'technique-option-selected' : ''}`} key={item.id}>
        <label><input type="checkbox" checked={techniqueIds.includes(item.id)} onChange={() => toggleTechnique(item.id)}/><span><b>{item.name}</b><small>{item.description}</small></span></label>
        <button type="button" className="technique-info" aria-label={`Learn about ${item.name}`} title={`Learn about ${item.name}`} onClick={() => setInfoModal({ type: 'technique', id: item.id })}>i</button>
        {techniqueIds.includes(item.id) && <label className="technique-note">How will you use this? <span className="optional">OPTIONAL</span><textarea aria-label={`${law} setup for ${item.id}`} value={techniqueNoteFor(techniqueNotes, item.id, law)} onChange={e => setTechniqueNotes(current => ({ ...current, [item.id]: e.target.value, ...Object.fromEntries((techniqueMap[item.id]?.laws ?? []).filter(value => lawGroups.some(group => group.id === value)).map(value => [`${value}:${item.id}`, e.target.value])) }))} placeholder="Make it specific to your routine" rows={2}/></label>}
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
    return <><div className="page-heading-row"><div><div className="eyebrow">THE HABIT TOOLKIT</div><h1>Four laws. Many methods<span className="heading-period">.</span></h1><p className="page-subtitle">Browse the full set, then choose the methods that fit one behavior.</p></div></div>
      <div className="playbook-switch"><button className={playbookMode === 'BUILD' ? 'selected' : ''} onClick={() => setPlaybookMode('BUILD')}>Build a habit</button><button className={playbookMode === 'BREAK' ? 'selected' : ''} onClick={() => setPlaybookMode('BREAK')}>Break a habit</button></div>
      <div className="law-board">{lawGroups.map((law, index) => <article key={law.id} className="law-board-card"><span>0{index + 1}</span><div><b>{playbookMode === 'BUILD' ? law.build : law.break}</b><small>{law.prompt}</small></div></article>)}</div>
      {lawGroups.map((law, index) => <details className="law-techniques playbook-law" key={law.id}><summary><span className="law-number">0{index + 1}</span><span className="law-title"><b>{playbookMode === 'BUILD' ? law.build : law.break}</b><small>{law.prompt}</small></span><span className="law-count">{techniques.filter(item => item.laws.includes(law.id) && item.modes.includes(playbookMode)).length} methods</span></summary><div className="playbook-options">{techniques.filter(item => item.laws.includes(law.id) && item.modes.includes(playbookMode)).map(item => <article key={item.id}><b>{item.name}</b><p>{item.description}</p><small>Example: {item.example}</small></article>)}</div></details>)}
      <details className="law-techniques playbook-law"><summary><span className="law-number"><Icon name="spark" size={18}/></span><span className="law-title"><b>Foundations and advanced tactics</b><small>Optional methods that support the whole process</small></span><span className="law-count">{techniques.filter(item => item.laws.some(law => law === 'foundation' || law === 'advanced') && item.modes.includes(playbookMode)).length} methods</span></summary><div className="playbook-options">{techniques.filter(item => item.laws.some(law => law === 'foundation' || law === 'advanced') && item.modes.includes(playbookMode)).map(item => <article key={item.id}><b>{item.name}</b><p>{item.description}</p><small>Example: {item.example}</small></article>)}</div></details>
    </>;
  }

  function renderAntiHabit() {
    const anti = habits.filter(h => h.kind === 'BREAK');
    const lastWeek = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return <><div className="page-heading-row"><div><div className="eyebrow">THE FOUR ANTI LAWS</div><h1>Break the loop<span className="heading-period">.</span></h1><p className="page-subtitle">Make the cue invisible, the routine unattractive, the response difficult, and the reward unsatisfying.</p></div><button className="primary-button" onClick={() => startNewHabit('BREAK')}><Icon name="plus"/> Change a habit</button></div>
      <div className="law-board law-board-break">{lawGroups.map((law, index) => <article key={law.id} className="law-board-card"><span>0{index + 1}</span><div><b>{law.break}</b><small>{law.prompt}</small></div></article>)}</div>
      {anti.length ? <div className="anti-list">{anti.map(h => {
        const events = habitEvents.filter(event => event.habitId === h.id);
        const weekEvents = events.filter(event => new Date(event.at).getTime() >= lastWeek);
        const urgesPassedThisWeek = weekEvents.filter(event => event.type === 'URGE_PASSED').length;
        const replacementsThisWeek = weekEvents.filter(event => event.type === 'REPLACEMENT_USED').length;
        const oldThisWeek = weekEvents.filter(event => event.type === 'OLD_HABIT').length;
        const weeklyReduction = typeof h.baselineDaily === 'number' && h.baselineDaily > 0 ? Math.max(0, Math.round((1 - oldThisWeek / (h.baselineDaily * 7)) * 100)) : null;
        return <article className="anti-card" key={h.id}><div className="anti-card-top"><div className="anti-card-icon"><Icon name="spark"/></div><div><span className="eyebrow">BEHAVIOR YOU’RE CHANGING</span><h3>{h.name}</h3></div>{renderHabitActions(h)}<span className="shield-badge">{h.techniqueIds?.length ?? 0} strategies</span></div>
          <div className="anti-stats"><div><b>{urgesPassedThisWeek}</b><span>urges passed this week</span></div><div><b>{replacementsThisWeek}</b><span>replacement actions</span></div><div><b>{oldThisWeek}</b><span>old routine episodes</span></div>{weeklyReduction !== null && <div><b>{weeklyReduction}%</b><span>below baseline</span></div>}</div><p className="anti-review">Use this seven day pattern to keep the methods that helped or adjust one of the four law levers.</p>
          <div className="anti-steps">{lawGroups.map((law, index) => {
            const selected = (h.techniqueIds ?? []).map(id => techniqueMap[id]).filter(item => item?.laws.includes(law.id));
            const custom = law.id === 'cue' ? h.hideCue : law.id === 'craving' ? h.aversionReminder : law.id === 'response' ? h.friction : h.contract;
            return <div key={law.id}><span>0{index + 1} · {law.break.toUpperCase()}</span><p>{selected.length ? selected.map((item, itemIndex) => <span key={item.id} id={item.laws[0] === law.id ? `anti-technique-${h.id}-${item.id}` : undefined} tabIndex={item.laws[0] === law.id ? -1 : undefined}>{item.name}{itemIndex < selected.length - 1 ? ', ' : ''}</span>) : custom || 'Choose a method when you’re ready to expand this plan.'}</p>{selected.map(item => (h.techniqueNotes?.[`${law.id}:${item.id}`] ?? h.techniqueNotes?.[item.id]) && <small key={item.id}>{h.techniqueNotes?.[`${law.id}:${item.id}`] ?? h.techniqueNotes?.[item.id]}</small>)}</div>;
          })}</div>
          <div className="replacement-plan"><span className="eyebrow">WHEN THE URGE SHOWS UP</span><p>{h.alternativeRoutine || h.gateway || 'Choose a small replacement action that meets the same need.'}</p>{h.cue && <small>Your cue: {h.cueType === 'STACK' ? `After ${h.cue}` : `${h.time || h.cue}${h.location ? ` · ${h.location}` : ''}`}</small>}</div>
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
    return <><div className="page-heading-row"><div><div className="eyebrow">NOTICE BEFORE YOU CHANGE</div><h1>Your habit scorecard<span className="heading-period">.</span></h1><p className="page-subtitle">A curious snapshot of the routines already shaping your day.</p></div><button className="primary-button" onClick={() => { setDiagnosticOpen(true); setDiagnosticStep(0); }}><Icon name="plus"/> Diagnose a routine</button></div><div className="scorecard-hero"><span className="scorecard-mark"><Icon name="spark" size={24}/></span><div><span className="overline">IDENTITY CHECK IN</span><h2>What does today’s routine say about who you’re becoming?</h2><p>Grade each behavior in relation to your chosen identity: helpful, harmful, or neutral. There’s no judgment in the inventory.</p></div><div className="scorecard-totals"><b>{scorecard.length}</b><small>behaviors noticed</small></div></div><form className="scorecard-add" onSubmit={addScorecardEntry}><label className="field-label">ADD A BEHAVIOR YOU ALREADY DO<input value={scorecardDraft} onChange={e => setScorecardDraft(e.target.value)} placeholder="e.g. Check my phone before getting out of bed"/></label><button className="primary-button" type="submit"><Icon name="plus"/> Add behavior</button></form><div className="scorecard-summary"><span><b className="rating-positive">+ {positive}</b> supports my identity</span><span><b className="rating-negative">− {negative}</b> pulls me away</span><span><b>{scorecard.length - positive - negative}</b> neutral so far</span></div><div className="scorecard-list">{scorecard.length ? scorecard.map(entry => <article className="scorecard-row" key={entry.id}><span className={`rating-symbol rating-${entry.rating === '+' ? 'positive' : entry.rating === '-' ? 'negative' : 'neutral'}`}>{entry.rating}</span><b>{entry.behavior}</b><div className="rating-controls" aria-label={`Grade ${entry.behavior}`}>{(['+', '=', '-'] as const).map(rating => <button key={rating} type="button" className={entry.rating === rating ? 'rating-selected' : ''} onClick={() => rateScorecard(entry.id, rating)}>{rating === '+' ? 'Helpful' : rating === '-' ? 'Harmful' : 'Neutral'}</button>)}</div></article>) : <div className="empty-card"><div className="empty-flower"><Icon name="spark" size={24}/></div><h3>Begin with one thing you notice.</h3><p>Think through a normal morning, afternoon, or evening. Add the behavior, then grade it gently.</p></div>}</div>{diagnostics.length > 0 && <><div className="section-heading space-top"><div><span className="eyebrow">FOUR STEP LOOP ANALYSIS</span><h2>Routine diagnostics <span className="soft-count">{diagnostics.length}</span></h2></div></div><div className="diagnostic-list">{diagnostics.map(item => <article className="diagnostic-card" key={item.id}><span className="eyebrow">ROUTINE</span><h3>{item.routine}</h3><p><b>Craving:</b> {item.craving} · <b>Reward experiment:</b> {item.rewardExperiment}</p><p><b>Cue:</b> {[item.cueTime, item.cueLocation, item.cueEmotion, item.cuePeople].filter(Boolean).join(' · ') || 'Not isolated yet'}</p><p><b>Plan:</b> {item.plan}</p></article>)}</div></> }</>;
  }

  function renderCommunity() {
    return <><div className="page-heading-row"><div><div className="eyebrow">MAKE IT NORMAL TO SHOW UP</div><h1>Find your people<span className="heading-period">.</span></h1><p className="page-subtitle">Join a small tribe where the behavior you want is part of the culture.</p></div></div><div className="community-hero"><span className="community-orbit"><Icon name="spark" size={18}/></span><div><span className="overline">CULTURE BEATS WILLPOWER</span><h2>Spend time with people who already live the way you want to live.</h2><p>Pick a circle that matches the identity you’re practicing. Membership syncs to your Habitly account when connected.</p></div></div><div className="tribe-grid">{communityCircles.map((tribe, index) => { const joined = joinedTribes.includes(tribe.id); return <article className="tribe-card" key={tribe.id}><div className={`tribe-art tribe-art-${index % 3 + 1}`}><Icon name={['arrow-up-right','grid','spark'][index % 3]} size={30}/></div><span className="eyebrow">{tribe.category.toUpperCase()}</span><h3>{tribe.name}</h3><p>{tribe.detail}</p><div className="tribe-card-foot"><span>{tribe.members + (joined ? 1 : 0)} people</span><button className={joined ? 'secondary-button' : 'primary-button'} onClick={() => void toggleCircle(tribe, joined)}>{joined ? 'Joined' : 'Join circle'}</button></div></article>; })}</div><form className="circle-create-form" onSubmit={createCircle}><div><span className="eyebrow">START A CULTURE</span><h3>Create an identity circle</h3></div><input value={circleName} onChange={e => setCircleName(e.target.value)} placeholder="Circle name" required/><input value={circleIdentity} onChange={e => setCircleIdentity(e.target.value)} placeholder="Identity, e.g. The Runners" required/><input value={circleDescription} onChange={e => setCircleDescription(e.target.value)} placeholder="What do members practice together?" required/><button className="primary-button" type="submit"><Icon name="plus"/> Create circle</button></form></>;
  }

  function renderSettings() {
    return <><div className="page-heading-row"><div><div className="eyebrow">YOUR SPACE, YOUR RULES</div><h1>Settings<span className="heading-period">.</span></h1><p className="page-subtitle">Manage your workspace and optional features.</p></div></div><section className="settings-card appearance-settings"><div className="appearance-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2>Appearance</h2><p>Choose a color mood and switch between light, dark, or a softer look.</p></div></div><div className="appearance-mode" role="group" aria-label="Display mode">{([{ id: false, name: 'Light', icon: 'sun' }, { id: true, name: 'Dark', icon: 'moon' }] as const).map(mode => <button type="button" key={mode.name} className={darkMode === mode.id ? 'appearance-mode-option selected' : 'appearance-mode-option'} aria-pressed={darkMode === mode.id} onClick={() => setDarkMode(mode.id)}><Icon name={mode.icon} size={17}/>{mode.name}</button>)}</div><div className="palette-heading"><b>Color themes</b><span>{palettes.find(option => option.id === palette)?.name}</span></div><div className="palette-options" role="group" aria-label="Color theme">{palettes.map(option => <button type="button" key={option.id} className={palette === option.id ? 'palette-option selected' : 'palette-option'} aria-pressed={palette === option.id} onClick={() => setPalette(option.id)}><span className="palette-swatches" aria-hidden="true">{option.colors.map(color => <i key={color} style={{ backgroundColor: color }}/>)}</span><span>{option.name}</span></button>)}</div></section><section className="settings-card"><label><input type="checkbox" checked={labs} onChange={e => setLabs(e.target.checked)}/> Experimental features</label><p>Enable optional Telegram linking.</p></section><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Icon name="leaf"/></div><div><span className="eyebrow">HABITLY API</span><h2>Connect your data</h2><p>Create or sign in to an account to sync your habits across browsers and devices.</p></div><span className={`connection-badge ${workspaceReady && !connectionError ? 'connected' : ''}`}><i/>{connectionError ? 'Connection issue' : workspaceReady ? 'Synced account' : remoteUserId ? 'Import needed' : 'Local workspace'}</span></div><div className="settings-fields"><label className="field-label">API BASE URL<input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://your-api.example.com"/></label><label className="field-label">EMAIL<input value={accountEmail} onChange={e => setAccountEmail(e.target.value)} placeholder="you@example.com" type="email" autoComplete="username"/></label><label className="field-label">PASSWORD<input value={accountPassword} onChange={e => setAccountPassword(e.target.value)} placeholder="At least 10 characters" type="password" autoComplete={connectionMode === 'create' ? 'new-password' : 'current-password'}/></label><div className="settings-actions"><button className="primary-button" disabled={settingsBusy || !apiUrl} onClick={setupAccount}>{settingsBusy ? 'Connecting…' : connectionMode === 'create' ? 'Create account' : 'Sign in'} <Icon name="arrow" size={15}/></button><button className="text-button" type="button" onClick={() => setConnectionMode(connectionMode === 'create' ? 'login' : 'create')}>{connectionMode === 'create' ? 'I already have an account' : 'Create a new account'}</button>{remoteUserId && <span className="settings-id">Account {remoteUserId.slice(0, 8)}…</span>}</div>{remoteToken && !serverHasWorkspace && <div className="import-panel"><p>Your server account has no saved workspace. Import habits and related data from this browser. Sample habits are excluded. Your local copy will remain in this browser until the server confirms the import.</p><button className="secondary-button" type="button" onClick={() => void importLocalWorkspace()}>Import this browser’s data</button><label className="text-button">Restore from backup<input type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { await importLocalWorkspace(JSON.parse(await file.text())); } catch { setConnectionError("That backup file could not be read as Habitly JSON. The original file is unchanged."); } event.currentTarget.value = ""; }}/></label><a className="text-button" href={localBackupHref()} download="habitly-local-backup.json">Download local backup</a></div>}</div></section>{labs && <section className="settings-card telegram-settings"><div className="settings-card-head"><div className="telegram-icon"><Icon name="send" size={20}/></div><div><span className="eyebrow">HABIT CHANGER BOT</span><h2>Log from Telegram</h2><p>Link a private chat, then text “done” with the habit name.</p></div><span className={`connection-badge ${telegramCommand ? 'connected' : ''}`}><i/>{telegramCommand ? 'Link ready' : 'Not linked'}</span></div><div className="telegram-steps"><div><b>01</b><span>Configure <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_WEBHOOK_SECRET</code> on the API.</span></div><div><b>02</b><span>Generate a one-time link command below, then send it to your bot.</span></div><div><b>03</b><span>Send “done Read one page” to log a habit and get your resilient streak.</span></div></div><div className="settings-actions"><button className="secondary-button" disabled={settingsBusy || !remoteUserId} onClick={connectTelegram}>Generate Telegram link <Icon name="arrow" size={14}/></button>{telegramCommand && <code className="telegram-command">{telegramCommand}</code>}</div></section>}<section className="settings-card settings-privacy"><div><span className="eyebrow">YOUR DATA</span><h2>Identity is a practice, not a performance.</h2><p>Demo habits are sample data. User habits and workspace records sync to your authenticated Habitly account when connected. Offline edits stay on this device until you reconnect and are never presented as server saved.</p></div></section></>;
  }

  function renderPage() {
    if (active === 'Logging') return renderLogging();
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
      <div className="sidebar-caption">YOUR SPACE</div>
      <nav className="side-nav">{nav.map(item => <button key={item.title} className={`nav-item ${active === item.title ? 'nav-active' : ''}`} onClick={() => { setActive(item.title); setMobileNav(false); }}><Icon name={item.icon}/><span>{item.title === 'Recovery' ? 'History' : item.title === 'My habits' ? 'Habits' : item.title === 'Habit scorecard' ? 'Scorecard' : item.title === 'Reward vault' ? 'Rewards' : item.title}</span>{item.title === 'Recovery' && needRecovery && <i className="nav-alert"/>}{item.title === 'Reward vault' && unlockedRewards.length > 0 && <i className="nav-unlocked"/>}</button>)}</nav>
      <button className="sidebar-new" onClick={() => { setMobileNav(false); startNewHabit('BUILD'); }}><span><Icon name="plus" size={17}/></span><span>Build a habit</span><kbd>⌘ K</kbd></button>
      <div className="sidebar-bottom"><button className="identity-link" onClick={() => { setMobileNav(false); setShowIdentity(true); }}>Edit identity</button></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label={mobileNav ? "Close navigation" : "Open navigation"} aria-expanded={mobileNav} aria-controls="main-navigation"><Icon name={mobileNav ? 'x' : 'menu'}/></button><div className="breadcrumb"><button type="button" className="breadcrumb-home" aria-label="Go to Habitly home" onClick={() => { setActive('Today'); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Habitly</button><span className="crumb-slash">/</span><b>{active}</b></div><div className="topbar-right"><button className="theme-toggle" onClick={() => setDarkMode(value => !value)} aria-label={`Switch to ${darkMode ? 'light' : 'dark'} theme`} title={`Switch to ${darkMode ? 'light' : 'dark'} theme`}><Icon name={darkMode ? 'sun' : 'moon'} size={16}/></button><button className="theme-toggle" onClick={refreshApp} aria-label="Refresh app" title="Refresh app"><Icon name="refresh" size={16}/></button></div></header>
      <div className="content-wrap">{connectionError && <div className="connection-error" role="alert">{connectionError} <a href={localBackupHref()} download="habitly-local-backup.json">Download local backup</a></div>}{accountabilityInvite && <section className="accountability-invite-banner"><div><span className="eyebrow">ACCOUNTABILITY INVITATION</span><h2>{accountabilityInvite.partner_name || accountabilityInvite.partner_email} was asked to support a habit</h2><p><b>{accountabilityInvite.habit}</b><br/>{accountabilityInvite.agreement} · Commitment: {accountabilityInvite.consequence}</p><small>Recent activity: {(accountabilityInvite.recent_activity ?? []).map((log: any) => `${log.date} ${log.status.toLowerCase()}`).join(' · ') || 'No check-ins logged yet'}</small></div>{accountabilityInvite.status === 'ACCEPTED' ? <span className="connection-badge connected">Accepted</span> : <button className="primary-button" onClick={() => void acceptAccountabilityInvite()}>Accept invitation</button>}</section>}{renderPage()}</div>
      <footer className="main-footer"><span>Made of small things.</span><span>Consistency over intensity <i><Icon name="spark" size={15}/></i></span></footer>
    </main>

    {hydrated && createPortal(<>
    {habitToDelete && <div className="modal-backdrop delete-habit-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !deletingHabit) setHabitToDelete(null); }}><section className="identity-modal delete-habit-modal" role="dialog" aria-modal="true" aria-labelledby="delete-habit-title"><h2 id="delete-habit-title">Delete this habit?</h2><p>“{habitToDelete.name}” will be removed from your active habits. Past activity is retained.</p><div className="delete-habit-actions"><button type="button" className="secondary-button" disabled={deletingHabit} onClick={() => setHabitToDelete(null)}>Cancel</button><button type="button" className="delete-confirm-button" disabled={deletingHabit} onClick={() => void deleteHabit(habitToDelete)}>{deletingHabit ? 'Deleting…' : 'Delete habit'}</button></div></section></div>}

    {showBuilder && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowBuilder(false); }}><section className="builder-modal habit-builder" role="dialog" aria-modal="true" aria-labelledby="builder-title">
      <header className="modal-header"><div><span className="eyebrow">YOUR HABIT PLAN</span><h2 id="builder-title">{editingHabitId ? 'Edit your plan' : habitType === 'BREAK' ? 'Change a habit' : 'Build a habit'}</h2><p>Name the habit, pick a starter action, and choose a cue. You can add more details later.</p></div><button type="button" className="modal-close" onClick={() => setShowBuilder(false)} aria-label="Close builder"><Icon name="x"/></button></header>
      <div className="builder-form"><div className="basics-page">
        {!editingHabitId && <div className="form-kind-tabs"><button type="button" className={habitType === 'BUILD' ? 'selected' : ''} onClick={() => { setHabitType('BUILD'); setGatewayMinutes(2); setCueType('STACK'); setTechniqueIds([]); setTechniqueNotes({}); }}>Build a habit</button><button type="button" className={habitType === 'BREAK' ? 'selected' : ''} onClick={() => { setHabitType('BREAK'); setGatewayMinutes(0); setCueType('STACK'); setTechniqueIds([]); setTechniqueNotes({}); }}>Break a habit</button></div>}
        <label className="field-label">{habitType === 'BUILD' ? 'What do you want to do?' : 'What habit do you want to change?'}<input value={targetAction} onChange={e => setTargetAction(e.target.value)} placeholder={habitType === 'BUILD' ? 'e.g. Run three miles' : 'e.g. Scroll social media in bed'} required/></label>
        {habitType === 'BREAK' && <label className="field-label">How often does it happen now? <span className="optional">OPTIONAL ESTIMATE PER DAY</span><input type="number" min="0" max="1000" value={baselineDaily} onChange={e => setBaselineDaily(e.target.value)}/></label>}
<label className="field-label">{habitType === 'BUILD' ? 'Starter action (optional)' : 'What better action can you switch to?'}<input value={gatewayAction} onChange={e => setGatewayAction(e.target.value)} placeholder={habitType === 'BUILD' ? (targetAction ? suggestStarter(targetAction) : 'Optional. We can suggest a starter for you.') : 'Choose a replacement action'} required={habitType === 'BREAK'}/></label>{habitType === 'BUILD' && targetAction && <p className="form-note">Starter idea: {suggestStarter(targetAction)}. Leave the field blank to use it.</p>}      </div><div className="laws-page">
        <section className="builder-law" data-law="cue"><div className="builder-law-heading"><span className="builder-law-index"><Icon name="clock" size={16}/></span><div><small>SET THE MOMENT</small><h3>{habitType === 'BUILD' ? 'When will you start?' : 'What usually triggers it?'}</h3></div></div><div className="law-fields">        <div className="field-label">{habitType === 'BUILD' ? 'Choose a cue for your routine' : 'Notice the cue that starts the old routine'}<div className="cue-tabs" role="group" aria-label="Choose a cue type"><button type="button" aria-pressed={cueType === 'STACK'} className={cueType === 'STACK' ? 'cue-tab-selected' : ''} onClick={() => setCueType('STACK')}>After a routine or cue</button><button type="button" aria-pressed={cueType === 'TIME_LOCATION'} className={cueType === 'TIME_LOCATION' ? 'cue-tab-selected' : ''} onClick={() => setCueType('TIME_LOCATION')}>At a time and place</button></div></div>
        {cueType === 'TIME_LOCATION' ? <div className="field-two"><label className="field-label">Time<input type="text" inputMode="text" value={time} onChange={e => setTime(e.target.value)} placeholder="e.g. 7:30 AM" required={habitType === 'BUILD'}/></label><label className="field-label">Location<input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. at my desk" required={habitType === 'BUILD'}/></label></div> : <label className="field-label">{habitType === 'BUILD' ? 'After this existing habit' : 'When this cue appears'}<input value={cue} onChange={e => setCue(e.target.value)} placeholder={habitType === 'BUILD' ? 'e.g. I pour my coffee' : 'e.g. I feel bored in bed'} required={habitType === 'BUILD'}/></label>}

</div></section><section className="law-picker" aria-label="Choose habit laws to apply">
        <div className="law-picker-heading"><b>Choose which laws to apply</b><p>{habitType === 'BREAK' ? 'Open any laws you want to work on, then choose at least one strategy. You can keep multiple open.' : 'Your cue is already part of every plan. Open any law for extra details or strategies. You can keep multiple open.'}</p></div>
        <details className="law-choice"><summary><span className="law-choice-index">01</span><span className="law-choice-label"><b>Cue</b><small>{lawGroups[0][habitType === 'BUILD' ? 'build' : 'break']}</small></span></summary><div className="law-choice-body">{habitType === 'BUILD' ? <label className="field-label">Prepare your environment <span className="optional">OPTIONAL</span><input value={prepStep} onChange={e => setPrepStep(e.target.value)} placeholder="e.g. leave my book on the pillow"/></label> : <label className="field-label">Cue to hide <span className="optional">OPTIONAL</span><input value={hideCue} onChange={e => setHideCue(e.target.value)} placeholder="What can you remove from view?"/></label>}<button type="button" className="text-button" onClick={() => setInfoModal({ type: 'law', law: lawGroups[0].id })}>Learn about this law</button>{renderTechniqueChooser(lawGroups[0].id)}</div></details>
        <details className="law-choice"><summary><span className="law-choice-index">02</span><span className="law-choice-label"><b>Craving</b><small>{lawGroups[1][habitType === 'BUILD' ? 'build' : 'break']}</small></span></summary><div className="law-choice-body">
        <section className="builder-law" data-law="craving"><div className="law-choice-info-row"><span>{lawGroups[1].prompt}</span><button type="button" className="law-info" aria-label={`Learn about ${habitType === 'BUILD' ? lawGroups[1].build : lawGroups[1].break}`} title="Learn about this law" onClick={() => setInfoModal({ type: 'law', law: lawGroups[1].id })}>i</button></div><div className="law-fields"><label className="field-label">{habitType === 'BUILD' ? <>Why do you want this? <span className="optional">OPTIONAL</span></> : 'What need does the old habit meet?'}<input value={motive} onChange={e => setMotive(e.target.value)} placeholder="The feeling or motivation underneath"/></label>{habitType === 'BUILD' ? <><label className="field-label">Motivation ritual <span className="optional">OPTIONAL</span><input value={ritual} onChange={e => setRitual(e.target.value)} placeholder="e.g. play a favorite song before starting"/></label><label className="field-label">Temptation bundle <span className="optional">OPTIONAL</span><input value={bundle} onChange={e => setBundle(e.target.value)} placeholder="Something enjoyable to pair with your habit"/></label></> : <label className="field-label">Reframe the old routine <span className="optional">OPTIONAL</span><input value={aversionReminder} onChange={e => setAversionReminder(e.target.value)} placeholder="What benefit will changing this bring?"/></label>}</div>{renderTechniqueChooser(lawGroups[1].id)}</section></div></details>
        <details className="law-choice"><summary><span className="law-choice-index">03</span><span className="law-choice-label"><b>Response</b><small>{lawGroups[2][habitType === 'BUILD' ? 'build' : 'break']}</small></span></summary><div className="law-choice-body"><section className="builder-law" data-law="response"><div className="law-choice-info-row"><span>{lawGroups[2].prompt}</span><button type="button" className="law-info" aria-label={`Learn about ${habitType === 'BUILD' ? lawGroups[2].build : lawGroups[2].break}`} title="Learn about this law" onClick={() => setInfoModal({ type: 'law', law: lawGroups[2].id })}>i</button></div><div className="law-fields">{habitType === 'BUILD' ? <><label className="field-label">Two-minute rule target <span className="optional">MINUTES</span><input type="number" min="1" max="1440" step="1" value={gatewayMinutes || ''} onChange={e => setGatewayMinutes(e.target.value === '' ? 0 : Number(e.target.value))} placeholder="2"/></label><p className="duration-hint">Choose your starter length. Log each session and increase the target when you’re ready.</p><label className="field-label">Progression steps <span className="optional">OPTIONAL, ONE PER LINE</span><textarea value={milestoneDraft} onChange={e => setMilestoneDraft(e.target.value)} rows={3} placeholder={'Meditate for 5 minutes\nMeditate for 20 minutes'}/></label></> : <label className="field-label">Friction to add <span className="optional">OPTIONAL</span><input value={friction} onChange={e => setFriction(e.target.value)} placeholder="Make the old routine harder to start"/></label>}</div>{renderTechniqueChooser(lawGroups[2].id)}</section></div></details>
        <details className="law-choice"><summary><span className="law-choice-index">04</span><span className="law-choice-label"><b>Reward</b><small>{lawGroups[3][habitType === 'BUILD' ? 'build' : 'break']}</small></span></summary><div className="law-choice-body"><section className="builder-law" data-law="reward"><div className="law-choice-info-row"><span>{lawGroups[3].prompt}</span><button type="button" className="law-info" aria-label={`Learn about ${habitType === 'BUILD' ? lawGroups[3].build : lawGroups[3].break}`} title="Learn about this law" onClick={() => setInfoModal({ type: 'law', law: lawGroups[3].id })}>i</button></div><div className="law-fields"><label className="field-label">{habitType === 'BUILD' ? <>What immediate reward will make this satisfying? <span className="optional">OPTIONAL</span></> : 'What payoff does the old routine give you?'}<input value={reward} onChange={e => setReward(e.target.value)} placeholder={habitType === 'BUILD' ? 'A small immediate reward' : 'e.g. relief, entertainment, connection'}/></label><label className="field-label">Habit contract <span className="optional">OPTIONAL</span><input value={contract} onChange={e => setContract(e.target.value)} placeholder="The commitment you are making"/></label><div className="field-two"><label className="field-label">Accountability partner <span className="optional">OPTIONAL</span><input value={accountabilityPartner} onChange={e => setAccountabilityPartner(e.target.value)} placeholder="Someone you trust"/></label><label className="field-label">Partner email <span className="optional">OPTIONAL</span><input type="email" value={accountabilityEmail} onChange={e => setAccountabilityEmail(e.target.value)} placeholder="friend@example.com"/></label></div><label className="field-label">Agreed consequence <span className="optional">OPTIONAL</span><input value={accountabilityCost} onChange={e => setAccountabilityCost(e.target.value)} placeholder="A specific, agreed stake"/></label><p className="contract-safety-note">Keep any stake safe, affordable, and agreed with your partner.</p></div>{renderTechniqueChooser(lawGroups[3].id)}</section></div></details>
      </section></div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowBuilder(false)}>Cancel</button><button className="primary-button" type="button" onClick={e => { for (const field of Array.from(e.currentTarget.closest('.builder-form')?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[required], textarea[required]') ?? [])) if (!field.reportValidity()) return; void createHabit(); }}>{editingHabitId ? 'Save changes' : habitType === 'BREAK' ? 'Save change plan' : 'Add my habit'} <Icon name="arrow" size={16}/></button></div></div></section></div>}

    {infoModal && <div className="modal-backdrop info-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setInfoModal(null); }}>
      <section key={infoModal.type === 'law' ? `law-${infoModal.law}` : infoModal.type === 'technique' ? `technique-${infoModal.id}` : `suggested-${infoModal.index}`} className="builder-modal learning-modal" role="dialog" aria-modal="true" aria-labelledby="learning-title">
        <header className="modal-header"><div>
          <span className="eyebrow">{infoModal.type === 'law' ? 'FOUR LAWS GUIDE' : infoModal.type === 'technique' ? 'TECHNIQUE GUIDE' : 'ADDITIONAL NOTEBOOKLM IDEA'}</span>
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
    {diagnosticOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDiagnosticOpen(false); }}><section className="builder-modal diagnostic-modal" role="dialog" aria-modal="true" aria-labelledby="diagnostic-title"><header className="modal-header"><div><span className="eyebrow">ROUTINE DIAGNOSTIC · STEP {diagnosticStep + 1} OF 4</span><h2 id="diagnostic-title">Understand the loop</h2><p>Observe the behavior with curiosity before you try to change it.</p></div><button className="modal-close" onClick={() => setDiagnosticOpen(false)} aria-label="Close"><Icon name="x"/></button></header><form className="builder-form" onSubmit={saveDiagnostic}><div hidden={diagnosticStep !== 0} data-diagnostic-step="0"><label className="field-label">1. IDENTIFY THE ROUTINE<input value={diagnosticDraft.routine} onChange={e => setDiagnosticDraft(d => ({ ...d, routine: e.target.value }))} placeholder="What do you do, step by step?" required/></label><p className="form-note">Describe the action as it happens, without judging yourself.</p></div><div hidden={diagnosticStep !== 1} data-diagnostic-step="1"><label className="field-label">2. WHAT CRAVING MIGHT IT SATISFY?<input value={diagnosticDraft.craving} onChange={e => setDiagnosticDraft(d => ({ ...d, craving: e.target.value }))} placeholder="Relief, connection, stimulation, rest…" required/></label><label className="field-label">EXPERIMENT WITH THE REWARD<input value={diagnosticDraft.rewardExperiment} onChange={e => setDiagnosticDraft(d => ({ ...d, rewardExperiment: e.target.value }))} placeholder="What quick reward could meet that need?" required/></label></div><div hidden={diagnosticStep !== 2} data-diagnostic-step="2"><p className="form-note">3. ISOLATE THE CUE. What was happening just before the routine?</p><div className="field-two"><label className="field-label">TIME<input value={diagnosticDraft.cueTime} onChange={e => setDiagnosticDraft(d => ({ ...d, cueTime: e.target.value }))} placeholder="e.g. 3 PM"/></label><label className="field-label">LOCATION<input value={diagnosticDraft.cueLocation} onChange={e => setDiagnosticDraft(d => ({ ...d, cueLocation: e.target.value }))} placeholder="e.g. at my desk"/></label><label className="field-label">EMOTION<input value={diagnosticDraft.cueEmotion} onChange={e => setDiagnosticDraft(d => ({ ...d, cueEmotion: e.target.value }))} placeholder="e.g. bored or stressed"/></label><label className="field-label">PEOPLE<input value={diagnosticDraft.cuePeople} onChange={e => setDiagnosticDraft(d => ({ ...d, cuePeople: e.target.value }))} placeholder="Who was around?"/></label></div><p className="form-note">Leave any cue blank if you have not noticed it yet.</p></div><div hidden={diagnosticStep !== 3} data-diagnostic-step="3"><label className="field-label">4. MAKE A PLAN<input value={diagnosticDraft.plan} onChange={e => setDiagnosticDraft(d => ({ ...d, plan: e.target.value }))} placeholder="When I notice the cue, I’ll try…" required/></label><p className="form-note">Choose one small experiment for the next time the cue appears.</p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => diagnosticStep ? setDiagnosticStep(diagnosticStep - 1) : setDiagnosticOpen(false)}>{diagnosticStep ? 'Back' : 'Cancel'}</button>{diagnosticStep < 3 ? <button type="button" className="primary-button" onClick={e => { const section = e.currentTarget.closest('form')?.querySelector(`[data-diagnostic-step="${diagnosticStep}"]`); const fields = section?.querySelectorAll<HTMLInputElement>('input[required]'); for (const field of Array.from(fields ?? [])) if (!field.reportValidity()) return; setDiagnosticStep(diagnosticStep + 1); }}>Continue <Icon name="arrow" size={16}/></button> : <button className="primary-button" type="submit">Save diagnostic <Icon name="arrow" size={16}/></button>}</div></form></section></div>}
    {showIdentity && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowIdentity(false); }}><section className="identity-modal" role="dialog" aria-modal="true" aria-labelledby="identity-title"><button className="modal-close" onClick={() => setShowIdentity(false)} aria-label="Close"><Icon name="x"/></button><span className="identity-modal-star"><Icon name="spark" size={18}/></span><span className="eyebrow">IDENTITY BEFORE OUTCOME</span><h2 id="identity-title">Who do you want to become?</h2><p>An outcome tells you what you want. An identity gives you a direction to practice.</p><form onSubmit={saveIdentity}><label className="field-label">WHAT’S THE OUTCOME YOU’RE AFTER?<input value={goal} onChange={e => { setGoal(e.target.value); const reframe = reframeGoal(e.target.value); if (reframe) setIdentity(reframe); }} placeholder="e.g. write a book"/></label><div className="reframe-card"><span>TO MOVE TOWARD THAT, PRACTICE BEING…</span><input value={identity} onChange={e => setIdentity(e.target.value)} placeholder="e.g. The Writer"/><small>Every small action becomes a vote for this person.</small></div><button className="primary-button identity-save" type="submit">Save my identity <Icon name="arrow" size={16}/></button></form></section></div>}
    {celebrating && <div className="celebration-overlay" aria-hidden="true"><div className="celebration-spark"><Icon name="spark" size={18}/></div><div className="celebration-copy"><span>A VOTE CAST</span><b>That’s how you become<br/>{identity.toLowerCase()}.</b><small>One small action matters.</small></div><i className="confetti confetti-one"/><i className="confetti confetti-two"/><i className="confetti confetti-three"/><i className="confetti confetti-four"/><i className="confetti confetti-five"/><i className="confetti confetti-six"/></div>}
    {toast && <div className={`toast-message${toast === 'Your new habit plan is ready.' ? ' toast-habit-added' : ''}`} role="status"><span className="toast-star"><Icon name="spark" size={18}/></span>{toast}</div>}
    </>, document.body)}
  </div>;
}
