import Link from "next/link";
import AuthGate from "@/components/auth-gate";
import "./globals.css";
import "leaflet/dist/leaflet.css";

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
          <main className="main"><AuthGate>{children}</AuthGate></main>
        </div>
      </body>
    </html>
  );
}
