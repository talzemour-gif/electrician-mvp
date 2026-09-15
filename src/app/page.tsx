'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export default function HomePage() {
  const [stats, setStats] = useState<{ customers: number; appointments: number; jobs: number } | null>(null);
  const [error, setError] = useState(false);
  async function load() {
    setError(false);
    try {
      const db = getSupabase();
      const results = await Promise.all([
        db.from('customers').select('id', { count: 'exact', head: true }),
        db.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'scheduled').gte('starts_at', new Date().toISOString()),
        db.from('job_types').select('id', { count: 'exact', head: true }).eq('active', true),
      ]);
      if (results.some(r => r.error)) throw new Error('Unable to load dashboard');
      setStats({ customers: results[0].count ?? 0, appointments: results[1].count ?? 0, jobs: results[2].count ?? 0 });
    } catch { setError(true); }
  }
  useEffect(() => { void load(); }, []);
  return <>
    <div className="topline"><div><h1>דשבורד</h1><div className="sub">תמונת מצב של העסק</div></div></div>
    {error ? <p className="error" role="alert">לא ניתן לטעון את הנתונים. <button className="btn" onClick={load}>נסה שוב</button></p> : !stats ? <p role="status">טוען נתונים…</p> : <div className="grid">
      <Link className="card" href="/customers"><div className="muted">לקוחות</div><div className="stat">{stats.customers}</div></Link>
      <Link className="card" href="/calendar"><div className="muted">פגישות עתידיות</div><div className="stat">{stats.appointments}</div></Link>
      <Link className="card" href="/pricing"><div className="muted">סוגי עבודות פעילים</div><div className="stat">{stats.jobs}</div></Link>
    </div>}
    <div className="card" style={{ marginTop: 16 }}><h2 className="section-title">מתחילים לעבוד</h2><p>הוסיפו לקוחות ועדכנו את המחירון. ניהול פגישות ביומן יתווסף בשלב הבא.</p></div>
  </>;
}
