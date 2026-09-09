import Link from "next/link";
import "./globals.css";

export const metadata = { title: "ניהול בודק חשמל", description: "MVP לניהול עסק לבודק חשמל" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">⚡ ניהול בודק חשמל</div>
            <nav className="nav">
              <Link href="/">דשבורד</Link>
              <Link href="/calendar">יומן</Link>
              <Link href="/customers">לקוחות</Link>
              <Link href="/pricing">מחירון</Link>
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
