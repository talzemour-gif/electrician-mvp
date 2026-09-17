'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ digest: error.digest, path: window.location.pathname, source: 'global-boundary' }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return <html lang="he" dir="rtl"><body>
    <main className="main">
      <section className="card error-page" role="alert">
        <h1>לא ניתן להציג את המערכת</h1>
        <p>התקלה נרשמה. נסו לטעון את המערכת מחדש.</p>
        <button className="btn btn-primary" onClick={reset}>נסו שוב</button>
      </section>
    </main>
  </body></html>;
}
