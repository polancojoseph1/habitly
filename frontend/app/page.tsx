'use client';

import { useEffect, useState } from 'react';

type Habit = { id: string; target_action: string; gateway_action: string; cue_type: string; cue_trigger: string; location?: string | null };
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default function Home() {
  const [identity, setIdentity] = useState('The Writer');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [votes, setVotes] = useState(0);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => { fetch(`${API}/api/habits`).then(r => r.ok ? r.json() : []).then(setHabits).catch(() => setMessage('Connect the Habitly API to load your habits.')); }, []);

  async function complete(habit: Habit) {
    try {
      const response = await fetch(`${API}/api/habits/${habit.id}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) });
      if (!response.ok) throw new Error();
      const data = await response.json(); setVotes(data.identity_votes); setDone(current => [...current, habit.id]);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(18);
      setMessage(data.resilient_streak ? `A vote for your identity. ${data.resilient_streak} day resilient streak.` : 'A vote for your identity.');
    } catch { setMessage('Could not save this yet. Check that the API is running.'); }
  }

  return <main className="min-h-screen px-5 py-8 sm:px-10">
    <div className="mx-auto max-w-3xl">
      <header className="flex items-center justify-between"><div className="text-sm font-bold tracking-[.2em] uppercase">habitly</div><div className="rounded-full border border-[#d9d8cf] px-4 py-2 text-sm">{votes} identity votes</div></header>
      <section className="mt-16 rounded-[2rem] bg-[#dfe8d6] p-8 sm:p-12">
        <p className="text-sm uppercase tracking-[.16em] text-[#58664f]">A little evidence, every day</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">You are becoming<br/><span className="text-[#65775c]">{identity}.</span></h1>
        <div className="mt-8 flex flex-wrap gap-2"><input aria-label="Identity statement" value={identity} onChange={e => setIdentity(e.target.value)} className="min-w-0 flex-1 rounded-full border border-[#cbd5c2] bg-white/80 px-5 py-3 outline-none focus:ring-2 focus:ring-[#829777]"/><span className="self-center text-xs text-[#58664f]">Edit your identity</span></div>
      </section>
      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between"><div><p className="text-xs uppercase tracking-[.18em] text-[#76796f]">Today</p><h2 className="mt-1 text-2xl font-semibold">Keep the vote going</h2></div><span className="text-sm text-[#76796f]">{done.length}/{habits.length} done</span></div>
        {!habits.length ? <div className="rounded-3xl border border-dashed border-[#c9c9bf] p-8 text-center"><p className="text-lg font-medium">Your first small action starts here.</p><p className="mt-2 text-sm text-[#72766c]">Create a habit through the API to see it on your daily list.</p></div> : <div className="space-y-3">{habits.map((habit, i) => <article key={habit.id} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm"><div className="text-sm font-medium text-[#86917b]">{String(i + 1).padStart(2, '0')}</div><div className="min-w-0 flex-1"><h3 className="font-medium">{habit.target_action}</h3><p className="mt-1 text-sm text-[#777b72]">{habit.cue_type === 'STACK' ? `After ${habit.cue_trigger}` : `${habit.cue_trigger}${habit.location ? ` · ${habit.location}` : ''}`}</p></div><button onClick={() => complete(habit)} disabled={done.includes(habit.id)} className="rounded-full bg-[#202820] px-5 py-3 text-sm text-white transition hover:bg-[#495545] disabled:bg-[#dfe8d6] disabled:text-[#58664f]">{done.includes(habit.id) ? 'Counted ✓' : 'I did it'}</button></article>)}</div>}
      </section>
      <p aria-live="polite" className="mt-5 min-h-6 text-center text-sm text-[#58664f]">{message}</p>
      <footer className="mt-14 border-t border-[#deddd4] py-6 text-xs text-[#85877e]">Consistency over intensity. One small action is a vote.</footer>
    </div>
  </main>;
}
