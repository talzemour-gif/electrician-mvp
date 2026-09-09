export default function HomePage() {
  return (
    <>
      <div className="topline">
        <div><h1>דשבורד</h1><div className="sub">תמונת מצב קצרה של יום העבודה</div></div>
      </div>
      <div className="grid">
        <div className="card"><div className="muted">פגישות היום</div><div className="stat">4</div></div>
        <div className="card"><div className="muted">פגישות השבוע</div><div className="stat">18</div></div>
        <div className="card"><div className="muted">הכנסה צפויה השבוע</div><div className="stat">₪9,850</div></div>
      </div>
      <div className="card" style={{marginTop:16}}>
        <h2 className="section-title">הפגישה הבאה</h2>
        <strong>משה כהן · 15:30</strong>
        <div className="sub">בדיקת מתקן · בית · רעננה</div>
      </div>
    </>
  );
}
