'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getSupabase, type JobType } from '@/lib/supabase';
import { FieldError, SaveError } from '@/components/form-feedback';
const DayRouteMap = dynamic(() => import('@/components/day-route-map'), { ssr: false });
const AddressVerification = dynamic(() => import('@/components/address-verification'), { ssr: false });

type CalendarCustomer = { id: string; full_name: string; phone: string; updated_at: string; customer_addresses: { id: string; label: string; address: string; city: string | null; latitude: number | null; longitude: number | null }[] };
type Appointment = {
  id: string; organization_id: string; customer_id: string; customer_address_id: string; job_type_id: string; starts_at: string; duration_minutes: number; price: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'; payment_status: 'unpaid' | 'partially_paid' | 'paid'; notes: string | null; cancellation_reason: string | null;
  started_at: string | null; completed_at: string | null;
  appointment_notes: { id: string; note_type: 'research' | 'meeting_summary'; body: string | null; use_in_final_report: boolean; created_at: string; appointment_note_attachments: { id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number }[] }[];
  customers: { full_name: string; phone: string } | null;
  customer_addresses: { label: string; address: string; city: string | null; latitude: number | null; longitude: number | null } | null;
  job_types: { name: string } | null;
};
type CalendarView = 'agenda' | 'day' | 'week';
const emptyForm = { customerId: '', addressId: '', jobTypeId: '', date: '', time: '', duration: '', price: '', paymentStatus: 'unpaid' as Appointment['payment_status'], notes: '' };
const paymentLabels: Record<Appointment['payment_status'], string> = { unpaid: 'לא שולם', partially_paid: 'שולם חלקית', paid: 'שולם' };
const dateFormatter = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const partsFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const mimeByExtension: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const supportedMimes = new Set(Object.values(mimeByExtension));
function normalizedMime(file: File) { return file.type.toLowerCase() || mimeByExtension[file.name.split('.').pop()?.toLowerCase() ?? ''] || ''; }

function partsAt(date: Date) {
  return Object.fromEntries(partsFormatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}
function israelLocalToIso(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = timeValue.split(':').map(Number);
  const desiredUtcShape = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = desiredUtcShape;
  for (let index = 0; index < 2; index += 1) {
    const local = partsAt(new Date(instant));
    const displayedUtcShape = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    instant -= displayedUtcShape - desiredUtcShape;
  }
  const roundTrip = partsAt(new Date(instant));
  if (roundTrip.year !== year || roundTrip.month !== month || roundTrip.day !== day || roundTrip.hour !== hour || roundTrip.minute !== minute) throw new Error('Invalid Israel local time');
  return new Date(instant).toISOString();
}
function israelInputValues(iso: string) {
  const value = partsAt(new Date(iso));
  const pad = (part: number) => String(part).padStart(2, '0');
  return { date: `${value.year}-${pad(value.month)}-${pad(value.day)}`, time: `${pad(value.hour)}:${pad(value.minute)}` };
}
function addDays(dateValue: string, amount: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}
function weekStartFor(dateValue: string) {
  const weekday = new Date(`${dateValue}T12:00:00Z`).getUTCDay();
  return addDays(dateValue, -weekday);
}

function AppointmentCard({ appointment, attachmentUrls, onEdit, onCancel, onStatus, onAddNote, onPayment }: { appointment: Appointment; attachmentUrls: Record<string, string>; onEdit: (appointment: Appointment) => void; onCancel: (appointment: Appointment) => void; onStatus: (appointment: Appointment) => void; onAddNote: (appointment: Appointment) => void; onPayment: (appointment: Appointment, paymentStatus: Appointment['payment_status']) => void }) {
  const start = new Date(appointment.starts_at);
  const status = appointment.status === 'scheduled' ? 'מתוכננת' : appointment.status === 'in_progress' ? 'בתהליך' : appointment.status === 'completed' ? 'הושלמה' : 'בוטלה';
  const sortedNotes = [...appointment.appointment_notes].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return <article className="appointment-card">
    <div className="appointment-time"><strong>{timeFormatter.format(start)}</strong><span>{dateFormatter.format(start)}</span></div>
    <div className="appointment-main"><div className="appointment-title"><strong>{appointment.customers?.full_name ?? 'לקוח לא ידוע'}</strong><span className={`status status-${appointment.status}`}>{status}</span></div><div>{appointment.job_types?.name ?? 'סוג עבודה לא הוגדר'} · {appointment.duration_minutes} דקות</div>{appointment.customer_addresses && <div className="muted">{appointment.customer_addresses.label}: {appointment.customer_addresses.address}{appointment.customer_addresses.city ? `, ${appointment.customer_addresses.city}` : ''}</div>}{appointment.started_at && <div className="workflow-time">התחילה: {new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date(appointment.started_at))}</div>}{appointment.completed_at && <div className="workflow-time">הושלמה: {new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date(appointment.completed_at))}</div>}{appointment.notes && <div className="appointment-notes">{appointment.notes}</div>}{sortedNotes.length > 0 && <div className="appointment-note-list">{sortedNotes.map(note => <div key={note.id}><div className="note-meta"><span>{note.note_type === 'research' ? 'מחקר' : 'סיכום פגישה'}</span><time>{new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date(note.created_at))}</time>{note.use_in_final_report && <strong>לשימוש בדוח הסופי</strong>}</div>{note.body && <p>{note.body}</p>}{note.appointment_note_attachments.length > 0 && <div className="note-attachments">{note.appointment_note_attachments.map(file => { const url = attachmentUrls[file.storage_path]; return file.mime_type.startsWith('image/') && url ? <a key={file.id} href={url} target="_blank" rel="noreferrer"><img src={url} alt={file.file_name} /></a> : file.mime_type.startsWith('video/') && url ? <video key={file.id} controls preload="metadata" src={url} /> : <a className="attachment-link" key={file.id} href={url || '#'} target="_blank" rel="noreferrer">{file.file_name}</a>; })}</div>}</div>)}</div>}{appointment.status === 'cancelled' && appointment.cancellation_reason && <div className="cancellation-reason"><strong>סיבת ביטול:</strong> {appointment.cancellation_reason}</div>}</div>
    <div className="appointment-side"><div className="appointment-price">{new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(appointment.price)}</div>{appointment.status !== 'cancelled' && <><label className="payment-control">תשלום<select className="input" aria-label={`מצב תשלום עבור ${appointment.customers?.full_name ?? 'הפגישה'}`} value={appointment.payment_status} onChange={e => onPayment(appointment, e.target.value as Appointment['payment_status'])}>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="appointment-actions">{appointment.status === 'scheduled' && <><button className="btn" onClick={() => onEdit(appointment)}>עריכה</button><button className="btn btn-primary" onClick={() => onStatus(appointment)}>התחלת פגישה</button></>}{appointment.status === 'in_progress' && <button className="btn btn-primary" onClick={() => onStatus(appointment)}>סיום פגישה</button>}<button className="btn" onClick={() => onAddNote(appointment)}>+ הערה</button>{appointment.status === 'scheduled' && <button className="link-button danger-text" onClick={() => onCancel(appointment)}>ביטול פגישה</button>}</div></>}</div>
  </article>;
}

export default function CalendarPage() {
  const [customers, setCustomers] = useState<CalendarCustomer[]>([]);
  const [jobs, setJobs] = useState<JobType[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [noteAppointment, setNoteAppointment] = useState<Appointment | null>(null);
  const [noteType, setNoteType] = useState<'research' | 'meeting_summary'>('research');
  const [noteBody, setNoteBody] = useState('');
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const [noteUseInReport, setNoteUseInReport] = useState(false);
  const [noteMode, setNoteMode] = useState<'note' | 'completion'>('note');
  const [noteError, setNoteError] = useState('');
  const [noteFileError, setNoteFileError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState({ label: '', address: '', city: '', latitude: null as number | null, longitude: null as number | null });
  const [show, setShow] = useState(false);
  const [calendarView, setCalendarView] = useState<CalendarView>('agenda');
  const [focusDate, setFocusDate] = useState(() => israelInputValues(new Date().toISOString()).date);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const db = getSupabase();
      const [customerResult, jobResult, appointmentResult] = await Promise.all([
        db.from('customers').select('id,full_name,phone,updated_at,customer_addresses!address_customer_organization_fk(id,label,address,city,latitude,longitude)').order('updated_at', { ascending: false }),
        db.from('job_types').select('id,name,default_price,default_duration_minutes,description').eq('active', true).order('name'),
        db.from('appointments').select('id,organization_id,customer_id,customer_address_id,job_type_id,starts_at,duration_minutes,price,status,payment_status,notes,cancellation_reason,started_at,completed_at,customers!appointment_customer_organization_fk(full_name,phone),customer_addresses!appointment_address_customer_organization_fk(label,address,city,latitude,longitude),job_types!appointment_job_organization_fk(name),appointment_notes!appointment_notes_appointment_organization_fk(id,note_type,body,use_in_final_report,created_at,appointment_note_attachments!note_attachments_note_organization_fk(id,storage_path,file_name,mime_type,size_bytes))').order('starts_at'),
      ]);
      if (customerResult.error || jobResult.error || appointmentResult.error) throw new Error('Load failed');
      setCustomers((customerResult.data ?? []) as CalendarCustomer[]);
      setJobs((jobResult.data ?? []) as JobType[]);
      const loadedAppointments = (appointmentResult.data ?? []) as unknown as Appointment[];
      setAppointments(loadedAppointments);
      const paths = loadedAppointments.flatMap(item => item.appointment_notes.flatMap(note => note.appointment_note_attachments.map(file => file.storage_path)));
      if (paths.length) {
        const { data: signed } = await db.storage.from('appointment-files').createSignedUrls(paths, 3600);
        setAttachmentUrls(Object.fromEntries((signed ?? []).filter(item => item.signedUrl).map(item => [item.path, item.signedUrl])));
      } else setAttachmentUrls({});
    } catch { setError('לא ניתן לטעון את היומן. בדקו את החיבור ונסו שוב.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') openCreate();
  }, []);
  const selectedCustomer = customers.find(customer => customer.id === form.customerId);
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return (query ? customers.filter(customer => `${customer.full_name} ${customer.phone}`.toLowerCase().includes(query)) : customers.slice(0, 5)).slice(0, 10);
  }, [customers, customerSearch]);
  const todayInIsrael = israelInputValues(new Date().toISOString()).date;
  const [now] = useState(() => Date.now());
  const upcoming = useMemo(() => appointments.filter(item => item.status === 'in_progress' || (item.status === 'scheduled' && new Date(item.starts_at).getTime() >= now)), [appointments, now]);
  const history = useMemo(() => appointments.filter(item => item.status === 'completed' || item.status === 'cancelled' || (item.status === 'scheduled' && new Date(item.starts_at).getTime() < now)).sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()), [appointments, now]);
  const weekStart = weekStartFor(focusDate);
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const appointmentsOn = (date: string) => appointments.filter(item => israelInputValues(item.starts_at).date === date);
  const dayAppointments = appointmentsOn(focusDate).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const dayRouteStops = dayAppointments.filter(item => item.status !== 'cancelled' && item.customer_addresses).map(item => ({
    id: item.id,
    customer: item.customers?.full_name ?? 'לקוח לא ידוע',
    address: `${item.customer_addresses!.address}${item.customer_addresses!.city ? `, ${item.customer_addresses!.city}` : ''}`,
    city: item.customer_addresses!.city ?? '',
    latitude: item.customer_addresses!.latitude,
    longitude: item.customer_addresses!.longitude,
    time: timeFormatter.format(new Date(item.starts_at)),
  }));

  function selectCustomer(customerId: string) {
    const customer = customers.find(item => item.id === customerId);
    setForm(current => ({ ...current, customerId, addressId: customer?.customer_addresses[0]?.id ?? '' }));
    setCustomerSearch(''); setCustomerPickerOpen(false);
    setFieldErrors(current => ({ ...current, customer: '', address: '' })); setFormError('');
  }
  function selectJob(jobTypeId: string) {
    const job = jobs.find(item => item.id === jobTypeId);
    setForm(current => ({ ...current, jobTypeId, duration: job ? String(job.default_duration_minutes) : '', price: job ? String(job.default_price) : '' }));
    setFieldErrors(current => ({ ...current, jobType: '', duration: '', price: '' })); setFormError('');
  }
  function openCreate() {
    setEditing(null); setConfirmCancel(null); setShowAddressForm(false); setAddressForm({ label: '', address: '', city: '', latitude: null, longitude: null });
    setCustomerSearch(''); setCustomerPickerOpen(false); setForm(emptyForm); setShow(true); setMessage(''); setError(''); setFormError(''); setFieldErrors({});
  }
  function openEdit(appointment: Appointment) {
    const local = israelInputValues(appointment.starts_at);
    setEditing(appointment); setConfirmCancel(null); setShowAddressForm(false); setCustomerSearch('');
    setForm({ customerId: appointment.customer_id, addressId: appointment.customer_address_id, jobTypeId: appointment.job_type_id, date: local.date, time: local.time, duration: String(appointment.duration_minutes), price: String(appointment.price), paymentStatus: appointment.payment_status, notes: appointment.notes ?? '' });
    setShow(true); setMessage(''); setError(''); setFormError(''); setFieldErrors({});
  }
  async function saveAddress() {
    if (!form.customerId || saveLock.current) return;
    const nextErrors: Record<string, string> = {};
    if (!addressForm.city.trim()) nextErrors.modalCity = 'יש להזין עיר.';
    if (!addressForm.address.trim()) nextErrors.modalAddress = 'יש להזין כתובת.';
    if (addressForm.latitude === null || addressForm.longitude === null) nextErrors.modalLocation = 'יש לאמת את הכתובת או לסמן מיקום במפה.';
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); setFormError('לא ניתן לשמור. תקנו את השדות המסומנים.'); return; }
    saveLock.current = true; setSaving(true); setError(''); setFormError(''); setFieldErrors({});
    try {
      const { data, error } = await getSupabase().from('customer_addresses').insert({ customer_id: form.customerId, label: addressForm.label.trim() || 'כתובת', address: addressForm.address.trim(), city: addressForm.city.trim(), latitude: addressForm.latitude, longitude: addressForm.longitude, is_default: !selectedCustomer?.customer_addresses.length }).select('id').single();
      if (error) throw error;
      setForm(current => ({ ...current, addressId: data.id })); setShowAddressForm(false); setAddressForm({ label: '', address: '', city: '', latitude: null, longitude: null });
      setMessage('הכתובת נוספה ללקוח ונבחרה לפגישה.'); await load();
    } catch { setFormError('הוספת הכתובת נכשלה. בדקו את הפרטים ונסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function cancelAppointment() {
    if (!confirmCancel || saveLock.current) return;
    saveLock.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const { error } = await getSupabase().from('appointments').update({ status: 'cancelled', cancellation_reason: cancelReason.trim() || null }).eq('id', confirmCancel.id).eq('status', 'scheduled').select('id').single();
      if (error) throw error;
      setConfirmCancel(null); setCancelReason(''); setMessage('הפגישה בוטלה.'); await load();
    } catch { setError('ביטול הפגישה נכשל. נסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function advanceAppointment(appointment: Appointment) {
    if (saveLock.current || (appointment.status !== 'scheduled' && appointment.status !== 'in_progress')) return;
    if (appointment.status === 'in_progress') { openCompletion(appointment); return; }
    const nextStatus = appointment.status === 'scheduled' ? 'in_progress' : 'completed';
    const nowIso = new Date().toISOString();
    saveLock.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const values = nextStatus === 'in_progress'
        ? { status: nextStatus, started_at: nowIso }
        : { status: nextStatus, completed_at: nowIso };
      const { error } = await getSupabase().from('appointments').update(values).eq('id', appointment.id).eq('status', appointment.status).select('id').single();
      if (error) throw error;
      setMessage(nextStatus === 'in_progress' ? 'הפגישה סומנה כפעילה.' : 'הפגישה הושלמה.');
      await load();
    } catch { setError('עדכון מצב הפגישה נכשל. רעננו ונסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  function openNote(appointment: Appointment) {
    setNoteAppointment(appointment); setNoteMode('note'); setNoteType('research'); setNoteBody(''); setNoteFiles([]); setNoteUseInReport(false); setNoteError(''); setNoteFileError(''); setUploadProgress(''); setMessage('');
  }
  function openCompletion(appointment: Appointment) {
    setNoteAppointment(appointment); setNoteMode('completion'); setNoteType('meeting_summary'); setNoteBody(''); setNoteFiles([]); setNoteUseInReport(false); setNoteError(''); setNoteFileError(''); setUploadProgress(''); setMessage('');
  }
  async function completeAppointment(appointment: Appointment) {
    const { error } = await getSupabase().from('appointments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', appointment.id).eq('status', 'in_progress').select('id').single();
    if (error) throw error;
  }
  async function completeWithoutNote() {
    if (!noteAppointment || saveLock.current) return;
    saveLock.current = true; setSaving(true); setNoteError('');
    try {
      await completeAppointment(noteAppointment);
      setNoteAppointment(null); setMessage('הפגישה הושלמה.'); await load();
    } catch { setNoteError('סיום הפגישה נכשל. רעננו ונסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  function selectNoteFiles(files: File[]) {
    setNoteFiles(files); setNoteError(''); setNoteFileError('');
    if (files.length > 5) { setNoteFileError('אפשר לצרף עד 5 קבצים להערה.'); setNoteError('לא ניתן לשמור. בדקו את הקבצים המצורפים.'); return; }
    const oversized = files.find(file => file.size > 50 * 1024 * 1024);
    if (oversized) { setNoteFileError(`הקובץ ${oversized.name} גדול מ־50 MB.`); setNoteError('לא ניתן לשמור. בדקו את הקבצים המצורפים.'); return; }
    const unsupported = files.find(file => !supportedMimes.has(normalizedMime(file)));
    if (unsupported) { setNoteFileError(`סוג הקובץ ${unsupported.name} אינו נתמך.`); setNoteError('לא ניתן לשמור. בדקו את הקבצים המצורפים.'); }
  }
  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteAppointment || saveLock.current) return;
    if (!noteBody.trim() && !noteFiles.length) { setNoteError('יש לכתוב הערה או לצרף קובץ אחד לפחות.'); return; }
    if (noteFiles.length > 5) { setNoteFileError('אפשר לצרף עד 5 קבצים להערה.'); setNoteError('לא ניתן לשמור. בדקו את הקבצים המצורפים.'); return; }
    if (noteFiles.some(file => file.size > 50 * 1024 * 1024)) { setNoteFileError('כל קובץ חייב להיות קטן מ־50 MB.'); setNoteError('לא ניתן לשמור. בדקו את הקבצים המצורפים.'); return; }
    const unsupported = noteFiles.find(file => !supportedMimes.has(normalizedMime(file)));
    if (unsupported) { setNoteFileError(`סוג הקובץ ${unsupported.name} אינו נתמך.`); setNoteError('לא ניתן לשמור. בדקו את הקבצים המצורפים.'); return; }
    saveLock.current = true; setSaving(true); setNoteError(''); setNoteFileError(''); setUploadProgress(''); setError('');
    try {
      const db = getSupabase();
      const noteId = crypto.randomUUID();
      const attachments: { note_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number }[] = [];
      for (const file of noteFiles) {
        setUploadProgress(`מעלה ${attachments.length + 1} מתוך ${noteFiles.length}: ${file.name}`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
        const storagePath = `${noteAppointment.organization_id}/${noteAppointment.id}/${noteId}/${crypto.randomUUID()}-${safeName}`;
        const mimeType = normalizedMime(file);
        const { error: uploadError } = await db.storage.from('appointment-files').upload(storagePath, file, { contentType: mimeType, upsert: false });
        if (uploadError) throw new Error(`UPLOAD:${file.name}`);
        attachments.push({ note_id: noteId, storage_path: storagePath, file_name: file.name, mime_type: mimeType, size_bytes: file.size });
      }
      const { error } = await db.from('appointment_notes').insert({ id: noteId, appointment_id: noteAppointment.id, note_type: noteType, body: noteBody.trim() || null, use_in_final_report: noteUseInReport }).select('id').single();
      if (error) throw new Error('NOTE');
      if (attachments.length) { const { error: attachmentError } = await db.from('appointment_note_attachments').insert(attachments); if (attachmentError) throw new Error('METADATA'); }
      if (noteMode === 'completion') await completeAppointment(noteAppointment);
      setNoteAppointment(null); setNoteBody(''); setNoteFiles([]); setUploadProgress(''); setMessage(noteMode === 'completion' ? 'הפגישה הושלמה וההערה נשמרה.' : 'ההערה נוספה לפגישה.');
      await load();
    } catch (caught) { const message = caught instanceof Error && caught.message.startsWith('UPLOAD:') ? `העלאת הקובץ ${caught.message.slice(7)} נכשלה. בדקו את החיבור או נסו תמונה קטנה יותר.` : 'שמירת ההערה נכשלה. ההערה לא נוספה; בדקו את החיבור ונסו שוב.'; setUploadProgress(''); setNoteFileError(message); setNoteError(message); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function saveAppointment(e: React.FormEvent) {
    e.preventDefault(); if (saveLock.current) return;
    const nextErrors: Record<string, string> = {};
    if (!form.customerId) nextErrors.customer = 'יש לבחור לקוח.';
    if (!form.addressId) nextErrors.address = 'יש לבחור כתובת.';
    if (!form.jobTypeId) nextErrors.jobType = 'יש לבחור סוג עבודה.';
    if (!form.date) nextErrors.date = 'יש לבחור תאריך.';
    if (!form.time) nextErrors.time = 'יש לבחור שעה.';
    if (!Number.isInteger(Number(form.duration)) || Number(form.duration) <= 0) nextErrors.duration = 'יש להזין משך בדקות שלמות.';
    if (form.price === '' || !Number.isFinite(Number(form.price)) || Number(form.price) < 0) nextErrors.price = 'יש להזין מחיר תקין.';
    if (form.date && form.time) {
      try { if (new Date(israelLocalToIso(form.date, form.time)).getTime() <= Date.now()) { nextErrors.date = 'מועד הפגישה חייב להיות בעתיד.'; nextErrors.time = 'מועד הפגישה חייב להיות בעתיד.'; } }
      catch { nextErrors.date = 'התאריך והשעה אינם תקינים.'; nextErrors.time = 'בחרו שעה אחרת לפי שעון ישראל.'; }
    }
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); setFormError('לא ניתן לשמור. תקנו את השדות המסומנים.'); return; }
    saveLock.current = true; setSaving(true); setError(''); setFormError(''); setFieldErrors({}); setMessage('');
    try {
      const startsAt = israelLocalToIso(form.date, form.time);
      if (new Date(startsAt).getTime() <= Date.now()) throw new Error('Past appointment');
      const values = { customer_id: form.customerId, customer_address_id: form.addressId, job_type_id: form.jobTypeId, starts_at: startsAt, duration_minutes: Number(form.duration), price: Number(form.price), payment_status: form.paymentStatus, notes: form.notes.trim() || null };
      const query = editing ? getSupabase().from('appointments').update(values).eq('id', editing.id).eq('status', 'scheduled') : getSupabase().from('appointments').insert({ ...values, status: 'scheduled' });
      const { error } = await query.select('id').single();
      if (error) throw error;
      setForm(emptyForm); setEditing(null); setShow(false); setMessage(editing ? 'הפגישה עודכנה בהצלחה.' : 'הפגישה נשמרה בהצלחה.'); await load();
    } catch { setFormError('שמירת הפגישה נכשלה. בדקו את הפרטים והחיבור ונסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }

  async function updatePayment(appointment: Appointment, paymentStatus: Appointment['payment_status']) {
    if (saveLock.current || paymentStatus === appointment.payment_status) return;
    saveLock.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const { error } = await getSupabase().from('appointments').update({ payment_status: paymentStatus }).eq('id', appointment.id).select('id').single();
      if (error) throw error;
      setMessage('מצב התשלום עודכן.'); await load();
    } catch { setError('עדכון מצב התשלום נכשל. נסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }

  return <>
    <div className="topline"><div><h1>יומן</h1><div className="sub">יצירה וצפייה בפגישות לפי שעון ישראל</div></div><button className="btn btn-primary" disabled={saving} onClick={openCreate}>+ פגישה חדשה</button></div>
    {error && <p className="error" role="alert">{error} <button className="btn" disabled={loading} onClick={load}>טען מחדש</button></p>}
    {message && <p className="success" role="status">{message}</p>}
    {show && <form noValidate className="card appointment-form" onSubmit={saveAppointment}><h2 className="section-title">{editing ? 'עריכת פגישה' : 'פגישה חדשה'}</h2><fieldset className="form-grid" disabled={saving}>
      <div className="customer-picker full"><label htmlFor="customer-search">לקוח</label>{selectedCustomer && <div className="selected-customer"><span><strong>{selectedCustomer.full_name}</strong><small>{selectedCustomer.phone}</small></span><button className="link-button" type="button" onClick={() => { setForm(current => ({ ...current, customerId: '', addressId: '' })); setCustomerPickerOpen(true); }}>החלפה</button></div>}<input id="customer-search" className="input" aria-invalid={!!fieldErrors.customer} type="search" autoComplete="off" placeholder={selectedCustomer ? 'חיפוש לקוח אחר' : 'בחרו לקוח או הקלידו שם או טלפון'} value={customerSearch} role="combobox" aria-controls="customer-options" aria-expanded={customerPickerOpen} onFocus={() => setCustomerPickerOpen(true)} onKeyDown={e => { if (e.key === 'Escape') setCustomerPickerOpen(false); }} onChange={e => { setCustomerSearch(e.target.value); setCustomerPickerOpen(true); }} />{customerPickerOpen && <div className="customer-options" id="customer-options" role="listbox"><div className="customer-options-title">{customerSearch.trim() ? 'תוצאות חיפוש' : '5 הלקוחות שעודכנו לאחרונה'}</div>{filteredCustomers.length ? filteredCustomers.map(customer => <button type="button" role="option" aria-selected={customer.id === form.customerId} key={customer.id} onClick={() => selectCustomer(customer.id)}><strong>{customer.full_name}</strong><small>{customer.phone}</small></button>) : <div className="customer-empty"><span>לא נמצאו לקוחות מתאימים</span><Link className="btn btn-primary" href="/customers?new=1&returnTo=meeting">+ יצירת לקוח חדש</Link></div>}</div>}<FieldError message={fieldErrors.customer} /></div>
      <label>כתובת<select className="input" aria-invalid={!!fieldErrors.address} required value={form.addressId} disabled={!selectedCustomer?.customer_addresses.length} onChange={e => { setForm({ ...form, addressId: e.target.value }); setFieldErrors(current => ({ ...current, address: '' })); setFormError(''); }}><option value="">{selectedCustomer?.customer_addresses.length ? 'בחרו כתובת' : 'ללקוח אין כתובות'}</option>{selectedCustomer?.customer_addresses.map(address => <option key={address.id} value={address.id}>{address.label} · {address.address}{address.city ? `, ${address.city}` : ''}</option>)}</select><FieldError message={fieldErrors.address} /></label>
      <div className="address-inline-action"><button className="link-button" type="button" disabled={!selectedCustomer} onClick={() => setShowAddressForm(value => !value)}>{showAddressForm ? 'סגירת הוספת כתובת' : '+ הכתובת לא מופיעה? הוספת כתובת'}</button></div>
      <label>סוג עבודה<select className="input" aria-invalid={!!fieldErrors.jobType} required value={form.jobTypeId} onChange={e => selectJob(e.target.value)}><option value="">בחרו סוג עבודה</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.name}</option>)}</select><FieldError message={fieldErrors.jobType} /></label>
      <label>תאריך<input className="input" aria-invalid={!!fieldErrors.date} type="date" min={todayInIsrael} required value={form.date} onChange={e => { setForm({ ...form, date: e.target.value }); setFieldErrors(current => ({ ...current, date: '', time: '' })); setFormError(''); }} /><FieldError message={fieldErrors.date} /></label>
      <label>שעה בישראל<input className="input" aria-invalid={!!fieldErrors.time} type="time" required value={form.time} onChange={e => { setForm({ ...form, time: e.target.value }); setFieldErrors(current => ({ ...current, date: '', time: '' })); setFormError(''); }} /><FieldError message={fieldErrors.time} /></label>
      <label>משך בדקות<input className="input" aria-invalid={!!fieldErrors.duration} type="number" min="1" step="1" required value={form.duration} onChange={e => { setForm({ ...form, duration: e.target.value }); setFieldErrors(current => ({ ...current, duration: '' })); setFormError(''); }} /><FieldError message={fieldErrors.duration} /></label>
      <label>מחיר בש״ח<input className="input" aria-invalid={!!fieldErrors.price} type="number" min="0" max="99999999.99" step="0.01" required value={form.price} onChange={e => { setForm({ ...form, price: e.target.value }); setFieldErrors(current => ({ ...current, price: '' })); setFormError(''); }} /><FieldError message={fieldErrors.price} /></label>
      <label>מצב תשלום<select className="input" value={form.paymentStatus} onChange={e => setForm({ ...form, paymentStatus: e.target.value as Appointment['payment_status'] })}>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="full">הערות לפגישה<textarea className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
    </fieldset>{showAddressForm && selectedCustomer && <div className="modal-backdrop"><section className="inline-address-form modal-card"><h3>כתובת חדשה עבור {selectedCustomer.full_name}</h3><div className="form-grid"><label>שם הכתובת <span className="optional">(אופציונלי)</span><input className="input" value={addressForm.label} onChange={e => setAddressForm({ ...addressForm, label: e.target.value })} /></label><label>עיר<input className="input" aria-invalid={!!fieldErrors.modalCity} required value={addressForm.city} onChange={e => { setAddressForm({ ...addressForm, city: e.target.value, latitude: null, longitude: null }); setFieldErrors(current => ({ ...current, modalCity: '' })); setFormError(''); }} /><FieldError message={fieldErrors.modalCity} /></label><label className="full">כתובת<input className="input" aria-invalid={!!fieldErrors.modalAddress} required value={addressForm.address} onChange={e => { setAddressForm({ ...addressForm, address: e.target.value, latitude: null, longitude: null }); setFieldErrors(current => ({ ...current, modalAddress: '' })); setFormError(''); }} /><FieldError message={fieldErrors.modalAddress} /></label><AddressVerification address={addressForm.address} city={addressForm.city} latitude={addressForm.latitude} longitude={addressForm.longitude} onChange={location => { setAddressForm(current => ({ ...current, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null })); setFieldErrors(current => ({ ...current, modalLocation: '' })); setFormError(''); }} /><FieldError message={fieldErrors.modalLocation} /></div><button className="btn" type="button" disabled={saving} onClick={saveAddress}>שמור ובחר כתובת</button></section></div>}<div className="toolbar form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'שומר…' : editing ? 'שמור שינויים' : 'שמור פגישה'}</button><SaveError message={formError} /><button className="btn" type="button" disabled={saving} onClick={() => { setShow(false); setEditing(null); setFormError(''); setFieldErrors({}); }}>ביטול</button></div></form>}
    {confirmCancel && <section className="card delete-confirm" role="alertdialog" aria-labelledby="cancel-meeting-title"><h2 className="section-title" id="cancel-meeting-title">לבטל את הפגישה עם {confirmCancel.customers?.full_name}?</h2><p>הפגישה תישאר בהיסטוריה עם סטטוס “בוטלה”.</p><label>סיבת ביטול <span className="optional">(אופציונלי)</span><textarea className="input" value={cancelReason} onChange={e => setCancelReason(e.target.value)} /></label><div className="toolbar" style={{ marginTop: 14 }}><button className="btn btn-danger" disabled={saving} onClick={cancelAppointment}>{saving ? 'מבטל…' : 'כן, לבטל פגישה'}</button><button className="btn" disabled={saving} onClick={() => setConfirmCancel(null)}>חזרה</button></div></section>}
    {noteAppointment && <div className="modal-backdrop"><form noValidate className="card modal-card note-form" onSubmit={saveNote} role="dialog" aria-modal="true" aria-labelledby="note-title"><h2 className="section-title" id="note-title">{noteMode === 'completion' ? 'סיום פגישה' : 'הערה לפגישה'} עם {noteAppointment.customers?.full_name}</h2><SaveError message={noteError} />{noteMode === 'completion' && <p className="form-hint">אפשר להוסיף סיכום וקבצים לפני סימון הפגישה כהושלמה, או לסיים ללא הערה.</p>}<label>סוג ההערה<select className="input" value={noteType} onChange={e => setNoteType(e.target.value as 'research' | 'meeting_summary')}><option value="research">מחקר</option><option value="meeting_summary">סיכום פגישה</option></select></label><label>תוכן <span className="optional">(אופציונלי כאשר מצורף קובץ)</span><textarea autoFocus className="input" aria-invalid={!!noteError && !noteFileError} value={noteBody} onChange={e => { setNoteBody(e.target.value); setNoteError(''); }} /></label><label>מסמכים, תמונות או סרטונים קצרים <span className="optional">(עד 5 קבצים, 50 MB לקובץ)</span><input className="input file-input" aria-invalid={!!noteFileError} type="file" multiple accept="image/*,video/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx" onChange={e => selectNoteFiles(Array.from(e.target.files ?? []))} /><FieldError message={noteFileError} /></label>{noteFiles.length > 0 && <div className="file-selection-confirmation" role="status"><strong>{noteFiles.length === 1 ? 'הקובץ נבחר בהצלחה' : `${noteFiles.length} קבצים נבחרו בהצלחה`}</strong><span>כדי להוסיף אותם להערה, לחצו על כפתור השמירה.</span><ul className="selected-files">{noteFiles.map(file => <li key={`${file.name}-${file.lastModified}`}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</li>)}</ul></div>}{uploadProgress && <p className="upload-progress" role="status">{uploadProgress}</p>}<label className="report-checkbox"><input type="checkbox" checked={noteUseInReport} onChange={e => setNoteUseInReport(e.target.checked)} /> להשתמש בהערה ובקבצים בדוח הסופי</label><div className="toolbar form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'שומר…' : noteMode === 'completion' ? 'שמירה וסיום הפגישה' : 'שמירת הערה'}</button>{noteMode === 'completion' && <button className="btn" type="button" disabled={saving} onClick={completeWithoutNote}>סיום ללא הערה</button>}<SaveError message={noteError} /><button className="btn" type="button" disabled={saving} onClick={() => setNoteAppointment(null)}>ביטול</button></div></form></div>}
    <div className="calendar-controls card"><div className="view-tabs">{([['agenda','רשימה'],['day','יום'],['week','שבוע']] as [CalendarView,string][]).map(([value,label]) => <button key={value} className={`view-tab ${calendarView === value ? 'active' : ''}`} onClick={() => setCalendarView(value)}>{label}</button>)}</div>{calendarView !== 'agenda' && <div className="date-navigation"><button className="btn" onClick={() => setFocusDate(addDays(focusDate, calendarView === 'week' ? -7 : -1))}>הקודם</button><button className="btn" onClick={() => setFocusDate(todayInIsrael)}>היום</button><strong>{calendarView === 'day' ? dateFormatter.format(new Date(israelLocalToIso(focusDate, '12:00'))) : `שבוע שמתחיל ${weekStart}`}</strong><button className="btn" onClick={() => setFocusDate(addDays(focusDate, calendarView === 'week' ? 7 : 1))}>הבא</button></div>}</div>
    {loading ? <p role="status">טוען פגישות…</p> : calendarView === 'agenda' ? <div className="calendar-sections">
      <section><div className="section-heading"><h2>פגישות קרובות</h2><span className="count-pill">{upcoming.length}</span></div>{upcoming.length ? <div className="appointment-list">{upcoming.map(item => <AppointmentCard appointment={item} attachmentUrls={attachmentUrls} onEdit={openEdit} onCancel={appointment => { setShow(false); setEditing(null); setConfirmCancel(appointment); setMessage(''); setError(''); }} onStatus={advanceAppointment} onAddNote={openNote} onPayment={updatePayment} key={item.id} />)}</div> : <div className="card empty-state">אין פגישות עתידיות.</div>}</section>
      <section><div className="section-heading"><h2>היסטוריה</h2><span className="count-pill">{history.length}</span></div>{history.length ? <div className="appointment-list">{history.map(item => <AppointmentCard appointment={item} attachmentUrls={attachmentUrls} onEdit={openEdit} onCancel={appointment => { setShow(false); setEditing(null); setConfirmCancel(appointment); setMessage(''); setError(''); }} onStatus={advanceAppointment} onAddNote={openNote} onPayment={updatePayment} key={item.id} />)}</div> : <div className="card empty-state">עדיין אין פגישות קודמות.</div>}</section>
    </div> : calendarView === 'day' ? <section className="day-view"><div><div className="section-heading"><h2>מסלול ליום הנבחר</h2><span className="count-pill">{dayRouteStops.length}</span></div><DayRouteMap stops={dayRouteStops} /></div><div><div className="section-heading"><h2>פגישות ביום הנבחר</h2><span className="count-pill">{dayAppointments.length}</span></div>{dayAppointments.length ? <div className="appointment-list">{dayAppointments.map(item => <AppointmentCard appointment={item} attachmentUrls={attachmentUrls} onEdit={openEdit} onCancel={appointment => { setConfirmCancel(appointment); setCancelReason(''); }} onStatus={advanceAppointment} onAddNote={openNote} onPayment={updatePayment} key={item.id} />)}</div> : <div className="card empty-state">אין פגישות ביום הזה.</div>}</div></section> : <div className="week-grid">{weekDates.map(date => <section className={`week-day ${date === todayInIsrael ? 'today' : ''}`} key={date}><div className="week-day-heading"><strong>{new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(`${date}T12:00:00Z`))}</strong><span className="count-pill">{appointmentsOn(date).length}</span></div>{appointmentsOn(date).length ? appointmentsOn(date).map(item => <button className="week-appointment" key={item.id} onClick={() => item.status === 'scheduled' && openEdit(item)}><strong>{timeFormatter.format(new Date(item.starts_at))}</strong><span>{item.customers?.full_name}</span><small>{item.job_types?.name}</small></button>) : <div className="week-empty">אין פגישות</div>}</section>)}</div>}
  </>;
}
