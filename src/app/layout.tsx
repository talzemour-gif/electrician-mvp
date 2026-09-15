import AuthGate from "@/components/auth-gate";
import MainNavigation from "@/components/main-navigation";
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
            <MainNavigation />
          </aside>
          <main className="main"><AuthGate>{children}</AuthGate></main>
        </div>
      </body>
    </html>
  );
}
