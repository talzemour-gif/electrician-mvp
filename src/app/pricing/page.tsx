const jobs = [
  ["בדיקת מתקן", "₪650", "90 דקות"],
  ["בדיקת לוח", "₪500", "60 דקות"],
  ["בדיקה תקופתית", "₪800", "120 דקות"],
];
export default function PricingPage(){
 return <><div className="topline"><div><h1>מחירון</h1><div className="sub">סוגי עבודות, מחיר וזמן ברירת מחדל</div></div><button className="btn btn-primary">+ סוג עבודה</button></div><div className="card"><table className="table"><thead><tr><th>סוג עבודה</th><th>מחיר</th><th>משך רגיל</th></tr></thead><tbody>{jobs.map((j,i)=><tr key={i}><td><strong>{j[0]}</strong></td><td>{j[1]}</td><td>{j[2]}</td></tr>)}</tbody></table></div></>
}
