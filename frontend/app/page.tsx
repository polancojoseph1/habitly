'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import notebookLMContent from './notebooklm-content.json';
import { lawGroups, techniques, techniqueMap } from './techniques';
import type { ChangeMode, Law } from './techniques';

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
type Tab = 'Today' | 'My habits' | 'Habit scorecard' | 'Community' | 'Recovery' | 'Reward vault' | 'Habit to break' | 'Playbook' | 'Settings';
type Palette = 'lavender' | 'ocean' | 'rose' | 'amber' | 'sage';
const palettes: { id: Palette; name: string; colors: [string, string, string] }[] = [
  { id: 'lavender', name: 'Lavender', colors: ['#6256c8', '#b8adff', '#efedff'] },
  { id: 'ocean', name: 'Ocean', colors: ['#287c9b', '#77c2d5', '#e3f5f8'] },
  { id: 'rose', name: 'Rose', colors: ['#b65d78', '#ec9cab', '#fff0f2'] },
  { id: 'amber', name: 'Amber', colors: ['#a96b25', '#e3ad62', '#fff3dc'] },
  { id: 'sage', name: 'Sage', colors: ['#527e70', '#91b6a2', '#e6f2eb'] },
];

const STORAGE = 'habitly-workspace-v2';
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
  return habit.inviteLink?.startsWith('/?') && typeof window !== 'undefined'
    ? { ...habit, inviteLink: `${window.location.origin}${habit.inviteLink}` }
    : habit;
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
  { title: 'Today', icon: 'grid' }, { title: 'My habits', icon: 'leaf' },
  { title: 'Habit to break', icon: 'spark' }, { title: 'Recovery', icon: 'heart' }, { title: 'Habit scorecard', icon: 'check' },
  { title: 'Reward vault', icon: 'lock' }, { title: 'Community', icon: 'heart' },
  { title: 'Playbook', icon: 'spark' }, { title: 'Settings', icon: 'heart' },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></>,
    leaf: <><path d="M20.5 3.5C12 3.5 5 6.4 5 13a6 6 0 0 0 6 6c6.6 0 9.5-7 9.5-15.5Z"/><path d="M3.5 21c3.5-5.5 7-8.5 13-12"/></>,
    heart: <path d="M20.8 8.7c0 5.2-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.7a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3Z"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/><path d="M12 14v3"/></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    'arrow-up-right': <path d="M5 19 19 5M8 5h11v11"/>,
    'arrow-down-right': <path d="m5 5 14 14M8 19h11V8"/>,
    send: <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z"/><path d="M10 14 21 3"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    check: <path d="m5 12 4.2 4.2L19 6.5"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
    flame: <path d="M12 22a7 7 0 0 0 7-7c0-3.5-2-5.5-4-7-.3 2.2-1.5 3.3-2.5 3.7C12.5 8.5 11 5 8 2c.2 4.4-3 7.3-3 12a7 7 0 0 0 7 8Z"/>,
  };
  return <svg {...common} aria-hidden="true">{paths[name] ?? paths.spark}</svg>;
}

function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function weekDays() {
  const now = new Date(); const day = (now.getDay() + 6) % 7; const start = new Date(now); start.setDate(now.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), day: d.getDate(), today: d.toDateString() === now.toDateString(), date: todayKeyFromDate(d) }; });
}
function todayKeyFromDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
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
  const [history, setHistory] = useState<Record<string, string[]>>(demoHistory);
  const [habitEvents, setHabitEvents] = useState<HabitEvent[]>([]);
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const data = JSON.parse(saved);
        setHabitOrder(Array.isArray(data.habitOrder) ? data.habitOrder : []);
        const originalHabits: Habit[] = data.habits ?? demoHabits;
        const demoIds = new Set(demoHabits.map(habit => habit.id));
        const isSampleWorkspace = originalHabits.every(habit => habit.id.startsWith('demo-'));
        const savedById = new Map(originalHabits.map(habit => [habit.id, habit]));
        const savedHabits: Habit[] = isSampleWorkspace
          ? [...demoHabits.map(habit => ({ ...habit, ...savedById.get(habit.id) })), ...originalHabits.filter(habit => !demoIds.has(habit.id))]
          : originalHabits;
        const savedHistory: Record<string, string[]> = data.history ?? demoHistory();
        if (data.dayKey && data.dayKey !== todayKey()) {
          const missedIds = savedHistory[dayOffsetKey(-1)] ?? [];
          setHabits(savedHabits.map(h => ({ ...h, completed: false, missedYesterday: missedIds.includes(`missed:${h.id}`) })));
        } else setHabits(savedHabits);
        setHistory(savedHistory); setHabitEvents(data.habitEvents ?? []); setVariations(data.variations ?? []); setPreppedHabits(data.preppedHabits ?? {}); setRewards(data.rewards ?? demoRewards);
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
    if (!apiUrl && !process.env.NEXT_PUBLIC_API_URL) setApiUrl(window.location.origin);
    setHydrated(true);
  }, []);

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
    try { localStorage.setItem(STORAGE, JSON.stringify({ habits, habitOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, habitEvents, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, dayKey: todayKey(), apiUrl, accountEmail, remoteUserId, remoteIdentityId, remoteToken, telegramCommand })); } catch { setConnectionError('Browser storage is unavailable. Export your local data before continuing.'); }
  }, [hydrated, habits, habitOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, habitEvents, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, apiUrl, accountEmail, remoteUserId, remoteIdentityId, remoteToken, telegramCommand]);

  useEffect(() => {
    if (!hydrated || !workspaceReady || !apiUrl || !remoteToken) return;
    const payload = { habits, habitOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, habitEvents, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, telegramCommand, dayKey: todayKey() };
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/workspace`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: payload, expected_revision: workspaceRevision }) });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const saved = await response.json(); setWorkspaceRevision(saved.revision);
        setConnectionError('');
      } catch (error) { setConnectionError(error instanceof Error && error.message.includes('409') ? 'Another browser saved newer data. Reconnect to load the server copy before editing here. Your local backup is still available.' : 'Could not save to the server. Your device copy remains available; retry the connection before switching devices.'); }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [hydrated, workspaceReady, apiUrl, remoteToken, habits, habitOrder, rewards, identity, goal, votes, prepped, preppedHabits, history, habitEvents, variations, scorecard, joinedTribes, communityCircles, diagnostics, darkMode, palette, labs, telegramCommand, workspaceRevision]);

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
          setHistory(data.history ?? {}); setHabitEvents(data.habitEvents ?? []); setVariations(data.variations ?? []);
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
  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  function save() {
    setToast(remoteToken ? 'Changes are syncing to your Habitly account.' : 'Saved on this device. Connect an account to sync across browsers.');
  }

  async function importLocalWorkspace(backup?: any) {
    if (!apiUrl || !remoteToken) return;
    let local: any = {};
    try { local = backup ?? JSON.parse(localStorage.getItem(STORAGE) ?? '{}'); } catch { setConnectionError('Could not read this browser’s saved data. Export it from browser storage before retrying.'); return; }
    const payload = { habits: (local.habits ?? habits).filter((h: Habit) => !h.id.startsWith('demo-')), rewards: (local.rewards ?? rewards).filter((r: Reward) => !r.id.startsWith('reward-show') && !r.habitId.startsWith('demo-')), identity: local.identity ?? identity, goal: local.goal ?? goal, votes: local.votes ?? votes, prepped: local.prepped ?? prepped, preppedHabits: local.preppedHabits ?? preppedHabits, history: local.history ?? history, habitEvents: local.habitEvents ?? habitEvents, variations: local.variations ?? variations, scorecard: local.scorecard ?? scorecard, joinedTribes: local.joinedTribes ?? joinedTribes, communityCircles: local.communityCircles ?? communityCircles, diagnostics: local.diagnostics ?? diagnostics, darkMode: local.darkMode ?? darkMode, palette: local.palette ?? palette, labs: local.labs ?? labs, telegramCommand: local.telegramCommand ?? telegramCommand, dayKey: local.dayKey ?? todayKey() };
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/workspace/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remoteToken}` }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`Import failed (${response.status})`);
      const result = await response.json();
      if (!result.imported) throw new Error('Server data already exists. Reload the server copy before importing.');
      const inviteTokens = new Map((result.invites ?? []).map((invite: any) => [invite.habit_id, invite.token]));
      const importedHabits = payload.habits.map((habit: Habit) => { const token = inviteTokens.get(habit.id); return token ? { ...habit, inviteLink: `${window.location.origin}/?accountability=${token}` } : habit; });
      setHabits(importedHabits); setRewards(payload.rewards); setIdentity(payload.identity); setGoal(payload.goal); setVotes(payload.votes); setPrepped(payload.prepped); setPreppedHabits(payload.preppedHabits); setHistory(payload.history); setHabitEvents(payload.habitEvents); setVariations(payload.variations); setScorecard(payload.scorecard); setJoinedTribes(payload.joinedTribes); setCommunityCircles(payload.communityCircles); setDiagnostics(payload.diagnostics); setDarkMode(payload.darkMode); if (palettes.some(option => option.id === payload.palette)) setPalette(payload.palette); setLabs(payload.labs); setTelegramCommand(payload.telegramCommand);
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
        setIdentity(data.identity ?? currentIdentity.identity_statement); setGoal(data.goal ?? ''); setVotes(data.votes ?? currentIdentity.total_votes ?? 0); setPrepped(data.prepped ?? false); setPreppedHabits(data.preppedHabits ?? {}); setHistory(data.history ?? {}); setHabitEvents(data.habitEvents ?? []); setVariations(data.variations ?? []); setScorecard(data.scorecard ?? []); setJoinedTribes(data.joinedTribes ?? []); setCommunityCircles(data.communityCircles ?? []); setDiagnostics(data.diagnostics ?? []); setWorkspaceReady(true);
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
          <div className="today-quick-title"><h3>{habit.name}</h3>{!isBuild && <span className="today-choice-count">{helpfulChoices} helpful choice{helpfulChoices === 1 ? '' : 's'}</span>}{habit.missedYesterday && !habit.completed && <span className="recovery-pill">Recovery day</span>}</div>
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
      <details className="habit-plan-details"><summary>Plan details, check-ins & settings</summary>
        {habit.kind === 'BUILD' && <section className="duration-tracker" aria-label={`Practice minutes for ${habit.name}`}>
          <div className="duration-tracker-heading"><div><b>Practice minutes</b><p>Current starter target: {habit.gatewayMinutes || 2} minutes</p></div><span>{events.reduce((total, event) => total + (event.actualMinutes ?? 0), 0)} min tracked</span></div>
          <div className="duration-tracker-controls"><label>Minutes this session<input type="number" min="1" max="1440" step="1" value={durationDrafts[habit.id] ?? (habit.gatewayMinutes || 2)} onChange={e => setDurationDrafts(current => ({ ...current, [habit.id]: e.target.value === '' ? 0 : Number(e.target.value) }))}/></label><button type="button" className="secondary-button" onClick={() => logHabitMinutes(habit)}>Log session</button><label>Next target<input type="number" min="1" max="1440" step="1" value={targetDrafts[habit.id] ?? (habit.gatewayMinutes || 2)} onChange={e => setTargetDrafts(current => ({ ...current, [habit.id]: e.target.value === '' ? 0 : Number(e.target.value) }))}/></label><button type="button" className="text-button" onClick={() => { const target = targetDrafts[habit.id] ?? (habit.gatewayMinutes || 2); if (Number.isInteger(target) && target >= 1 && target <= 1440) void updateHabitDuration(habit, target); else setToast('Choose a target from 1 to 1,440 minutes.'); }}>Update target</button></div>
          <small>Start small, log what you actually did, and raise the target whenever you feel ready.</small>
        </section>}
        {renderHabitActions(habit)}
        {habit.motive && <p className="habit-why">Why it matters: {habit.motive}</p>}
        {habit.ritual && <p className="habit-ritual"><span>BEFORE YOU START</span> {habit.ritual}</p>}
        {!!habit.prep && <div className="prep-inline"><label><input type="checkbox" checked={!!preppedHabits[habit.id]} onChange={e => setHabitPrep(habit.id, e.target.checked)}/><span><b>Tonight's setup</b> · {habit.prep}</span></label><span className="prep-label">{preppedHabits[habit.id] ? 'Ready' : 'PREP'}</span></div>}
        <div className="habit-laws-inline">{lawGroups.map(law => { const detail = law.id === 'cue' ? cueLine : law.id === 'craving' ? habit.motive : law.id === 'response' ? habit.gateway : habit.reward; const selected = (habit.techniqueIds ?? []).map(id => techniqueMap[id]).filter(item => item?.laws.includes(law.id)); return <div key={law.id}><b>{habit.kind === 'BUILD' ? law.build : law.break}</b><p>{detail || 'Add a clear step for this law.'}</p>{selected.length > 0 && <small>{selected.map(item => [item.name, habit.techniqueNotes?.[`${law.id}:${item.id}`] ?? habit.techniqueNotes?.[item.id]].filter(Boolean).join(': ')).join('; ')}</small>}</div>; })}</div>
        {habit.kind === 'BUILD' && <div className="action-checkin"><p>“I did it” marks today complete. Record an extra check-in only for another action.</p><textarea aria-label={`Extra check-in note for ${habit.name}`} value={checkinNotes[habit.id] ?? ''} onChange={e => setCheckinNotes(current => ({ ...current, [habit.id]: e.target.value }))} placeholder="Optional note about the extra action" rows={2}/><button type="button" className="text-button" onClick={() => void recordHabitEvent(habit, 'ACTION_COMPLETED')}>Record an extra check-in</button></div>}
        <details className="build-variation-workspace"><summary>Test a plan variation <small>{habitVariations.length} saved</small></summary><p>Keep this plan and compare another cue, action, or reward.</p><div className="variation-fields"><select aria-label={`Variation law for ${habit.name}`} value={(variationDrafts[habit.id] ?? { law: 'cue' }).law} onChange={e => setVariationDrafts(current => ({ ...current, [habit.id]: { ...(current[habit.id] ?? { law: 'cue', name: '', techniqueId: '', setup: '' }), law: e.target.value as Law } }))}>{lawGroups.map(law => <option key={law.id} value={law.id}>{law.build}</option>)}</select><input aria-label={`Variation name for ${habit.name}`} placeholder="Name this alternative" value={variationDrafts[habit.id]?.name ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [habit.id]: { ...(current[habit.id] ?? { law: 'cue', name: '', techniqueId: '', setup: '' }), name: e.target.value } }))}/><textarea aria-label={`Variation setup for ${habit.name}`} placeholder="What will you try?" value={variationDrafts[habit.id]?.setup ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [habit.id]: { ...(current[habit.id] ?? { law: 'cue', name: '', techniqueId: '', setup: '' }), setup: e.target.value } }))}/><button type="button" className="secondary-button" onClick={() => void createVariation(habit)}>Save variation</button></div>{habitVariations.map(v => <div className="variation-row" key={v.id}><div className="variation-row-main"><div><b>{v.name}</b>{v.isActive && <span className="variation-active">Testing now</span>}<p>{lawGroups.find(law => law.id === v.law)?.build}: {v.setup}</p></div><button type="button" className="text-button" onClick={() => void updateVariation(v, { isActive: !v.isActive })}>{v.isActive ? 'Active' : 'Make active'}</button></div><div className="variation-outcome"><span>{v.triedAt ? `Tried ${new Date(v.triedAt).toLocaleDateString()}` : 'Not tried yet'}</span><label>Did it help?<select value={v.helped === true ? 'yes' : v.helped === false ? 'no' : ''} onChange={e => void updateVariation(v, { helped: e.target.value === '' ? null : e.target.value === 'yes' })}><option value="">Not rated</option><option value="yes">Yes</option><option value="no">Not yet</option></select></label></div></div>)}</details>
        <details className="event-history"><summary>Check-in history <small>{events.length}</small></summary>{events.length ? <ol>{events.slice(0, 30).map(event => <li key={event.id}><b>{event.type === 'ACTION_COMPLETED' ? 'Action completed' : event.type === 'URGE_PASSED' ? 'Urge passed' : event.type === 'REPLACEMENT_USED' ? 'Replacement used' : 'Old behavior'}</b><time>{new Date(event.at).toLocaleString()}</time>{event.actualMinutes && <small>{event.actualMinutes} minutes practiced</small>}{event.variationName && <small>Testing: {event.variationName}</small>}{event.strategy && !event.variationName && <small>Strategy: {event.strategy}</small>}{event.note && <p>{event.note}</p>}</li>)}</ol> : <p>No events yet. Your history will appear here.</p>}</details>
        {habit.milestones && habit.milestones.length > 1 && <div className="milestone-progress"><div><b>Habit shaping</b><span>Step {(habit.milestoneIndex ?? 0) + 1} of {habit.milestones.length}</span></div><p>{habit.milestones[habit.milestoneIndex ?? 0]}</p><div className="milestone-track"><i style={{ width: `${(((habit.milestoneIndex ?? 0) + 1) / habit.milestones.length) * 100}%` }}/></div>{(habit.milestoneIndex ?? 0) < habit.milestones.length - 1 && <button type="button" onClick={() => advanceMilestone(habit)}>Ready for the next step <Icon name="arrow" size={13}/></button>}</div>}
      </details>
    </article>;
  }

  function renderToday() {
    return <>
      <div className="page-heading-row today-page-heading"><div className="today-greeting"><div className="today-greeting-top"><div className="eyebrow">{currentDate}</div><button type="button" className="habit-arrange-button" aria-label={reorderingHabits ? 'Done arranging habits' : 'Arrange habits'} title={reorderingHabits ? 'Done arranging' : 'Arrange habits'} aria-pressed={reorderingHabits} onClick={() => setReorderingHabits(value => !value)}>{reorderingHabits ? <Icon name="check" size={18}/> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>}</button></div><h1>{greeting()}, Joseph<span className="heading-period">.</span></h1></div></div>
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
    return <><div className="page-heading-row"><div><div className="eyebrow">THE COMEBACK COUNTS</div><h1>History and recovery<span className="heading-period">.</span></h1><p className="page-subtitle">You never have to be perfect. Just return to the path.</p></div></div><section className="calendar-card"><div className="calendar-heading"><div><span className="eyebrow">PROGRESS YOU CAN SEE</span><h3>Last 28 days</h3></div><div className="calendar-legend"><span><i className="activity-done"/> Showed up</span><span><i className="activity-missed"/> Rest / miss</span></div></div><div className="activity-calendar">{recentDays.map(d => <div key={d.key} title={`${d.key}: ${d.done} votes, ${d.missed} missed`} className={`activity-cell ${d.done ? 'activity-done' : d.missed ? 'activity-missed' : ''}`}><span>{d.day}</span></div>)}</div></section>{needs.length > 0 && <div className={`recovery-hero ${circuitBreaker ? 'recovery-circuit-breaker' : ''}`}><div className="recovery-sun"><Icon name="arrow-up-right" size={24}/></div><span className="overline">{circuitBreaker ? 'CIRCUIT BREAKER · RESET THE ACTION, NOT YOUR IDENTITY' : 'NEVER MISS TWICE'}</span><h2>{circuitBreaker ? 'Two misses are a signal to shrink the next step.' : needs.length ? 'You missed a day. You still belong here.' : 'You’re back in rhythm.'}</h2><p>{circuitBreaker ? 'Make the next action almost impossible to skip. Choose the smallest gateway action and put the cue directly in your path. Your identity votes are still here.' : needs.length ? 'One missed day doesn’t erase the votes you’ve already cast. Choose the smallest version and begin again today.' : 'No recovery needed right now. Keep your next step small and your cues clear.'}</p><div className="recovery-stats"><div><b>{votes}</b><span>identity votes kept</span></div><div><b>{needs.filter(h => h.completed).length}/{needs.length || 0}</b><span>comeback actions</span></div><div><b>1 day</b><span>grace built in</span></div></div></div>}<div className="section-heading space-top"><div><span className="eyebrow">A GENTLE NUDGE</span><h2>{needs.length ? 'Pick one to restart' : 'Your habits today'}</h2></div></div><div className="habit-list">{(needs.length ? needs : todayHabits).map(renderHabitCard)}</div></>;
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
            return <div key={law.id}><span>0{index + 1} · {law.break.toUpperCase()}</span><p>{selected.length ? selected.map(item => item.name).join(', ') : custom || 'Choose a method when you’re ready to expand this plan.'}</p>{selected.map(item => (h.techniqueNotes?.[`${law.id}:${item.id}`] ?? h.techniqueNotes?.[item.id]) && <small key={item.id}>{h.techniqueNotes?.[`${law.id}:${item.id}`] ?? h.techniqueNotes?.[item.id]}</small>)}</div>;
          })}</div>
          <div className="replacement-plan"><span className="eyebrow">WHEN THE URGE SHOWS UP</span><p>{h.alternativeRoutine || h.gateway || 'Choose a small replacement action that meets the same need.'}</p>{h.cue && <small>Your cue: {h.cueType === 'STACK' ? `After ${h.cue}` : `${h.time || h.cue}${h.location ? ` · ${h.location}` : ''}`}</small>}</div>
          <div className="habit-checkin-workspace"><div className="checkin-controls"><label>What happened just now?<textarea value={checkinNotes[h.id] ?? ''} onChange={e => setCheckinNotes(current => ({ ...current, [h.id]: e.target.value }))} placeholder="Optional note about the moment" rows={2}/></label><div className="urge-actions"><span>Log an event</span><div><button type="button" onClick={() => void recordHabitEvent(h, 'URGE_PASSED')}>Urge passed</button><button type="button" onClick={() => void recordHabitEvent(h, 'REPLACEMENT_USED')}>Used replacement</button><button type="button" onClick={() => void recordHabitEvent(h, 'OLD_HABIT')}>Old behavior</button></div></div></div>
          <details className="variation-workspace" open={variations.some(v => v.habitId === h.id)}><summary>Try a variation <small>{variations.filter(v => v.habitId === h.id).length} saved</small></summary><div className="variation-create"><p>Your current plan stays in place. Save an alternative, then activate it when you want to try it.</p><div className="variation-fields"><select aria-label={`Variation law for ${h.name}`} value={(variationDrafts[h.id] ?? { law: 'response' }).law} onChange={e => setVariationDrafts(current => ({ ...current, [h.id]: { ...(current[h.id] ?? { law: 'response', name: '', techniqueId: '', setup: '' }), law: e.target.value as Law } }))}>{lawGroups.map(law => <option key={law.id} value={law.id}>{law.break}</option>)}</select><select aria-label={`Variation technique for ${h.name}`} value={variationDrafts[h.id]?.techniqueId ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [h.id]: { ...(current[h.id] ?? { law: 'response', name: '', techniqueId: '', setup: '' }), techniqueId: e.target.value } }))}><option value="">Custom setup</option>{techniques.filter(item => item.modes.includes('BREAK')).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label={`Variation name for ${h.name}`} placeholder="Name this alternative" value={variationDrafts[h.id]?.name ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [h.id]: { ...(current[h.id] ?? { law: 'response', name: '', techniqueId: '', setup: '' }), name: e.target.value } }))}/><textarea aria-label={`Variation setup for ${h.name}`} placeholder="What will you try?" value={variationDrafts[h.id]?.setup ?? ''} onChange={e => setVariationDrafts(current => ({ ...current, [h.id]: { ...(current[h.id] ?? { law: 'response', name: '', techniqueId: '', setup: '' }), setup: e.target.value } }))}/><button type="button" className="secondary-button" onClick={() => void createVariation(h)}>Save variation</button></div></div>{variations.filter(v => v.habitId === h.id).map(v => <article className="variation-row" key={v.id}><div className="variation-row-main"><div><b>{v.name}</b>{v.isActive && <span className="variation-active">Testing now</span>}<p>{lawGroups.find(law => law.id === v.law)?.break}: {v.setup}</p>{v.techniqueId && <small>{techniqueMap[v.techniqueId]?.name}</small>}</div><button type="button" className={v.isActive ? 'secondary-button' : 'text-button'} onClick={() => void updateVariation(v, { isActive: !v.isActive })}>{v.isActive ? 'Active' : 'Make active'}</button></div><div className="variation-outcome"><span>{v.triedAt ? `Tried ${new Date(v.triedAt).toLocaleDateString()}` : 'Not tried yet'}</span><label>Did it help?<select value={v.helped === true ? 'yes' : v.helped === false ? 'no' : ''} onChange={e => void updateVariation(v, { helped: e.target.value === '' ? null : e.target.value === 'yes' })}><option value="">Not rated</option><option value="yes">Yes</option><option value="no">Not yet</option></select></label><button type="button" className="text-button" onClick={async () => { setVariations(current => current.filter(item => item.id !== v.id)); if (apiUrl && remoteIdentityId && !h.id.startsWith('demo-')) await apiFetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${h.id}/variations/${v.id}`, { method: 'DELETE' }).catch(() => {}); }}>Remove</button></div>{v.outcomeNote && <p className="variation-note">{v.outcomeNote}</p>}</article>)}</details>
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
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label={mobileNav ? "Close navigation" : "Open navigation"} aria-expanded={mobileNav} aria-controls="main-navigation"><Icon name={mobileNav ? 'x' : 'menu'}/></button><div className="breadcrumb"><span>Habitly</span><span className="crumb-slash">/</span><b>{active}</b></div><div className="topbar-right"><button className="theme-toggle" onClick={() => setDarkMode(value => !value)} aria-label={`Switch to ${darkMode ? 'light' : 'dark'} theme`} title={`Switch to ${darkMode ? 'light' : 'dark'} theme`}><Icon name={darkMode ? 'sun' : 'moon'} size={16}/></button><button className="theme-toggle" onClick={() => window.location.reload()} aria-label="Refresh app" title="Refresh app"><Icon name="refresh" size={16}/></button></div></header>
      <div className="content-wrap">{connectionError && <div className="connection-error" role="alert">{connectionError} <a href={localBackupHref()} download="habitly-local-backup.json">Download local backup</a></div>}{accountabilityInvite && <section className="accountability-invite-banner"><div><span className="eyebrow">ACCOUNTABILITY INVITATION</span><h2>{accountabilityInvite.partner_name || accountabilityInvite.partner_email} was asked to support a habit</h2><p><b>{accountabilityInvite.habit}</b><br/>{accountabilityInvite.agreement} · Commitment: {accountabilityInvite.consequence}</p><small>Recent activity: {(accountabilityInvite.recent_activity ?? []).map((log: any) => `${log.date} ${log.status.toLowerCase()}`).join(' · ') || 'No check-ins logged yet'}</small></div>{accountabilityInvite.status === 'ACCEPTED' ? <span className="connection-badge connected">Accepted</span> : <button className="primary-button" onClick={() => void acceptAccountabilityInvite()}>Accept invitation</button>}</section>}{renderPage()}</div>
      <footer className="main-footer"><span>Made of small things.</span><span>Consistency over intensity <i><Icon name="spark" size={15}/></i></span></footer>
    </main>

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
      <section className="builder-modal learning-modal" role="dialog" aria-modal="true" aria-labelledby="learning-title">
        <header className="modal-header"><div>
          <span className="eyebrow">{infoModal.type === 'law' ? 'FOUR LAWS GUIDE' : infoModal.type === 'technique' ? 'TECHNIQUE GUIDE' : 'ADDITIONAL NOTEBOOKLM IDEA'}</span>
          <h2 id="learning-title">{infoModal.type === 'law' ? ((infoModal.mode ?? habitType) === 'BUILD' ? notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws]?.buildName : notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws]?.breakName) : infoModal.type === 'technique' ? techniqueMap[infoModal.id]?.name : notebookLMContent.suggestedTechniques[infoModal.index]?.name}</h2>
          <p>{infoModal.type === 'law' ? ((infoModal.mode ?? habitType) === 'BUILD' ? notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws]?.cardText : notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws]?.breakName) : infoModal.type === 'technique' ? techniqueMap[infoModal.id]?.description : notebookLMContent.suggestedTechniques[infoModal.index]?.assignment}</p>
        </div><button className="modal-close" onClick={() => setInfoModal(null)} aria-label="Close"><Icon name="x"/></button></header>
        {infoModal.type === 'law' && notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws] ? (() => { const guide = notebookLMContent.laws[infoModal.law as keyof typeof notebookLMContent.laws]; return <div className="learning-content">
          <h3>What this law means</h3><p>{(infoModal.mode ?? habitType) === 'BREAK' ? guide.breakGuidance : guide.explanation}</p>
          {(infoModal.mode ?? habitType) === 'BUILD' && <><h3>Practical steps</h3><ol>{guideList(guide.steps).map((step, index) => <li key={index}>{step}</li>)}</ol>
          <h3>Examples</h3><ul className="learning-example-list">{guideList(guide.examples).map((example, index) => <li key={index}>{example}</li>)}</ul>
          <div className="learning-inversion"><b>{guide.breakName}</b><p>{guide.breakGuidance}</p></div></>}
          <p className="learning-source">Source: <i>Atomic Habits</i>, {guide.source}</p>
        </div>; })() : infoModal.type === 'technique' && techniqueMap[infoModal.id] ? (() => { const item = techniqueMap[infoModal.id]; const guide = getNotebookTechnique(infoModal.id, infoModal.mode ?? habitType); const suggestedNames: Record<string, string> = { 'habits-scorecard': 'The Habits Scorecard', 'activity-zones': 'One Space', 'group-norms': 'Imitating the Close', 'active-practice': 'Action vs. Motion', 'goldilocks-rule': 'The Goldilocks Rule', 'paper-clips': 'The Paper Clip Strategy', 'nonscale-victories': 'Nonscale Victories Tracking' }; const suggestion = notebookLMContent.suggestedTechniques.find(entry => entry.name.includes(suggestedNames[infoModal.id] ?? '\u0000')); return <div className="learning-content">
          {guide?.cardText && <div className="learning-example"><b>Technique at a glance</b><p>{guide.cardText}</p></div>}
          <h3>How it works</h3><p>{guide?.explanation ?? suggestion?.rationale ?? item.description}</p>
          <h3>Practical steps</h3><ol>{guideList(guide?.steps ?? suggestion?.rationale ?? item.description).map((step, index) => <li key={index}>{step}</li>)}</ol>
          <h3>Examples for {(infoModal.mode ?? habitType) === 'BUILD' ? 'building a habit' : 'changing a habit'}</h3><ul className="learning-example-list">{(guide?.examples.length ? guide.examples : [item.example]).map((example, index) => <li key={index}>{example}</li>)}</ul>
          <h3>Related laws</h3><div className="learning-related-laws">{item.laws.filter(id => lawGroups.some(law => law.id === id)).map(id => <button type="button" key={id} onClick={() => setInfoModal({ type: 'law', law: id, mode: infoModal.mode })}>{(infoModal.mode ?? habitType) === 'BUILD' ? lawGroups.find(law => law.id === id)?.build : lawGroups.find(law => law.id === id)?.break} <Icon name="arrow-up-right" size={14}/></button>)}</div>
          {guide?.sources.length ? <p className="learning-source">Source: <i>Atomic Habits</i>, {guide.sources.join(' ')}</p> : suggestion ? <p className="learning-source">Source: <i>Atomic Habits</i>, {suggestion.source}</p> : <p className="learning-source">Example from Habitly’s technique guide.</p>}
        </div>; })() : infoModal.type === 'suggested' ? (() => { const idea = notebookLMContent.suggestedTechniques[infoModal.index]; return <div className="learning-content"><div className="learning-example"><b>Suggested placement</b><p>{idea.assignment}</p></div><h3>Why it fits</h3><p>{idea.rationale}</p><p className="learning-source">Source reference: <i>Atomic Habits</i>, {idea.source}</p></div>; })() : null}
      </section>
    </div>}
    {diagnosticOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDiagnosticOpen(false); }}><section className="builder-modal diagnostic-modal" role="dialog" aria-modal="true" aria-labelledby="diagnostic-title"><header className="modal-header"><div><span className="eyebrow">ROUTINE DIAGNOSTIC · STEP {diagnosticStep + 1} OF 4</span><h2 id="diagnostic-title">Understand the loop</h2><p>Observe the behavior with curiosity before you try to change it.</p></div><button className="modal-close" onClick={() => setDiagnosticOpen(false)} aria-label="Close"><Icon name="x"/></button></header><form className="builder-form" onSubmit={saveDiagnostic}><div hidden={diagnosticStep !== 0} data-diagnostic-step="0"><label className="field-label">1. IDENTIFY THE ROUTINE<input value={diagnosticDraft.routine} onChange={e => setDiagnosticDraft(d => ({ ...d, routine: e.target.value }))} placeholder="What do you do, step by step?" required/></label><p className="form-note">Describe the action as it happens, without judging yourself.</p></div><div hidden={diagnosticStep !== 1} data-diagnostic-step="1"><label className="field-label">2. WHAT CRAVING MIGHT IT SATISFY?<input value={diagnosticDraft.craving} onChange={e => setDiagnosticDraft(d => ({ ...d, craving: e.target.value }))} placeholder="Relief, connection, stimulation, rest…" required/></label><label className="field-label">EXPERIMENT WITH THE REWARD<input value={diagnosticDraft.rewardExperiment} onChange={e => setDiagnosticDraft(d => ({ ...d, rewardExperiment: e.target.value }))} placeholder="What quick reward could meet that need?" required/></label></div><div hidden={diagnosticStep !== 2} data-diagnostic-step="2"><p className="form-note">3. ISOLATE THE CUE. What was happening just before the routine?</p><div className="field-two"><label className="field-label">TIME<input value={diagnosticDraft.cueTime} onChange={e => setDiagnosticDraft(d => ({ ...d, cueTime: e.target.value }))} placeholder="e.g. 3 PM"/></label><label className="field-label">LOCATION<input value={diagnosticDraft.cueLocation} onChange={e => setDiagnosticDraft(d => ({ ...d, cueLocation: e.target.value }))} placeholder="e.g. at my desk"/></label><label className="field-label">EMOTION<input value={diagnosticDraft.cueEmotion} onChange={e => setDiagnosticDraft(d => ({ ...d, cueEmotion: e.target.value }))} placeholder="e.g. bored or stressed"/></label><label className="field-label">PEOPLE<input value={diagnosticDraft.cuePeople} onChange={e => setDiagnosticDraft(d => ({ ...d, cuePeople: e.target.value }))} placeholder="Who was around?"/></label></div><p className="form-note">Leave any cue blank if you have not noticed it yet.</p></div><div hidden={diagnosticStep !== 3} data-diagnostic-step="3"><label className="field-label">4. MAKE A PLAN<input value={diagnosticDraft.plan} onChange={e => setDiagnosticDraft(d => ({ ...d, plan: e.target.value }))} placeholder="When I notice the cue, I’ll try…" required/></label><p className="form-note">Choose one small experiment for the next time the cue appears.</p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => diagnosticStep ? setDiagnosticStep(diagnosticStep - 1) : setDiagnosticOpen(false)}>{diagnosticStep ? 'Back' : 'Cancel'}</button>{diagnosticStep < 3 ? <button type="button" className="primary-button" onClick={e => { const section = e.currentTarget.closest('form')?.querySelector(`[data-diagnostic-step="${diagnosticStep}"]`); const fields = section?.querySelectorAll<HTMLInputElement>('input[required]'); for (const field of Array.from(fields ?? [])) if (!field.reportValidity()) return; setDiagnosticStep(diagnosticStep + 1); }}>Continue <Icon name="arrow" size={16}/></button> : <button className="primary-button" type="submit">Save diagnostic <Icon name="arrow" size={16}/></button>}</div></form></section></div>}
    {showIdentity && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowIdentity(false); }}><section className="identity-modal" role="dialog" aria-modal="true" aria-labelledby="identity-title"><button className="modal-close" onClick={() => setShowIdentity(false)} aria-label="Close"><Icon name="x"/></button><span className="identity-modal-star"><Icon name="spark" size={18}/></span><span className="eyebrow">IDENTITY BEFORE OUTCOME</span><h2 id="identity-title">Who do you want to become?</h2><p>An outcome tells you what you want. An identity gives you a direction to practice.</p><form onSubmit={saveIdentity}><label className="field-label">WHAT’S THE OUTCOME YOU’RE AFTER?<input value={goal} onChange={e => { setGoal(e.target.value); const reframe = reframeGoal(e.target.value); if (reframe) setIdentity(reframe); }} placeholder="e.g. write a book"/></label><div className="reframe-card"><span>TO MOVE TOWARD THAT, PRACTICE BEING…</span><input value={identity} onChange={e => setIdentity(e.target.value)} placeholder="e.g. The Writer"/><small>Every small action becomes a vote for this person.</small></div><button className="primary-button identity-save" type="submit">Save my identity <Icon name="arrow" size={16}/></button></form></section></div>}
    {celebrating && <div className="celebration-overlay" aria-hidden="true"><div className="celebration-spark"><Icon name="spark" size={18}/></div><div className="celebration-copy"><span>A VOTE CAST</span><b>That’s how you become<br/>{identity.toLowerCase()}.</b><small>One small action matters.</small></div><i className="confetti confetti-one"/><i className="confetti confetti-two"/><i className="confetti confetti-three"/><i className="confetti confetti-four"/><i className="confetti confetti-five"/><i className="confetti confetti-six"/></div>}
    {toast && <div className={`toast-message${toast === 'Your new habit plan is ready.' ? ' toast-habit-added' : ''}`} role="status"><span className="toast-star"><Icon name="spark" size={18}/></span>{toast}</div>}
  </div>;
}
