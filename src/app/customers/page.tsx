'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase, type Customer } from '@/lib/supabase';
import { FieldError, SaveError } from '@/components/form-feedback';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePermissions } from '@/lib/use-permissions';
const AddressVerification = dynamic(() => import('@/components/address-verification'), { ssr: false });

const emptyForm = { name: '', phone: '', city: '', label: 'בית', address: '', notes: '' };
const emptyAddress = { label: 'בית', address: '', city: '', latitude: null as number | null, longitude: null as number | null };
type AddressDraft = typeof emptyAddress & { key: number };
const newAddressDraft = (): AddressDraft => ({ key: Date.now() + Math.random(), label: '', address: '', city: '', latitude: null, longitude: null });
export default function CustomersPage() {
  const { canDelete } = usePermissions();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [newAddresses, setNewAddresses] = useState<AddressDraft[]>([newAddressDraft()]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [addingAddress, setAddingAddress] = useState<Customer | null>(null);
  const [editingAddress, setEditingAddress] = useState<{ customer: Customer; addressId: string } | null>(null);
  const [confirmDeleteAddress, setConfirmDeleteAddress] = useState<{ customer: Customer; addressId: string; label: string } | null>(null);
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [createdForMeeting, setCreatedForMeeting] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try {
      const { data, error } = await getSupabase().from('customers')
        .select('id, full_name, phone, notes, customer_addresses(id,label,address,city,latitude,longitude), appointments(starts_at,status)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const nextCustomers = data ?? [];
      setCustomers(nextCustomers);
      setEditing(current => current ? nextCustomers.find(customer => customer.id === current.id) ?? null : null);
    } catch { setError('לא ניתן לטעון לקוחות. בדקו את החיבור ונסו שוב.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') setShow(true);
  }, []);
  const filtered = useMemo(() => customers.filter(c =>
    `${c.full_name} ${c.phone} ${c.customer_addresses.map(a => `${a.city ?? ''} ${a.address}`).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())), [q, customers]);
  async function addCustomer(e: React.FormEvent) {
    e.preventDefault(); if (saveLock.current) return;
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'יש להזין שם מלא.';
    if (!form.phone.trim()) nextErrors.phone = 'יש להזין מספר טלפון.';
    newAddresses.forEach(address => { if (!address.city.trim()) nextErrors[`city-${address.key}`] = 'יש להזין עיר.'; if (!address.address.trim()) nextErrors[`address-${address.key}`] = 'יש להזין כתובת.'; if (address.latitude === null || address.longitude === null) nextErrors[`location-${address.key}`] = 'יש לאמת את הכתובת או לסמן מיקום במפה.'; });
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); setFormError('לא ניתן לשמור. תקנו את השדות המסומנים.'); return; }
    saveLock.current = true; setSaving(true); setError(''); setFormError(''); setFieldErrors({}); setMessage('');
    try {
      const { error } = await getSupabase().rpc('create_customer_with_addresses', {
        p_name: form.name, p_phone: form.phone, p_notes: form.notes,
        p_addresses: newAddresses.map(address => ({
          label: address.label.trim() || 'כתובת', address: address.address.trim(), city: address.city.trim(), latitude: address.latitude, longitude: address.longitude,
        })),
      });
      if (error) throw error;
      setForm(emptyForm); setNewAddresses([newAddressDraft()]); setShow(false); setMessage('הלקוח נשמר בהצלחה.'); setCreatedForMeeting(new URLSearchParams(window.location.search).get('returnTo') === 'meeting');
      await load();
    } catch { setFormError('שמירת הלקוח נכשלה. בדקו את הפרטים והחיבור ונסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function updateCustomer(e: React.FormEvent) {
    e.preventDefault(); if (!editing || saveLock.current) return;
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'יש להזין שם מלא.';
    if (!form.phone.trim()) nextErrors.phone = 'יש להזין מספר טלפון.';
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); setFormError('לא ניתן לשמור. תקנו את השדות המסומנים.'); return; }
    saveLock.current = true; setSaving(true); setError(''); setFormError(''); setFieldErrors({}); setMessage('');
    try {
      const { error } = await getSupabase().from('customers').update({
        full_name: form.name.trim(), phone: form.phone.trim(), notes: form.notes.trim() || null,
      }).eq('id', editing.id).select('id').single();
      if (error) throw error;
      setEditing(null); setForm(emptyForm); setMessage('פרטי הלקוח עודכנו בהצלחה.'); await load();
    } catch { setFormError('עדכון הלקוח נכשל. בדקו את הפרטים ונסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function addAddress(e: React.FormEvent) {
    e.preventDefault(); if (!addingAddress || saveLock.current) return;
    const nextErrors: Record<string, string> = {};
    if (!addressForm.label.trim()) nextErrors.addressLabel = 'יש להזין שם לכתובת.';
    if (!addressForm.city.trim()) nextErrors.addressCity = 'יש להזין עיר.';
    if (!addressForm.address.trim()) nextErrors.address = 'יש להזין כתובת.';
    if (addressForm.latitude === null || addressForm.longitude === null) nextErrors.location = 'יש לאמת את הכתובת או לסמן מיקום במפה.';
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); setFormError('לא ניתן לשמור. תקנו את השדות המסומנים.'); return; }
    saveLock.current = true; setSaving(true); setError(''); setFormError(''); setFieldErrors({}); setMessage('');
    try {
      const { error } = await getSupabase().from('customer_addresses').insert({
        customer_id: addingAddress.id, label: addressForm.label.trim(), address: addressForm.address.trim(),
        city: addressForm.city.trim() || null, latitude: addressForm.latitude, longitude: addressForm.longitude, is_default: addingAddress.customer_addresses.length === 0,
      }).select('id').single();
      if (error) throw error;
      setAddingAddress(null); setAddressForm(emptyAddress); setMessage('הכתובת נוספה בהצלחה.'); await load();
    } catch { setFormError('הוספת הכתובת נכשלה. בדקו את הפרטים ונסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function updateAddress(e: React.FormEvent) {
    e.preventDefault(); if (!editingAddress || saveLock.current) return;
    const nextErrors: Record<string, string> = {};
    if (!addressForm.label.trim()) nextErrors.addressLabel = 'יש להזין שם לכתובת.';
    if (!addressForm.city.trim()) nextErrors.addressCity = 'יש להזין עיר.';
    if (!addressForm.address.trim()) nextErrors.address = 'יש להזין כתובת.';
    if (addressForm.latitude === null || addressForm.longitude === null) nextErrors.location = 'יש לאמת את הכתובת או לסמן מיקום במפה.';
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); setFormError('לא ניתן לשמור. תקנו את השדות המסומנים.'); return; }
    saveLock.current = true; setSaving(true); setError(''); setFormError(''); setFieldErrors({}); setMessage('');
    try {
      const { error } = await getSupabase().from('customer_addresses').update({
        label: addressForm.label.trim(), address: addressForm.address.trim(), city: addressForm.city.trim() || null, latitude: addressForm.latitude, longitude: addressForm.longitude,
      }).eq('id', editingAddress.addressId).eq('customer_id', editingAddress.customer.id).select('id').single();
      if (error) throw error;
      setEditingAddress(null); setAddressForm(emptyAddress); setMessage('הכתובת עודכנה בהצלחה.'); await load();
    } catch { setFormError('עדכון הכתובת נכשל. בדקו את הפרטים ונסו שוב.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function removeAddress() {
    if (!confirmDeleteAddress || saveLock.current) return;
    saveLock.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const { error } = await getSupabase().from('customer_addresses').delete()
        .eq('id', confirmDeleteAddress.addressId).eq('customer_id', confirmDeleteAddress.customer.id);
      if (error) throw error;
      setConfirmDeleteAddress(null); setMessage('הכתובת הוסרה בהצלחה.'); await load();
    } catch { setError('לא ניתן להסיר את הכתובת. ייתכן שהיא משויכת לפגישה קיימת.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  function startEdit(customer: Customer) {
    setAddingAddress(null); setEditingAddress(null); setConfirmDeleteAddress(null); setEditing(customer);
    setForm({ name: customer.full_name, phone: customer.phone, notes: customer.notes ?? '', city: '', label: 'בית', address: '' });
    setShow(false); setMessage(''); setError(''); setFormError(''); setFieldErrors({});
  }
  function updateNewAddress(key: number, field: keyof Omit<AddressDraft, 'key'>, value: string) {
    setNewAddresses(addresses => addresses.map(address => address.key === key ? { ...address, [field]: value } : address));
  }
  function startAddress(customer: Customer) {
    setEditing(customer); setEditingAddress(null); setConfirmDeleteAddress(null); setAddingAddress(customer); setAddressForm(emptyAddress);
    setShow(false); setMessage(''); setError(''); setFormError(''); setFieldErrors({});
  }
  function startEditAddress(customer: Customer, addressId: string) {
    const address = customer.customer_addresses.find(item => item.id === addressId); if (!address) return;
    setEditing(customer); setAddingAddress(null); setConfirmDeleteAddress(null); setEditingAddress({ customer, addressId });
    setAddressForm({ label: address.label, address: address.address, city: address.city ?? '', latitude: address.latitude, longitude: address.longitude });
    setShow(false); setMessage(''); setError(''); setFormError(''); setFieldErrors({});
  }
  return <>
    <div className="topline"><div><h1>לקוחות</h1><div className="sub">חיפוש, צפייה ועדכון לקוחות וכתובות</div></div><button className="btn btn-primary" disabled={saving} onClick={() => { setShow(v => !v); setEditing(null); setAddingAddress(null); setEditingAddress(null); setConfirmDeleteAddress(null); setForm(emptyForm); setNewAddresses([newAddressDraft()]); setMessage(''); }}>+ לקוח חדש</button></div>
    {error && <div role="alert" className="error">{error} <button className="btn" onClick={load} disabled={loading}>טען מחדש</button></div>}
    {message && <div role="status" className="success success-actions"><span>{message}</span>{createdForMeeting && <Link className="btn btn-primary" href="/calendar?new=1">יצירת פגישה עבור הלקוח</Link>}</div>}
    {show && <form noValidate className="card" style={{ marginBottom: 16 }} onSubmit={addCustomer}>
      <h2 className="section-title">לקוח חדש</h2>
      <fieldset disabled={saving}>
        <section className="form-section">
          <h3>פרטי לקוח</h3>
          <div className="form-grid">
            <label>שם מלא<input className="input" aria-invalid={!!fieldErrors.name} required maxLength={200} value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setFieldErrors(current => ({ ...current, name: '' })); setFormError(''); }} /><FieldError message={fieldErrors.name} /></label>
            <label>טלפון<input className="input" aria-invalid={!!fieldErrors.phone} type="tel" dir="ltr" required maxLength={30} value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setFieldErrors(current => ({ ...current, phone: '' })); setFormError(''); }} /><FieldError message={fieldErrors.phone} /></label>
            <label className="full">הערות על הלקוח<textarea className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
        </section>
        <section className="form-section address-section">
          <div className="address-manager-heading"><h3>כתובות</h3><button className="btn" type="button" onClick={() => setNewAddresses(addresses => [...addresses, newAddressDraft()])}>+ כתובת נוספת</button></div>
          {newAddresses.map((address, index) => <div className="new-address-card" key={address.key}>
            <div className="address-card-heading"><strong>כתובת {index + 1}</strong>{newAddresses.length > 1 && <button className="link-button danger-text" type="button" onClick={() => setNewAddresses(addresses => addresses.filter(item => item.key !== address.key))}>הסרה</button>}</div>
            <div className="form-grid">
              <label>שם הכתובת <span className="optional">(אופציונלי)</span><input className="input" placeholder="למשל: בית, עסק" value={address.label} onChange={e => updateNewAddress(address.key, 'label', e.target.value)} /></label>
              <label>עיר<input className="input" aria-invalid={!!fieldErrors[`city-${address.key}`]} required value={address.city} onChange={e => { updateNewAddress(address.key, 'city', e.target.value); setNewAddresses(items => items.map(item => item.key === address.key ? { ...item, latitude: null, longitude: null } : item)); setFieldErrors(current => ({ ...current, [`city-${address.key}`]: '' })); setFormError(''); }} /><FieldError message={fieldErrors[`city-${address.key}`]} /></label>
              <label className="full">כתובת<input className="input" aria-invalid={!!fieldErrors[`address-${address.key}`]} required value={address.address} onChange={e => { updateNewAddress(address.key, 'address', e.target.value); setNewAddresses(items => items.map(item => item.key === address.key ? { ...item, latitude: null, longitude: null } : item)); setFieldErrors(current => ({ ...current, [`address-${address.key}`]: '' })); setFormError(''); }} /><FieldError message={fieldErrors[`address-${address.key}`]} /></label>
              <AddressVerification address={address.address} city={address.city} latitude={address.latitude} longitude={address.longitude} onChange={location => { setNewAddresses(items => items.map(item => item.key === address.key ? { ...item, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null } : item)); setFieldErrors(current => ({ ...current, [`location-${address.key}`]: '' })); setFormError(''); }} />
              <FieldError message={fieldErrors[`location-${address.key}`]} />
            </div>
          </div>)}
        </section>
      </fieldset>
      <button className="btn btn-primary" disabled={saving} style={{ marginTop: 14 }}>{saving ? 'שומר…' : 'שמור לקוח'}</button><SaveError message={formError} />
    </form>}
    {editing && <form noValidate className="card" style={{ marginBottom: 16 }} onSubmit={updateCustomer}>
      <h2 className="section-title">עריכת {editing.full_name}</h2>
      <fieldset disabled={saving} className="form-grid">
        <label>שם מלא<input className="input" aria-invalid={!!fieldErrors.name} required maxLength={200} value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setFieldErrors(current => ({ ...current, name: '' })); setFormError(''); }} /><FieldError message={fieldErrors.name} /></label>
        <label>טלפון<input className="input" aria-invalid={!!fieldErrors.phone} type="tel" dir="ltr" required maxLength={30} value={form.phone} onChange={e => { setForm({ ...form, phone: e.target.value }); setFieldErrors(current => ({ ...current, phone: '' })); setFormError(''); }} /><FieldError message={fieldErrors.phone} /></label>
        <label className="full">הערות<textarea className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
      </fieldset>
      <div className="toolbar" style={{ marginTop: 14 }}><button className="btn btn-primary" disabled={saving}>{saving ? 'שומר…' : 'שמור שינויים'}</button><SaveError message={formError} /><button className="btn" type="button" disabled={saving} onClick={() => setEditing(null)}>ביטול</button></div>
      <div className="address-manager">
        <div className="address-manager-heading"><h3>כתובות</h3><button className="btn" type="button" disabled={saving} onClick={() => startAddress(editing)}>+ הוספת כתובת</button></div>
        {!editing.customer_addresses.length && <p className="muted">עדיין אין כתובות ללקוח.</p>}
        {editing.customer_addresses.map(address => <div className="managed-address" key={address.id}>
          <span><strong>{address.label}</strong> · {address.address}{address.city ? `, ${address.city}` : ''}</span>
          <span className="address-actions"><button className="link-button" type="button" disabled={saving} onClick={() => startEditAddress(editing, address.id)}>עריכה</button>{canDelete && <button className="link-button danger-text" type="button" disabled={saving} onClick={() => { setAddingAddress(null); setEditingAddress(null); setConfirmDeleteAddress({ customer: editing, addressId: address.id, label: address.label }); setMessage(''); setError(''); setFormError(''); setFieldErrors({}); }}>הסרה</button>}</span>
        </div>)}
      </div>
    </form>}
    {addingAddress && <form noValidate className="card" style={{ marginBottom: 16 }} onSubmit={addAddress}>
      <h2 className="section-title">כתובת חדשה עבור {addingAddress.full_name}</h2>
      <fieldset disabled={saving} className="form-grid">
        <label>שם הכתובת<input className="input" aria-invalid={!!fieldErrors.addressLabel} required value={addressForm.label} placeholder="בית / עסק / דירה" onChange={e => { setAddressForm({ ...addressForm, label: e.target.value }); setFieldErrors(current => ({ ...current, addressLabel: '' })); setFormError(''); }} /><FieldError message={fieldErrors.addressLabel} /></label>
        <label>עיר<input className="input" aria-invalid={!!fieldErrors.addressCity} required value={addressForm.city} onChange={e => { setAddressForm({ ...addressForm, city: e.target.value, latitude: null, longitude: null }); setFieldErrors(current => ({ ...current, addressCity: '' })); setFormError(''); }} /><FieldError message={fieldErrors.addressCity} /></label>
        <label className="full">כתובת<input className="input" aria-invalid={!!fieldErrors.address} required value={addressForm.address} onChange={e => { setAddressForm({ ...addressForm, address: e.target.value, latitude: null, longitude: null }); setFieldErrors(current => ({ ...current, address: '' })); setFormError(''); }} /><FieldError message={fieldErrors.address} /></label>
        <AddressVerification address={addressForm.address} city={addressForm.city} latitude={addressForm.latitude} longitude={addressForm.longitude} onChange={location => { setAddressForm(current => ({ ...current, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null })); setFieldErrors(current => ({ ...current, location: '' })); setFormError(''); }} />
        <FieldError message={fieldErrors.location} />
      </fieldset>
      <div className="toolbar" style={{ marginTop: 14 }}><button className="btn btn-primary" disabled={saving}>{saving ? 'שומר…' : 'הוסף כתובת'}</button><SaveError message={formError} /><button className="btn" type="button" disabled={saving} onClick={() => setAddingAddress(null)}>ביטול</button></div>
    </form>}
    {editingAddress && <form noValidate className="card" style={{ marginBottom: 16 }} onSubmit={updateAddress}>
      <h2 className="section-title">עריכת כתובת עבור {editingAddress.customer.full_name}</h2>
      <fieldset disabled={saving} className="form-grid">
        <label>שם הכתובת<input className="input" aria-invalid={!!fieldErrors.addressLabel} required value={addressForm.label} onChange={e => { setAddressForm({ ...addressForm, label: e.target.value }); setFieldErrors(current => ({ ...current, addressLabel: '' })); setFormError(''); }} /><FieldError message={fieldErrors.addressLabel} /></label>
        <label>עיר<input className="input" aria-invalid={!!fieldErrors.addressCity} required value={addressForm.city} onChange={e => { setAddressForm({ ...addressForm, city: e.target.value, latitude: null, longitude: null }); setFieldErrors(current => ({ ...current, addressCity: '' })); setFormError(''); }} /><FieldError message={fieldErrors.addressCity} /></label>
        <label className="full">כתובת<input className="input" aria-invalid={!!fieldErrors.address} required value={addressForm.address} onChange={e => { setAddressForm({ ...addressForm, address: e.target.value, latitude: null, longitude: null }); setFieldErrors(current => ({ ...current, address: '' })); setFormError(''); }} /><FieldError message={fieldErrors.address} /></label>
        <AddressVerification address={addressForm.address} city={addressForm.city} latitude={addressForm.latitude} longitude={addressForm.longitude} onChange={location => { setAddressForm(current => ({ ...current, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null })); setFieldErrors(current => ({ ...current, location: '' })); setFormError(''); }} />
        <FieldError message={fieldErrors.location} />
      </fieldset>
      <div className="toolbar" style={{ marginTop: 14 }}><button className="btn btn-primary" disabled={saving}>{saving ? 'שומר…' : 'שמור כתובת'}</button><SaveError message={formError} /><button className="btn" type="button" disabled={saving} onClick={() => setEditingAddress(null)}>ביטול</button></div>
    </form>}
    {confirmDeleteAddress && <section className="card delete-confirm" role="alertdialog" aria-labelledby="delete-address-title" style={{ marginBottom: 16 }}>
      <h2 className="section-title" id="delete-address-title">להסיר את הכתובת “{confirmDeleteAddress.label}”?</h2>
      <p>הפעולה תסיר את הכתובת מהלקוח. לא ניתן להסיר כתובת שכבר משויכת לפגישה.</p>
      <div className="toolbar"><button className="btn btn-danger" disabled={saving} onClick={removeAddress}>{saving ? 'מסיר…' : 'כן, להסיר'}</button><button className="btn" disabled={saving} onClick={() => setConfirmDeleteAddress(null)}>ביטול</button></div>
    </section>}
    <div className="card">
      <div className="toolbar"><input className="input" aria-label="חיפוש לקוחות" placeholder="חיפוש לפי שם, טלפון, עיר או כתובת" value={q} onChange={e => setQ(e.target.value)} /></div>
      {loading ? <p role="status">טוען לקוחות…</p> : <>
        {!filtered.length && <p>{q ? 'לא נמצאו לקוחות תואמים.' : 'עדיין אין לקוחות. הוסיפו את הלקוח הראשון.'}</p>}
        {!!filtered.length && <div className="table-wrap"><table className="table"><thead><tr><th>לקוח</th><th>טלפון</th><th>כתובות</th><th>הערות</th><th>פגישות עתידיות</th><th>פגישות עבר</th><th>פעולות</th></tr></thead><tbody>{filtered.map(c => <tr key={c.id}>
          <td data-label="לקוח"><strong>{c.full_name}</strong></td><td data-label="טלפון" dir="ltr">{c.phone}</td>
          <td data-label="כתובות">{!c.customer_addresses.length ? '—' : c.customer_addresses.length === 1 ? <div className="single-address"><span className="address-dot" />{c.customer_addresses[0].label}: {c.customer_addresses[0].address}{c.customer_addresses[0].city ? `, ${c.customer_addresses[0].city}` : ''}</div> : <details className="address-summary"><summary>{c.customer_addresses.length} כתובות</summary><ul>{c.customer_addresses.map(a => <li key={a.id}><strong>{a.label}:</strong> {a.address}{a.city ? `, ${a.city}` : ''}</li>)}</ul></details>}</td>
          <td data-label="הערות" style={{ whiteSpace: 'pre-wrap' }}>{c.notes || '—'}</td>
          <td data-label="פגישות עתידיות"><span className="badge">{c.appointments.filter(a => a.status === 'scheduled' && new Date(a.starts_at).getTime() > Date.now()).length}</span></td>
          <td data-label="פגישות עבר"><span className="badge badge-neutral">{c.appointments.filter(a => a.status !== 'cancelled' && new Date(a.starts_at).getTime() < Date.now()).length}</span></td>
          <td data-label="פעולות"><button className="btn" disabled={saving} onClick={() => startEdit(c)}>עריכה</button></td>
        </tr>)}</tbody></table></div>}
      </>}
    </div>
  </>;
}
