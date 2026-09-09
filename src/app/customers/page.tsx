"use client";
import { useMemo, useState } from "react";

type Customer = { id:number; name:string; phone:string; city:string; addresses:number; future:number; };
const initial: Customer[] = [
  { id:1, name:"משה כהן", phone:"050-1234567", city:"רעננה", addresses:2, future:1 },
  { id:2, name:"אבי לוי", phone:"052-7654321", city:"הרצליה", addresses:1, future:2 },
  { id:3, name:"דני ישראלי", phone:"054-1112233", city:"פתח תקווה", addresses:3, future:0 },
];

export default function CustomersPage(){
  const [customers,setCustomers] = useState(initial);
  const [q,setQ] = useState("");
  const [show,setShow] = useState(false);
  const [form,setForm] = useState({name:"",phone:"",city:"",label:"בית",address:"",notes:""});
  const filtered = useMemo(()=>customers.filter(c => `${c.name} ${c.phone} ${c.city}`.includes(q)),[q,customers]);
  function addCustomer(e:React.FormEvent){
    e.preventDefault();
    setCustomers(x=>[{id:Date.now(),name:form.name,phone:form.phone,city:form.city,addresses:form.address?1:0,future:0},...x]);
    setForm({name:"",phone:"",city:"",label:"בית",address:"",notes:""}); setShow(false);
  }
  return <>
    <div className="topline"><div><h1>לקוחות</h1><div className="sub">חיפוש, צפייה והוספת לקוחות</div></div><button className="btn btn-primary" onClick={()=>setShow(v=>!v)}>+ לקוח חדש</button></div>
    {show && <form className="card" style={{marginBottom:16}} onSubmit={addCustomer}>
      <h2 className="section-title">לקוח חדש</h2>
      <div className="form-grid">
        <label>שם מלא<input className="input" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>טלפון<input className="input" required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label>עיר<input className="input" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label>
        <label>שם הכתובת<input className="input" placeholder="בית / עסק / דירה להשכרה" value={form.label} onChange={e=>setForm({...form,label:e.target.value})}/></label>
        <label className="full">כתובת<input className="input" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
        <label className="full">הערות<textarea className="input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      </div>
      <button className="btn btn-primary" style={{marginTop:14}}>שמור לקוח</button>
    </form>}
    <div className="card">
      <div className="toolbar"><input className="input" placeholder="חיפוש לפי שם, טלפון או עיר" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>לקוח</th><th>טלפון</th><th>עיר</th><th>כתובות</th><th>פגישות עתידיות</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.phone}</td><td>{c.city}</td><td>{c.addresses}</td><td><span className="badge">{c.future}</span></td></tr>)}</tbody></table></div>
    </div>
  </>
}
