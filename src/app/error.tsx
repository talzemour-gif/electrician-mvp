'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ digest: error.digest, path: window.location.pathname, source: 'route-boundary' }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return <section className="card error-page" role="alert">
    <h1>משהו השתבש</h1>
    <p>התקלה נרשמה. אפשר לנסות שוב או לרענן את העמוד.</p>
    <div className="toolbar">
      <button className="btn btn-primary" onClick={reset}>נסו שוב</button>
      <button className="btn" onClick={() => window.location.reload()}>רענון העמוד</button>
    </div>
  </section>;
}
