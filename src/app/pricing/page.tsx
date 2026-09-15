'use client';
import { useEffect, useRef, useState } from 'react';
import { getSupabase, type JobType } from '@/lib/supabase';
import { FieldError, SaveError } from '@/components/form-feedback';

const empty = { name: '', price: '', duration: '60', notes: '' };
export default function PricingPage() {
  const [jobs, setJobs] = useState<JobType[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  async function load() {
    setLoading(true); setError('');
    try {
      const { data, error } = await getSupabase().from('job_types').select('id,name,default_price,default_duration_minutes,description').eq('active', true).order('name');
      if (error) throw error;
      setJobs(data ?? []);
    } catch { setError('טעינת המחירון נכשלה. נסו שוב.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return;
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'יש להזין שם עבודה.';
    if (form.price === '' || !Number.isFinite(Number(form.price)) || Number(form.price) < 0) nextErrors.price = 'יש להזין מחיר תקין.';
    if (!Number.isInteger(Number(form.duration)) || Number(form.duration) <= 0) nextErrors.duration = 'יש להזין משך בדקות שלמות.';
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); setFormError('לא ניתן לשמור. תקנו את השדות המסומנים.'); return; }
    lock.current = true; setSaving(true); setError(''); setFormError(''); setFieldErrors({}); setMessage('');
    try {
      const values = { name: form.name.trim(), default_price: Number(form.price), default_duration_minutes: Number(form.duration), description: form.notes.trim() || null };
      const query = editing ? getSupabase().from('job_types').update(values).eq('id', editing) : getSupabase().from('job_types').insert(values);
      const { error } = await query.select('id').single();
      if (error) throw error;
      setShow(false); setEditing(null); setForm(empty); setMessage('סוג העבודה נשמר בהצלחה.'); await load();
    } catch { setFormError('השמירה נכשלה. ודאו שהשם אינו קיים כבר ונסו שוב.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <>
    <div className="topline"><div><h1>מחירון</h1><div className="sub">סוגי עבודות, מחיר וזמן ברירת מחדל</div></div><button className="btn btn-primary" disabled={saving} onClick={() => { setEditing(null); setForm(empty); setShow(true); setMessage(''); setFormError(''); setFieldErrors({}); }}>+ סוג עבודה</button></div>
    {error && <p role="alert" className="error">{error} <button className="btn" disabled={loading} onClick={load}>טען מחדש</button></p>}
    {message && <p role="status" className="success">{message}</p>}
    {show && <form noValidate className="card" style={{ marginBottom: 16 }} onSubmit={save}>
      <h2 className="section-title">{editing ? 'עריכת סוג עבודה' : 'סוג עבודה חדש'}</h2>
      <fieldset className="form-grid" disabled={saving}>
        <label>שם העבודה<input className="input" aria-invalid={!!fieldErrors.name} required value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setFieldErrors(current => ({ ...current, name: '' })); setFormError(''); }} /><FieldError message={fieldErrors.name} /></label>
        <label>מחיר בש״ח<input className="input" aria-invalid={!!fieldErrors.price} type="number" min="0" max="99999999.99" step="0.01" required value={form.price} onChange={e => { setForm({ ...form, price: e.target.value }); setFieldErrors(current => ({ ...current, price: '' })); setFormError(''); }} /><FieldError message={fieldErrors.price} /></label>
        <label>משך בדקות<input className="input" aria-invalid={!!fieldErrors.duration} type="number" min="1" step="1" required value={form.duration} onChange={e => { setForm({ ...form, duration: e.target.value }); setFieldErrors(current => ({ ...current, duration: '' })); setFormError(''); }} /><FieldError message={fieldErrors.duration} /></label>
        <label className="full">הערות<textarea className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
      </fieldset>
      <div className="toolbar form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'שומר…' : 'שמור'}</button><SaveError message={formError} /><button className="btn" type="button" disabled={saving} onClick={() => { setShow(false); setFormError(''); setFieldErrors({}); }}>ביטול</button></div>
    </form>}
    <div className="card">{loading ? <p role="status">טוען מחירון…</p> : !jobs.length ? <p>עדיין אין סוגי עבודות.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>סוג עבודה</th><th>מחיר</th><th>משך רגיל</th><th>הערות</th><th>פעולות</th></tr></thead><tbody>{jobs.map(j => <tr key={j.id}><td data-label="סוג עבודה"><strong>{j.name}</strong></td><td data-label="מחיר">{new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(j.default_price)}</td><td data-label="משך רגיל">{j.default_duration_minutes} דקות</td><td data-label="הערות" style={{ whiteSpace: 'pre-wrap' }}>{j.description || '—'}</td><td data-label="פעולות"><button className="btn" disabled={saving} onClick={() => { setEditing(j.id); setForm({ name: j.name, price: String(j.default_price), duration: String(j.default_duration_minutes), notes: j.description ?? '' }); setShow(true); setMessage(''); setFormError(''); setFieldErrors({}); }}>עריכה</button></td></tr>)}</tbody></table></div>}</div>
  </>;
}
