'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    try {
      const db = getSupabase();
      const { data: { subscription } } = db.auth.onAuthStateChange((_event, next) => {
        if (active) { setAllowed(false); setOrganizationName(''); setLoading(!!next); setSession(next); }
      });
      db.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) { setError('לא ניתן לבדוק את ההתחברות. נסו לרענן.'); setLoading(false); return; }
        setSession(data.session); if (!data.session) setLoading(false);
      }).catch(() => { if (active) { setError('לא ניתן להתחבר. בדקו את חיבור האינטרנט ורעננו.'); setLoading(false); } });
      return () => { active = false; subscription.unsubscribe(); };
    } catch (e) { setError((e as Error).message); setLoading(false); }
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    Promise.resolve(getSupabase().from('organization_members').select('user_id,organizations(name)').eq('user_id', session.user.id).maybeSingle())
      .then(({ data, error }) => {
        if (!active) return;
        setAllowed(!!data && !error);
        const organization = data?.organizations as unknown as { name?: string } | null;
        setOrganizationName(organization?.name ?? '');
        setError(error ? 'לא ניתן לבדוק הרשאות. נסו להתנתק ולהתחבר מחדש.' : '');
        setLoading(false);
      }).catch(() => {
        if (active) { setAllowed(false); setError('בדיקת ההרשאות נכשלה. נסו להתנתק ולהתחבר מחדש.'); setLoading(false); }
      });
    return () => { active = false; };
  }, [session]);
  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError('ההתחברות נכשלה. בדקו את כתובת האימייל והסיסמה.');
      else setPassword('');
    } catch { setError('לא ניתן להתחבר כרגע. נסו שוב.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { const { error } = await getSupabase().auth.signOut(); if (error) setError('ההתנתקות נכשלה. נסו שוב.'); }
    catch { setError('ההתנתקות נכשלה. נסו שוב.'); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status">בודק התחברות…</p>;
  if (!session) return <section className="card auth-card">
    <h1>כניסה למערכת</h1><p className="sub">כניסה מאובטחת לצוות העסק</p>
    <form onSubmit={login} className="auth-form">
      <label>אימייל<input className="input" type="email" dir="ltr" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>סיסמה<input className="input" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'מתחבר…' : 'כניסה'}</button>
    </form>
  </section>;
  return <>
    <div className="session-bar"><span className="workspace-name">{organizationName}</span><span dir="ltr">{session.user.email}</span><button className="btn" disabled={busy} onClick={logout}>התנתקות</button></div>
    {error && <p role="alert" className="error">{error}</p>}
    {allowed ? <div key={session.user.id}>{children}</div> : <div className="card"><h1>נדרשת הרשאת גישה</h1><p>החשבון מחובר, אך עדיין לא נוסף לצוות העסק. יש לפנות למנהל המערכת.</p></div>}
  </>;
}
