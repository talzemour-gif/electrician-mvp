'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
const DayRouteMap = dynamic(() => import('@/components/day-route-map'), { ssr: false });

type DashboardAppointment = {
  id: string; starts_at: string; status: 'scheduled' | 'completed' | 'cancelled';
  customers: { full_name: string } | null;
  customer_addresses: { address: string; city: string | null; latitude: number | null; longitude: number | null } | null;
};
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
const displayDate = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long' });
const displayTime = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function israelDate(iso: string) {
  const values = Object.fromEntries(dateParts.formatToParts(new Date(iso)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default function HomePage() {
  const [stats, setStats] = useState<{ customers: number; appointments: number; jobs: number } | null>(null);
  const [appointments, setAppointments] = useState<DashboardAppointment[]>([]);
  const [error, setError] = useState(false);
  async function load() {
    setError(false);
    try {
      const db = getSupabase();
      const results = await Promise.all([
        db.from('customers').select('id', { count: 'exact', head: true }),
        db.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
        db.from('job_types').select('id', { count: 'exact', head: true }).eq('active', true),
        db.from('appointments').select('id,starts_at,status,customers(full_name),customer_addresses(address,city,latitude,longitude)').eq('status', 'scheduled').order('starts_at'),
      ]);
      if (results.some(result => result.error)) throw new Error('Unable to load dashboard');
      setStats({ customers: results[0].count ?? 0, appointments: results[1].count ?? 0, jobs: results[2].count ?? 0 });
      setAppointments((results[3].data ?? []) as unknown as DashboardAppointment[]);
    } catch { setError(true); }
  }
  useEffect(() => { void load(); }, []);
  const routeDay = useMemo(() => {
    const today = israelDate(new Date().toISOString());
    const todayAppointments = appointments.filter(item => israelDate(item.starts_at) === today);
    if (todayAppointments.length) return { date: today, appointments: todayAppointments };
    const next = appointments.find(item => israelDate(item.starts_at) > today);
    if (!next) return null;
    const date = israelDate(next.starts_at);
    return { date, appointments: appointments.filter(item => israelDate(item.starts_at) === date) };
  }, [appointments]);
  const routeStops = (routeDay?.appointments ?? []).filter(item => item.customer_addresses).map(item => ({
    id: item.id,
    customer: item.customers?.full_name ?? 'לקוח לא ידוע',
    address: `${item.customer_addresses!.address}${item.customer_addresses!.city ? `, ${item.customer_addresses!.city}` : ''}`,
    city: item.customer_addresses!.city ?? '',
    latitude: item.customer_addresses!.latitude,
    longitude: item.customer_addresses!.longitude,
    time: displayTime.format(new Date(item.starts_at)),
  }));
  return <>
    <div className="topline"><div><h1>דשבורד</h1><div className="sub">תמונת מצב של העסק</div></div></div>
    {error ? <p className="error" role="alert">לא ניתן לטעון את הנתונים. <button className="btn" onClick={load}>נסה שוב</button></p> : !stats ? <p role="status">טוען נתונים…</p> : <>
      <div className="grid">
        <Link className="card" href="/customers"><div className="muted">לקוחות</div><div className="stat">{stats.customers}</div></Link>
        <Link className="card" href="/calendar"><div className="muted">פגישות פתוחות</div><div className="stat">{stats.appointments}</div></Link>
        <Link className="card" href="/pricing"><div className="muted">סוגי עבודות פעילים</div><div className="stat">{stats.jobs}</div></Link>
      </div>
      <section className="dashboard-route">
        <div className="section-heading"><h2>{routeDay ? `מסלול ל${displayDate.format(new Date(`${routeDay.date}T12:00:00Z`))}` : 'המסלול הבא'}</h2><span className="count-pill">{routeStops.length}</span></div>
        {routeDay ? <DayRouteMap stops={routeStops} /> : <div className="card empty-state">אין פגישות פתוחות להצגה.</div>}
      </section>
    </>}
    <div className="card capabilities-card"><h2 className="section-title">מה אפשר לעשות במערכת</h2><ul><li>ניהול לקוחות, הערות ומספר כתובות מאומתות במפה</li><li>יצירה, חיפוש, עדכון וביטול פגישות</li><li>תצוגות רשימה, יום ושבוע עם מסלול נסיעה יומי</li><li>ניהול מחירון, משך עבודה והערות לכל שירות</li><li>גישה מאובטחת לצוות ממחשב ומטלפון</li></ul></div>
  </>;
}
