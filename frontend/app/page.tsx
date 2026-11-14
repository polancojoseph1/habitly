'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type CueType = 'TIME_LOCATION' | 'STACK';
type Habit = {
  id: string; name: string; target: string; gateway: string; cueType: CueType;
  gatewayMinutes: number;
  cue: string; time?: string; location?: string; motive: string; reward: string;
  prep: string; completed: boolean; missedYesterday: boolean; streak: number;
  kind: 'BUILD' | 'BREAK'; hideCue?: string; friction?: string; contract?: string; frictionVotes?: number; rewardBundle?: string;
};
type Reward = { id: string; name: string; habitId: string; detail: string };
type Tab = 'Today' | 'My habits' | 'Recovery' | 'Reward vault' | 'Habit to break' | 'Settings';

const STORAGE = 'habitly-workspace-v2';
const demoHabits: Habit[] = [
  { id: 'demo-write', name: 'Write one sentence', target: 'Write for 30 minutes', gateway: 'Open my journal and write one sentence', gatewayMinutes: 2, cueType: 'STACK', cue: 'I pour my first coffee', motive: 'Feel like a writer before the day gets loud', reward: 'A fresh coffee and a clear head', prep: 'Leave journal open on the desk', completed: true, missedYesterday: false, streak: 5, kind: 'BUILD' },
  { id: 'demo-move', name: 'Move my body', target: 'Go for a run', gateway: 'Put on my running shoes', gatewayMinutes: 2, cueType: 'TIME_LOCATION', cue: '7:30 AM', time: '7:30 AM', location: 'By the front door', motive: 'Have more energy for the day', reward: 'Play my favorite playlist', prep: 'Lay out running clothes tonight', completed: false, missedYesterday: true, streak: 3, kind: 'BUILD' },
  { id: 'demo-read', name: 'Read one page', target: 'Read a chapter', gateway: 'Open my book to the bookmark', gatewayMinutes: 2, cueType: 'TIME_LOCATION', cue: '9:00 PM', time: '9:00 PM', location: 'In bed', motive: 'Wind down without a screen', reward: 'A quiet end to the day', prep: 'Put book on my pillow', completed: false, missedYesterday: false, streak: 8, kind: 'BUILD' },
];
const demoRewards: Reward[] = [{ id: 'reward-show', name: 'One episode, guilt-free', habitId: 'demo-move', detail: 'Unlocked after you move your body' }];
const nav: { title: Tab; icon: string }[] = [
  { title: 'Today', icon: 'grid' }, { title: 'My habits', icon: 'leaf' },
  { title: 'Recovery', icon: 'heart' }, { title: 'Reward vault', icon: 'lock' },
  { title: 'Habit to break', icon: 'spark' }, { title: 'Settings', icon: 'heart' },
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
    check: <path d="m5 12 4.2 4.2L19 6.5"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>,
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
  let count = 0; let completedDays = 0; let graceUsed = false;
  for (let i = 0; i < 366; i++) {
    const key = todayKeyFromDate(cursor); const statuses = history[key] ?? [];
    if (statuses.includes(habitId)) { count++; completedDays++; }
    else if (statuses.includes(`missed:${habitId}`)) { if (graceUsed) return { count: completedDays, warning: false, broken: completedDays === 0, hasHistory: true }; graceUsed = true; count++; }
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
  if (/meditat|breath/.test(text)) return 'Take one slow, intentional breath';
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

export default function Home() {
  const [active, setActive] = useState<Tab>('Today');
  const [habits, setHabits] = useState<Habit[]>(demoHabits);
  const [rewards, setRewards] = useState<Reward[]>(demoRewards);
  const [identity, setIdentity] = useState('The Writer');
  const [goal, setGoal] = useState('Write a book');
  const [votes, setVotes] = useState(45);
  const [prepped, setPrepped] = useState(false);
  const [preppedHabits, setPreppedHabits] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<Record<string, string[]>>(demoHistory);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [habitType, setHabitType] = useState<'BUILD' | 'BREAK'>('BUILD');
  const [cueType, setCueType] = useState<CueType>('TIME_LOCATION');
  const [targetAction, setTargetAction] = useState('');
  const [gatewayAction, setGatewayAction] = useState('');
  const [gatewayMinutes, setGatewayMinutes] = useState(2);
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
  const [vaultName, setVaultName] = useState('');
  const [vaultHabit, setVaultHabit] = useState('');
  const [vaultDetail, setVaultDetail] = useState('');
  const [apiUrl, setApiUrl] = useState(process.env.NEXT_PUBLIC_API_URL ?? '');
  const [accountEmail, setAccountEmail] = useState('');
  const [remoteUserId, setRemoteUserId] = useState('');
  const [remoteIdentityId, setRemoteIdentityId] = useState('');
  const [telegramCommand, setTelegramCommand] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const data = JSON.parse(saved);
        const savedHabits: Habit[] = data.habits ?? demoHabits;
        const savedHistory: Record<string, string[]> = data.history ?? demoHistory();
        if (data.dayKey && data.dayKey !== todayKey()) {
          const missedIds = savedHistory[dayOffsetKey(-1)] ?? [];
          setHabits(savedHabits.map(h => ({ ...h, completed: false, missedYesterday: missedIds.includes(`missed:${h.id}`) })));
        } else setHabits(savedHabits);
        setHistory(savedHistory); setPreppedHabits(data.preppedHabits ?? {}); setRewards(data.rewards ?? demoRewards);
        setIdentity(data.identity ?? 'The Writer'); setGoal(data.goal ?? 'Write a book');
        setVotes(data.votes ?? 45); setPrepped(data.prepped ?? false);
        setApiUrl(data.apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? ''); setAccountEmail(data.accountEmail ?? '');
        setRemoteUserId(data.remoteUserId ?? ''); setRemoteIdentityId(data.remoteIdentityId ?? ''); setTelegramCommand(data.telegramCommand ?? '');
      }
    } catch { /* Start with the guided sample workspace. */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE, JSON.stringify({ habits, rewards, identity, goal, votes, prepped, preppedHabits, history, dayKey: todayKey(), apiUrl, accountEmail, remoteUserId, remoteIdentityId, telegramCommand })); } catch { /* Browser storage may be disabled. */ }
  }, [hydrated, habits, rewards, identity, goal, votes, prepped, preppedHabits, history, apiUrl, accountEmail, remoteUserId, remoteIdentityId, telegramCommand]);

  useEffect(() => {
    if (!hydrated || !apiUrl || !remoteIdentityId) return;
    const base = apiUrl.replace(/\/$/, '');
    let live = true;
    async function syncFromApi() {
      try {
        const [habitResponse, identityResponse, rewardResponse] = await Promise.all([
          fetch(`${base}/api/habits?identity_id=${remoteIdentityId}`),
          fetch(`${base}/api/identities/${remoteIdentityId}`),
          fetch(`${base}/api/rewards`),
        ]);
        if (!habitResponse.ok || !live) return;
        const records = await habitResponse.json();
        const mappedRows: { habit: Habit; logs: { logged_date: string; status: string }[] }[] = await Promise.all(records.map(async (record: any) => {
          let logs: { logged_date: string; status: string }[] = [];
          let serverStreak = 0;
          try { const response = await fetch(`${base}/api/habits/${record.id}/logs`); if (response.ok) { const result = await response.json(); logs = result.logs ?? []; serverStreak = result.resilient_streak ?? 0; } } catch { /* Render without history when unavailable. */ }
          const todayLog = logs.find(log => log.logged_date === todayKey());
          const yesterdayLog = logs.find(log => log.logged_date === dayOffsetKey(-1));
          const habit = { id: record.id, name: record.target_action, target: record.target_action, gateway: record.gateway_action, gatewayMinutes: record.gateway_minutes ?? 2, cueType: record.cue_type, cue: record.cue_trigger, time: record.cue_type === 'TIME_LOCATION' ? record.cue_trigger : undefined, location: record.location ?? undefined, motive: record.craving_motive ?? '', reward: record.reward_payoff ?? '', prep: record.prep_step ?? '', completed: !!todayLog && ['COMPLETED','RECOVERED'].includes(todayLog.status), missedYesterday: yesterdayLog?.status === 'MISSED', streak: serverStreak, kind: record.habit_type, hideCue: record.cue_to_hide ?? '', friction: record.friction_strategy ?? '', contract: record.habit_contract ?? '', frictionVotes: record.friction_votes ?? 0, rewardBundle: record.reward_bundle ?? '' } as Habit;
          return { habit, logs };
        }));
        if (!live) return;
        const mapped = mappedRows.map(row => row.habit);
        if (mapped.length) setHabits(mapped);
        const remoteHistory: Record<string, string[]> = {};
        mappedRows.forEach(({ habit, logs }) => logs.forEach(log => {
          const statuses = remoteHistory[log.logged_date] ?? [];
          if (['COMPLETED','RECOVERED'].includes(log.status)) statuses.push(habit.id);
          else if (log.status === 'MISSED') statuses.push(`missed:${habit.id}`);
          remoteHistory[log.logged_date] = statuses;
        }));
        if (mapped.length) setHistory(remoteHistory);
        if (identityResponse.ok) { const currentIdentity = await identityResponse.json(); if (live) { setIdentity(currentIdentity.identity_statement); setVotes(currentIdentity.total_votes); } }
        if (rewardResponse.ok) {
          const rewardRows = await rewardResponse.json();
          const ownHabitIds = new Set(mapped.map((h: Habit) => h.id));
          const remoteRewards = rewardRows.filter((r: any) => ownHabitIds.has(r.habit_id)).map((r: any) => ({ id: r.id, name: r.name, habitId: r.habit_id, detail: r.detail ?? '' }));
          if (mapped.length && live) setRewards(remoteRewards);
        }
      } catch { /* Local workspace is still available if the API cannot be reached. */ }
    }
    syncFromApi();
    return () => { live = false; };
  }, [hydrated, apiUrl, remoteIdentityId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setShowBuilder(true); }
      if (event.key === 'Escape') { setShowBuilder(false); setShowIdentity(false); setMobileNav(false); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const todayHabits = habits.filter(h => h.kind === 'BUILD').sort((a, b) => (a.time ?? '23:59').localeCompare(b.time ?? '23:59'));
  const completed = todayHabits.filter(h => h.completed).length;
  const progress = todayHabits.length ? Math.round((completed / todayHabits.length) * 100) : 0;
  const unlockedRewards = useMemo(() => rewards.filter(r => habits.find(h => h.id === r.habitId)?.completed), [rewards, habits]);
  const needRecovery = habits.some(h => h.missedYesterday && !h.completed);
  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  function save() {
    setToast('Saved to this device.');
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
        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: habit.missedYesterday ? 'RECOVERED' : 'COMPLETED', environment_prepped: !!preppedHabits[habit.id] }) });
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
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) fetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'MISSED', environment_prepped: !!preppedHabits[habit.id] }) }).catch(() => {});
    setToast('A missed day is information, not a verdict. Come back tomorrow.');
  }

  function setHabitPrep(habitId: string, checked: boolean) {
    setPreppedHabits(current => ({ ...current, [habitId]: checked }));
    if (apiUrl && remoteIdentityId && !habitId.startsWith('demo-')) fetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habitId}/prep`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ environment_prepped: checked }) }).catch(() => {});
  }

  function recordFriction(habit: Habit) {
    const next = (habit.frictionVotes ?? 0) + 1;
    setHabits(current => current.map(item => item.id === habit.id ? { ...item, frictionVotes: next } : item));
    if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) fetch(`${apiUrl.replace(/\/$/, '')}/api/habits/${habit.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friction_votes: next }) }).catch(() => {});
    setToast('Friction added. That’s a vote for the change you want.');
  }

  async function createHabit(event: FormEvent) {
    event.preventDefault();
    if (!targetAction.trim() || !gatewayAction.trim() || !motive.trim() || !reward.trim()) return;
    if (cueType === 'TIME_LOCATION' && (!time.trim() || !location.trim())) return;
    if (cueType === 'STACK' && !cue.trim()) return;
    if (habitType === 'BREAK' && (!hideCue.trim() || !friction.trim() || !contract.trim())) return;
    let habitId = `habit-${Date.now()}`;
    if (apiUrl && remoteIdentityId) {
      try {
        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/habits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity_id: remoteIdentityId, habit_type: habitType, target_action: targetAction.trim(), gateway_action: gatewayAction.trim(), gateway_minutes: gatewayMinutes, cue_type: cueType, cue_trigger: cueType === 'STACK' ? cue.trim() : time.trim(), location: cueType === 'TIME_LOCATION' ? location.trim() : null, craving_motive: motive.trim(), reward_payoff: reward.trim(), prep_step: prepStep.trim() || null, reward_bundle: bundle.trim() || null, cue_to_hide: hideCue.trim() || null, friction_strategy: friction.trim() || null, habit_contract: contract.trim() || null }) });
        if (response.ok) habitId = (await response.json()).id;
      } catch { /* The local habit remains usable when API sync is unavailable. */ }
    }
    const habit: Habit = {
      id: habitId, name: targetAction.trim(), target: targetAction.trim(), gateway: gatewayAction.trim(), gatewayMinutes,
      cueType, cue: cueType === 'STACK' ? cue.trim() : time.trim(), time: cueType === 'TIME_LOCATION' ? time : undefined,
      location: cueType === 'TIME_LOCATION' ? location : undefined, motive: motive.trim(), reward: reward.trim(),
      prep: prepStep.trim(), completed: false, missedYesterday: false, streak: 0, kind: habitType,
      hideCue: hideCue.trim(), friction: friction.trim(), contract: contract.trim(), frictionVotes: 0, rewardBundle: bundle.trim(),
    };
    setHabits(current => [...current, habit]);
    if (habitType === 'BUILD' && bundle.trim()) {
      let rewardId = `reward-${Date.now()}`;
      if (apiUrl && remoteIdentityId && !habit.id.startsWith('demo-')) {
        try { const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/rewards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habit_id: habit.id, name: bundle.trim(), detail: `A little treat after ${habit.name.toLowerCase()}` }) }); if (response.ok) rewardId = (await response.json()).id; } catch { /* Keep reward local if API is unavailable. */ }
      }
      setRewards(current => [...current, { id: rewardId, name: bundle.trim(), habitId: habit.id, detail: `A little treat after ${habit.name.toLowerCase()}` }]);
    }
    setShowBuilder(false); setActive(habitType === 'BREAK' ? 'Habit to break' : 'Today');
    setToast(habitType === 'BUILD' ? 'Your new identity vote is ready.' : 'Your friction plan is ready.');
    setTargetAction(''); setGatewayAction(''); setGatewayMinutes(2); setCue(''); setTime(''); setLocation(''); setMotive(''); setReward(''); setPrepStep(''); setBundle(''); setHideCue(''); setFriction(''); setContract(''); setHabitType('BUILD'); setCueType('TIME_LOCATION');
  }

  async function addVaultReward(event: FormEvent) {
    event.preventDefault();
    if (!vaultName.trim() || !vaultHabit) return;
    let rewardId = `reward-${Date.now()}`;
    if (apiUrl && remoteIdentityId && !vaultHabit.startsWith('demo-')) {
      try {
        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/rewards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habit_id: vaultHabit, name: vaultName.trim(), detail: vaultDetail.trim() || null }) });
        if (response.ok) rewardId = (await response.json()).id;
      } catch { /* Keep the reward available in the local workspace. */ }
    }
    setRewards(current => [...current, { id: rewardId, name: vaultName.trim(), habitId: vaultHabit, detail: vaultDetail.trim() || 'Unlocks when your habit is complete' }]);
    setVaultName(''); setVaultDetail(''); setToast('Reward added to your vault.');
  }

  async function saveIdentity(event: FormEvent) { event.preventDefault(); setShowIdentity(false); save(); if (apiUrl && remoteIdentityId) fetch(`${apiUrl.replace(/\/$/, '')}/api/identities/${remoteIdentityId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity_statement: identity }) }).catch(() => setToast('Identity saved here. API sync will retry when connected.')); }

  async function setupAccount() {
    if (!apiUrl) { setToast('Add your API address first.'); return; }
    setSettingsBusy(true);
    try {
      const base = apiUrl.replace(/\/$/, '');
      if (remoteUserId && remoteIdentityId) {
        const health = await fetch(`${base}/health`);
        if (!health.ok) throw new Error('API health check failed');
        const identityResponse = await fetch(`${base}/api/identities/${remoteIdentityId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity_statement: identity }) });
        if (!identityResponse.ok) throw new Error(await identityResponse.text());
        setToast('Habitly API connection confirmed.'); return;
      }
      const userResponse = await fetch(`${base}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accountEmail || null }) });
      if (!userResponse.ok) throw new Error(await userResponse.text());
      const user = await userResponse.json();
      const identityResponse = await fetch(`${base}/api/identities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id, identity_statement: identity }) });
      if (!identityResponse.ok) throw new Error(await identityResponse.text());
      const savedIdentity = await identityResponse.json(); setRemoteUserId(user.id); setRemoteIdentityId(savedIdentity.id); setVotes(0); setHabits([]); setRewards([]); setHistory({}); setPrepped(false); setPreppedHabits({}); setToast('Habitly account connected to your API.');
    } catch (error) { setToast(`Could not connect: ${error instanceof Error ? error.message.slice(0, 100) : 'check API address and CORS settings'}`); }
    finally { setSettingsBusy(false); }
  }

  async function connectTelegram() {
    if (!remoteUserId || !apiUrl) { setToast('Connect your API account first.'); return; }
    setSettingsBusy(true);
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/users/${remoteUserId}/telegram-link`, { method: 'POST' });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json(); setTelegramCommand(data.start_command); setToast('One-time Telegram link created. It expires in 10 minutes.');
    } catch (error) { setToast(`Telegram link failed: ${error instanceof Error ? error.message.slice(0, 90) : 'check bot configuration'}`); }
    finally { setSettingsBusy(false); }
  }

  function renderHabitCard(habit: Habit, index: number) {
    const cueLine = habit.cueType === 'STACK' ? `After ${habit.cue}` : `At ${habit.time || habit.cue} · ${habit.location}`;
    const streak = getResilientStreak(history, habit.id);
    return <article key={habit.id} className={`habit-card ${habit.completed ? 'habit-card-done' : ''}`} onTouchStart={e => { touchStartX.current = e.changedTouches[0]?.screenX ?? null; }} onTouchEnd={e => { const end = e.changedTouches[0]?.screenX; if (touchStartX.current !== null && end !== undefined) { const delta = end - touchStartX.current; if (delta > 75) void completeHabit(habit); else if (delta < -75) void markMissed(habit); } touchStartX.current = null; }}>
      <div className="habit-card-top">
        <div className={`habit-check ${habit.completed ? 'checked' : ''}`}>
          {habit.completed ? <Icon name="check" size={19}/> : <span>{String(index + 1).padStart(2, '0')}</span>}
        </div>
        <div className="habit-main">
          <div className="habit-title-line"><h3>{habit.name}</h3>{habit.missedYesterday && !habit.completed && <span className="recovery-pill">Recovery day</span>}</div>
          <p className="habit-cue"><Icon name={habit.cueType === 'STACK' ? 'spark' : 'clock'} size={14}/>{cueLine}</p>
          <p className="habit-starter"><span>{habit.gatewayMinutes}-MIN START</span>{habit.gateway}</p>
        </div>
        <button className={`complete-button ${habit.completed ? 'complete-button-done' : ''}`} onClick={() => completeHabit(habit)} aria-label={`Complete ${habit.name}`}>
          {habit.completed ? <><Icon name="check" size={16}/> Done</> : 'I did it'}
        </button>
      </div>
      <div className="habit-card-foot">
        <span><Icon name="flame" size={14}/>{streak.hasHistory ? streak.count : habit.streak} day chain{streak.warning && !habit.completed ? ' · recover today' : ''}</span>
        <span className="habit-why">{habit.motive}</span>
        <button className="quiet-button" onClick={() => markMissed(habit)}>Mark missed</button>
      </div>
      {!!habit.prep && <div className="prep-inline"><label><input type="checkbox" checked={!!preppedHabits[habit.id]} onChange={e => setHabitPrep(habit.id, e.target.checked)}/><span><b>Tonight's setup</b> · {habit.prep}</span></label><span className="prep-label">{preppedHabits[habit.id] ? 'Ready ✓' : 'PREP'}</span></div>}
    </article>;
  }

  function renderToday() {
    const days = weekDays();
    return <>
      <div className="page-heading-row"><div><div className="eyebrow">{currentDate}</div><h1>{greeting()}, Joseph<span className="heading-period">.</span></h1><p className="page-subtitle">A small promise kept is a vote for who you’re becoming.</p></div><button className="primary-button" onClick={() => setShowBuilder(true)}><Icon name="plus"/> Build a habit</button></div>
      <section className="identity-banner">
        <div className="identity-copy"><span className="overline">YOUR IDENTITY</span><h2>{identity}<button className="edit-identity" onClick={() => setShowIdentity(true)} aria-label="Edit identity">✎</button></h2><p>Every action is a little piece of evidence.</p></div>
        <div className="identity-count"><div className="vote-orbit"><span>{votes}</span></div><div><b>identity votes</b><small>cast so far</small></div></div>
        <div className="identity-mark" aria-hidden="true">✳</div>
      </section>
      <section className="summary-grid">
        <div className="summary-card week-card"><div className="summary-card-title"><div><span className="eyebrow">YOUR RHYTHM</span><h3>This week</h3></div><span className="week-count">{completed}<small>/{todayHabits.length} today</small></span></div><div className="week-strip">{days.map(d => { const statuses = history[d.date] ?? []; const doneCount = statuses.filter(id => !id.startsWith('missed:')).length; const missedCount = statuses.filter(id => id.startsWith('missed:')).length; return <div key={d.date} className={`week-day ${d.today ? 'week-day-today' : ''}`}><span>{d.label}</span><div className={`${d.today ? 'week-today-circle' : doneCount ? 'week-past-circle' : 'week-future-circle'} ${missedCount && !doneCount ? 'week-day-missed' : ''}`}>{d.today ? <b>{d.day}</b> : doneCount ? <Icon name="check" size={14}/> : d.day}</div><i className={doneCount ? 'day-dot day-dot-on' : missedCount ? 'day-dot day-dot-missed' : 'day-dot'}/></div>; })}</div></div>
        <div className="summary-card progress-card"><div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}><div><b>{progress}%</b><small>today</small></div></div><div><span className="eyebrow">SHOWING UP</span><h3>{completed === todayHabits.length && todayHabits.length ? 'You showed up.' : 'One step at a time.'}</h3><p>{completed} of {todayHabits.length} small actions complete</p></div></div>
      </section>
      {needRecovery && <button className="recovery-banner" onClick={() => setActive('Recovery')}><span className="recovery-icon"><Icon name="heart"/></span><span><b>{habits.some(h => h.missedYesterday && getResilientStreak(history, h.id).broken) ? 'Let’s make the restart even smaller.' : 'One day got away from you?'}</b><small>Today is a fresh chance. Never miss twice.</small></span><Icon name="arrow"/></button>}
      <section className="today-section"><div className="section-heading"><div><span className="eyebrow">YOUR SMALL PROMISES</span><h2>Today’s habits <span className="soft-count">{completed}/{todayHabits.length}</span></h2></div><button className="text-button" onClick={() => setActive('My habits')}>See all <Icon name="arrow" size={15}/></button></div><div className="habit-list">{todayHabits.length ? todayHabits.map((habit, i) => { const group = habit.cueType === 'STACK' ? 'Anchored routines' : (Number((habit.time ?? '23:59').slice(0,2)) < 12 ? 'Morning' : Number((habit.time ?? '23:59').slice(0,2)) < 17 ? 'Afternoon' : 'Evening'); const previous = i ? todayHabits[i - 1] : undefined; const previousGroup = previous ? (previous.cueType === 'STACK' ? 'Anchored routines' : (Number((previous.time ?? '23:59').slice(0,2)) < 12 ? 'Morning' : Number((previous.time ?? '23:59').slice(0,2)) < 17 ? 'Afternoon' : 'Evening')) : ''; return <div className="habit-group-block" key={habit.id}>{group !== previousGroup && <div className="habit-group-label">{group}<i/></div>}{renderHabitCard(habit, i)}</div>; }) : <div className="empty-card"><div className="empty-flower">✳</div><h3>Start with one tiny promise.</h3><p>Choose a cue, make the action easy, and give your future self a clear path.</p><button className="primary-button" onClick={() => setShowBuilder(true)}><Icon name="plus"/> Create your first habit</button></div>}</div></section>
      <section className="bottom-grid"><div className="prep-card"><div className="prep-art">☼</div><div><span className="eyebrow">A GIFT TO TOMORROW YOU</span><h3>Prime your environment</h3><p>Set out one thing tonight that makes tomorrow easier.</p><label className="prep-check-row"><input type="checkbox" checked={prepped} onChange={e => setPrepped(e.target.checked)}/><span>{prepped ? 'All set for tomorrow' : 'I’ve prepared for tomorrow'}</span></label></div></div><div className="vault-teaser"><div className="vault-teaser-icon"><Icon name="lock" size={20}/></div><div><span className="eyebrow">YOUR REWARD VAULT</span><h3>{unlockedRewards.length ? `${unlockedRewards.length} reward unlocked` : 'A little something to look forward to'}</h3><p>{unlockedRewards[0]?.name ?? 'Link something you want to a habit you need.'}</p></div><button className="round-arrow" onClick={() => setActive('Reward vault')} aria-label="Open reward vault"><Icon name="arrow" size={16}/></button></div></section>
    </>;
  }

  function renderHabits() {
    const good = habits.filter(h => h.kind === 'BUILD');
    return <><div className="page-heading-row"><div><div className="eyebrow">MAKE IT OBVIOUS. MAKE IT EASY.</div><h1>Your habits<span className="heading-period">.</span></h1><p className="page-subtitle">Small actions, attached to the life you already live.</p></div><button className="primary-button" onClick={() => setShowBuilder(true)}><Icon name="plus"/> Create habit</button></div><div className="habits-intro"><div className="intro-badge"><Icon name="spark"/></div><div><b>Start tiny. Stay consistent.</b><p>Your gateway action is the two-minute version. The routine comes first; intensity can follow.</p></div></div><div className="section-heading"><div><span className="eyebrow">BUILDING WHO YOU ARE</span><h2>Habits to build <span className="soft-count">{good.length}</span></h2></div></div><div className="habit-list">{good.length ? good.map(renderHabitCard) : <div className="empty-card"><div className="empty-flower">✳</div><h3>One small promise is enough.</h3><p>Pick a cue and an easy starter action. You can build up once the routine feels familiar.</p><button className="primary-button" onClick={() => setShowBuilder(true)}><Icon name="plus"/> Create a habit</button></div>}</div><button className="text-button anti-link" onClick={() => setActive('Habit to break')}>Manage habits you want to break <Icon name="arrow" size={15}/></button></>;
  }

  function renderRecovery() {
    const needs = habits.filter(h => h.missedYesterday);
    const circuitBreaker = needs.some(h => getResilientStreak(history, h.id).broken);
    const recentDays = Array.from({ length: 28 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (27 - i)); const key = todayKeyFromDate(d); const statuses = history[key] ?? []; return { key, day: d.getDate(), done: statuses.filter(x => !x.startsWith('missed:')).length, missed: statuses.filter(x => x.startsWith('missed:')).length }; });
    return <><div className="page-heading-row"><div><div className="eyebrow">THE COMEBACK COUNTS</div><h1>Recovery, not reset<span className="heading-period">.</span></h1><p className="page-subtitle">You never have to be perfect. Just return to the path.</p></div></div><div className={`recovery-hero ${circuitBreaker ? 'recovery-circuit-breaker' : ''}`}><div className="recovery-sun">↗</div><span className="overline">{circuitBreaker ? 'CIRCUIT BREAKER · RESET THE ACTION, NOT YOUR IDENTITY' : 'NEVER MISS TWICE'}</span><h2>{circuitBreaker ? 'Two misses are a signal to shrink the next step.' : needs.length ? 'You missed a day. You still belong here.' : 'You’re back in rhythm.'}</h2><p>{circuitBreaker ? 'Make the next action almost impossible to skip. Choose the smallest gateway action and put the cue directly in your path. Your identity votes are still here.' : needs.length ? 'One missed day doesn’t erase the votes you’ve already cast. Choose the smallest version and begin again today.' : 'No recovery needed right now. Keep your next step small and your cues clear.'}</p><div className="recovery-stats"><div><b>{votes}</b><span>identity votes kept</span></div><div><b>{needs.filter(h => h.completed).length}/{needs.length || 0}</b><span>comeback actions</span></div><div><b>1 day</b><span>grace built in</span></div></div></div><section className="calendar-card"><div className="calendar-heading"><div><span className="eyebrow">PROGRESS YOU CAN SEE</span><h3>Last 28 days</h3></div><div className="calendar-legend"><span><i className="activity-done"/> Showed up</span><span><i className="activity-missed"/> Rest / miss</span></div></div><div className="activity-calendar">{recentDays.map(d => <div key={d.key} title={`${d.key}: ${d.done} votes, ${d.missed} missed`} className={`activity-cell ${d.done ? 'activity-done' : d.missed ? 'activity-missed' : ''}`}><span>{d.day}</span></div>)}</div></section><div className="section-heading space-top"><div><span className="eyebrow">A GENTLE NUDGE</span><h2>{needs.length ? 'Pick one to restart' : 'Your habits today'}</h2></div></div><div className="habit-list">{(needs.length ? needs : todayHabits).map(renderHabitCard)}</div></>;
  }

  function renderVault() {
    return <><div className="page-heading-row"><div><div className="eyebrow">MAKE IT ATTRACTIVE</div><h1>The reward vault<span className="heading-period">.</span></h1><p className="page-subtitle">Pair something you want with the habit you need.</p></div></div><div className="vault-hero"><div className="vault-hero-icon">✳</div><div><span className="overline">TEMPTATION BUNDLING</span><h2>Earn the thing you love.</h2><p>Your wants wait here until you complete the action they’re paired with.</p></div><div className="vault-unlocked"><b>{unlockedRewards.length}</b><span>unlocked today</span></div></div><div className="vault-grid">{rewards.map(r => { const need = habits.find(h => h.id === r.habitId); const isUnlocked = !!need?.completed; return <article className={`reward-card ${isUnlocked ? 'reward-card-open' : ''}`} key={r.id}><div className={`reward-symbol ${isUnlocked ? 'reward-symbol-open' : ''}`}>{isUnlocked ? '✦' : <Icon name="lock" size={21}/>}</div><span className={`reward-status ${isUnlocked ? 'status-open' : ''}`}>{isUnlocked ? 'UNLOCKED' : 'WAITING FOR YOU'}</span><h3>{r.name}</h3><p>{r.detail}</p><div className="reward-linked">{isUnlocked ? '✓' : <Icon name="lock" size={13}/>} Linked to: <b>{need?.name ?? 'Habit removed'}</b></div></article>; })}</div><form className="vault-add-card" onSubmit={addVaultReward}><div><span className="eyebrow">ADD A WANT</span><h3>What sounds good after you show up?</h3></div><div className="vault-form"><input value={vaultName} onChange={e => setVaultName(e.target.value)} placeholder="e.g. Watch one episode" required/><select value={vaultHabit} onChange={e => setVaultHabit(e.target.value)} required><option value="">Choose the habit it unlocks</option>{habits.filter(h => h.kind === 'BUILD').map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select><input value={vaultDetail} onChange={e => setVaultDetail(e.target.value)} placeholder="A note to future you (optional)"/><button className="primary-button" type="submit"><Icon name="plus"/> Add to vault</button></div></form></>;
  }

  function renderAntiHabit() {
    const anti = habits.filter(h => h.kind === 'BREAK');
    return <><div className="page-heading-row"><div><div className="eyebrow">MAKE IT INVISIBLE · UNATTRACTIVE · DIFFICULT</div><h1>Change the default<span className="heading-period">.</span></h1><p className="page-subtitle">You don’t need more willpower. You need fewer easy paths back to the habit.</p></div><button className="primary-button" onClick={() => { setHabitType('BREAK'); setShowBuilder(true); }}><Icon name="plus"/> Add a friction plan</button></div><div className="anti-guide"><div className="anti-guide-mark">↘</div><div><span className="overline">THE FOURTH LAW, IN REVERSE</span><h2>Make the unwanted behavior harder.</h2><p>Notice the cue. Add a little friction. Make the cost visible. Then give yourself a better next action.</p></div><div className="anti-laws"><span>HIDE THE CUE</span><span>ADD FRICTION</span><span>MAKE IT UNSATISFYING</span></div></div>{anti.length ? <><div className="section-heading space-top"><div><span className="eyebrow">YOUR FRICTION PLANS</span><h2>Breaking the loop <span className="soft-count">{anti.length}</span></h2></div></div><div className="anti-list">{anti.map(h => <article className="anti-card" key={h.id}><div className="anti-card-top"><div className="anti-card-icon"><Icon name="spark"/></div><div><span className="eyebrow">OLD LOOP</span><h3>{h.name}</h3></div><span className="shield-badge">✦ Friction shield</span></div><div className="anti-steps"><div><span>01 · HIDE THE CUE</span><p>{h.hideCue || h.cue}</p></div><div><span>02 · ADD FRICTION</span><p>{h.friction || 'Choose a barrier that slows the automatic response.'}</p></div><div><span>03 · REPLACE WITH</span><p>{h.gateway}</p></div></div>{h.contract && <div className="contract-note">“{h.contract}”</div>}<div className="friction-action"><span>Friction shields earned <b>{h.frictionVotes ?? 0}</b></span><button type="button" onClick={() => recordFriction(h)}>I added friction <Icon name="plus" size={13}/></button></div></article>)}</div></> : <div className="empty-card anti-empty"><div className="empty-flower">↘</div><h3>What behavior keeps pulling you in?</h3><p>Build one friction plan. Start with its cue, then pick a small barrier that helps you pause.</p><button className="primary-button" onClick={() => { setHabitType('BREAK'); setShowBuilder(true); }}><Icon name="plus"/> Create a friction plan</button></div>}</>;
  }

  function renderSettings() {
    return <><div className="page-heading-row"><div><div className="eyebrow">YOUR SPACE, YOUR RULES</div><h1>Settings<span className="heading-period">.</span></h1><p className="page-subtitle">Connect the API and your Habit Changer bot when you’re ready.</p></div></div><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Icon name="leaf"/></div><div><span className="eyebrow">HABITLY API</span><h2>Connect your data</h2><p>Habits are saved on this device until an API address is configured.</p></div><span className={`connection-badge ${remoteUserId ? 'connected' : ''}`}><i/>{remoteUserId ? 'Connected' : 'Local workspace'}</span></div><div className="settings-fields"><label className="field-label">API BASE URL<input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://your-api.example.com"/></label><label className="field-label">EMAIL <span className="optional">OPTIONAL</span><input value={accountEmail} onChange={e => setAccountEmail(e.target.value)} placeholder="you@example.com" type="email"/></label><div className="settings-actions"><button className="primary-button" disabled={settingsBusy || !apiUrl} onClick={setupAccount}>{settingsBusy ? 'Connecting…' : remoteUserId ? 'Reconnect account' : 'Connect account'} <Icon name="arrow" size={15}/></button>{remoteUserId && <span className="settings-id">Account {remoteUserId.slice(0, 8)}…</span>}</div></div></section><section className="settings-card telegram-settings"><div className="settings-card-head"><div className="telegram-icon">✈</div><div><span className="eyebrow">HABIT CHANGER BOT</span><h2>Log from Telegram</h2><p>Link a private chat, then text “done” with the habit name.</p></div><span className={`connection-badge ${telegramCommand ? 'connected' : ''}`}><i/>{telegramCommand ? 'Link ready' : 'Not linked'}</span></div><div className="telegram-steps"><div><b>01</b><span>Configure <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_WEBHOOK_SECRET</code> on the API.</span></div><div><b>02</b><span>Generate a one-time link command below, then send it to your bot.</span></div><div><b>03</b><span>Send “done Read one page” to log a habit and get your resilient streak.</span></div></div><div className="settings-actions"><button className="secondary-button" disabled={settingsBusy || !remoteUserId} onClick={connectTelegram}>Generate Telegram link <Icon name="arrow" size={14}/></button>{telegramCommand && <code className="telegram-command">{telegramCommand}</code>}</div></section><section className="settings-card settings-privacy"><div><span className="eyebrow">YOUR DATA</span><h2>Identity is a practice, not a performance.</h2><p>This sample workspace is stored in your browser. API mode is an early MVP and needs authentication before storing sensitive personal data.</p></div></section></>;
  }

  function renderPage() {
    if (active === 'My habits') return renderHabits();
    if (active === 'Recovery') return renderRecovery();
    if (active === 'Reward vault') return renderVault();
    if (active === 'Habit to break') return renderAntiHabit();
    if (active === 'Settings') return renderSettings();
    return renderToday();
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#today" onClick={e => { e.preventDefault(); setActive('Today'); }}><span className="brand-mark">h</span><span>habitly<span className="brand-dot">.</span></span></a>
      <div className="sidebar-caption">YOUR SPACE</div>
      <nav className="side-nav">{nav.map(item => <button key={item.title} className={`nav-item ${active === item.title ? 'nav-active' : ''}`} onClick={() => { setActive(item.title); setMobileNav(false); }}><Icon name={item.icon}/><span>{item.title}</span>{item.title === 'Recovery' && needRecovery && <i className="nav-alert"/>}{item.title === 'Reward vault' && unlockedRewards.length > 0 && <i className="nav-unlocked"/>}</button>)}</nav>
      <button className="sidebar-new" onClick={() => setShowBuilder(true)}><span><Icon name="plus" size={17}/></span><span>Build a habit</span><kbd>⌘ K</kbd></button>
      <div className="sidebar-bottom"><div className="sidebar-quote"><span className="quote-mark">“</span><p>Every action you take is a vote for the type of person you wish to become.</p><small>— JAMES CLEAR</small><div className="quote-leaf">✳</div></div><button className="profile-row" onClick={() => setShowIdentity(true)}><span className="avatar">J</span><span><b>Joseph</b><small>{identity}</small></span><span className="profile-more">···</span></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label="Open navigation"><Icon name={mobileNav ? 'x' : 'menu'}/></button><div className="breadcrumb"><span>My space</span><span className="crumb-slash">/</span><b>{active}</b></div><div className="topbar-right"><span className="sync-status"><i/>{remoteUserId ? 'Synced with your API' : 'Sample workspace · saved on this device'}</span><button className="avatar top-avatar" onClick={() => setShowIdentity(true)} aria-label="Edit identity">J</button></div></header>
      <div className="content-wrap">{renderPage()}</div>
      <footer className="main-footer"><span>Made of small things.</span><span>Consistency over intensity <i>✳</i></span></footer>
    </main>

    {showBuilder && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowBuilder(false); }}><section className="builder-modal" role="dialog" aria-modal="true" aria-labelledby="builder-title"><header className="modal-header"><div><span className="eyebrow">MAKE IT OBVIOUS · EASY · SATISFYING</span><h2 id="builder-title">{habitType === 'BREAK' ? 'Build a friction plan' : 'Create a small promise'}</h2><p>Start with the action you want to make automatic.</p></div><button className="modal-close" onClick={() => setShowBuilder(false)} aria-label="Close"><Icon name="x"/></button></header><form onSubmit={createHabit} className="builder-form"><div className="form-kind-tabs"><button type="button" className={habitType === 'BUILD' ? 'selected' : ''} onClick={() => setHabitType('BUILD')}><Icon name="leaf" size={15}/> Build a habit</button><button type="button" className={habitType === 'BREAK' ? 'selected' : ''} onClick={() => setHabitType('BREAK')}><Icon name="spark" size={15}/> Break a habit</button></div><label className="field-label">{habitType === 'BUILD' ? 'What do you want to do?' : 'What habit do you want to change?'}<input value={targetAction} onChange={e => { setTargetAction(e.target.value); if (!gatewayAction || gatewayAction.startsWith('Start ')) setGatewayAction(suggestStarter(e.target.value)); }} placeholder={habitType === 'BUILD' ? 'e.g. Run three miles' : 'e.g. Scroll social media in bed'} required/></label>{habitType === 'BUILD' && <div className="downscale-box"><span className="downscale-icon">↘</span><div><b>Make the first step ridiculously easy</b><p>Two-minute version: <strong>{gatewayAction || 'Type an action above to get a starter idea'}</strong></p></div><button type="button" className="downscale-refresh" onClick={() => setGatewayAction(suggestStarter(targetAction))}>Try another</button></div>}<label className="field-label">{habitType === 'BUILD' ? 'Your tiny starter action' : 'What’s a better action to switch to?'}<input value={gatewayAction} onChange={e => setGatewayAction(e.target.value)} placeholder="Something you can start in two minutes" required/></label><label className="field-label">STARTER LENGTH <span className="optional">MAX 2 MINUTES</span><select value={gatewayMinutes} onChange={e => setGatewayMinutes(Math.min(2, Number(e.target.value)))}><option value={1}>1 minute</option><option value={2}>2 minutes</option></select></label><div className="field-label">Choose your cue<div className="cue-tabs"><button type="button" className={cueType === 'TIME_LOCATION' ? 'cue-tab-selected' : ''} onClick={() => setCueType('TIME_LOCATION')}><Icon name="clock" size={16}/><span><b>At a time & place</b><small>Implementation intention</small></span></button><button type="button" className={cueType === 'STACK' ? 'cue-tab-selected' : ''} onClick={() => setCueType('STACK')}><Icon name="spark" size={16}/><span><b>After something I do</b><small>Habit stack</small></span></button></div></div>{cueType === 'TIME_LOCATION' ? <div className="field-two"><label className="field-label">TIME<input type="time" value={time} onChange={e => setTime(e.target.value)} required/></label><label className="field-label">LOCATION<input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. at my desk" required/></label></div> : <><label className="field-label">AFTER I…<input value={cue} onChange={e => setCue(e.target.value)} placeholder="e.g. pour my first coffee" required/></label><div className="anchor-builder"><span>YOUR ANCHORS <small>Click or drag a routine into the cue above</small></span><div className="anchor-options">{['wake up','make coffee','brush my teeth',...habits.map(h => h.target)].slice(0,7).map((anchor, i) => <button type="button" draggable key={`${anchor}-${i}`} onClick={() => setCue(anchor)} onDragStart={e => e.dataTransfer.setData('text/plain', anchor)}>{anchor}</button>)}</div><div className="anchor-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setCue(e.dataTransfer.getData('text/plain')); }}><Icon name="spark" size={13}/>{cue || 'Drop an anchor here or type your own'}</div></div></>}{cueType === 'TIME_LOCATION' && <div className="formula-preview">I will <b>{targetAction || '…'}</b> at <b>{time || '…'}</b> in <b>{location || '…'}</b>.</div>}{cueType === 'STACK' && <div className="formula-preview">After I <b>{cue || '…'}</b>, I will <b>{targetAction || '…'}</b>.</div>}<div className="field-two"><label className="field-label">WHY DO YOU WANT THIS?<input value={motive} onChange={e => setMotive(e.target.value)} placeholder="The feeling or identity underneath" required/></label><label className="field-label">MAKE IT SATISFYING<input value={reward} onChange={e => setReward(e.target.value)} placeholder="A small immediate payoff" required/></label></div><label className="field-label">PRIME YOUR ENVIRONMENT<input value={prepStep} onChange={e => setPrepStep(e.target.value)} placeholder="e.g. leave my book on the pillow"/></label>{habitType === 'BUILD' ? <label className="field-label">TEMPTATION BUNDLE <span className="optional">OPTIONAL</span><input value={bundle} onChange={e => setBundle(e.target.value)} placeholder="Something you want, after this habit"/></label> : <><label className="field-label">CUE TO HIDE<input value={hideCue} onChange={e => setHideCue(e.target.value)} placeholder="What can you remove from view?" required/></label><label className="field-label">FRICTION TO ADD<input value={friction} onChange={e => setFriction(e.target.value)} placeholder="Make the old loop one step harder" required/></label><label className="field-label">HABIT CONTRACT<input value={contract} onChange={e => setContract(e.target.value)} placeholder="What will it cost if you follow the old loop?" required/></label></>}<div className="form-note"><Icon name="heart" size={15}/> Your first goal is showing up. You can grow the action later.</div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowBuilder(false)}>Cancel</button><button className="primary-button" type="submit">{habitType === 'BREAK' ? 'Save friction plan' : 'Add my habit'} <Icon name="arrow" size={16}/></button></div></form></section></div>}

    {showIdentity && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowIdentity(false); }}><section className="identity-modal" role="dialog" aria-modal="true" aria-labelledby="identity-title"><button className="modal-close" onClick={() => setShowIdentity(false)} aria-label="Close"><Icon name="x"/></button><span className="identity-modal-star">✳</span><span className="eyebrow">IDENTITY BEFORE OUTCOME</span><h2 id="identity-title">Who do you want to become?</h2><p>An outcome tells you what you want. An identity gives you a direction to practice.</p><form onSubmit={saveIdentity}><label className="field-label">WHAT’S THE OUTCOME YOU’RE AFTER?<input value={goal} onChange={e => { setGoal(e.target.value); const reframe = reframeGoal(e.target.value); if (reframe) setIdentity(reframe); }} placeholder="e.g. write a book"/></label><div className="reframe-card"><span>TO MOVE TOWARD THAT, PRACTICE BEING…</span><input value={identity} onChange={e => setIdentity(e.target.value)} placeholder="e.g. The Writer"/><small>Every small action becomes a vote for this person.</small></div><button className="primary-button identity-save" type="submit">Save my identity <Icon name="arrow" size={16}/></button></form></section></div>}
    {celebrating && <div className="celebration-overlay" aria-hidden="true"><div className="celebration-spark">✳</div><div className="celebration-copy"><span>A VOTE CAST</span><b>That’s how you become<br/>{identity.toLowerCase()}.</b><small>One small action matters.</small></div><i className="confetti confetti-one"/><i className="confetti confetti-two"/><i className="confetti confetti-three"/><i className="confetti confetti-four"/><i className="confetti confetti-five"/><i className="confetti confetti-six"/></div>}
    {toast && <div className="toast-message" role="status"><span className="toast-star">✳</span>{toast}</div>}
  </div>;
}
