'use client';

import { useState } from 'react';
import { Button, Field, Wordmark } from '@/components/ui/primitives';

/**
 * LoginCard — the 5a login, built as a visual shell.
 *
 * There is no auth, no user store and no session in this product yet. Rather
 * than fake a sign-in, submitting says so plainly. The states below (empty,
 * focus, error) are the ones the design system specifies; the error state
 * reuses oxide, because the system never introduces a separate red.
 */
export function LoginCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const emailError = submitted && !email.includes('@') ? 'A valid email is required.' : undefined;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!email.includes('@')) return;
    setPending(true);
    // Deliberately does not pretend to authenticate.
    window.setTimeout(() => setPending(false), 900);
  }

  return (
    <form onSubmit={onSubmit} className="ds-card" style={{ width: 448, maxWidth: '100%', padding: 36 }}>
      <div style={{ marginBottom: 28 }}><Wordmark /></div>
      <h1 className="ds-h3" style={{ marginBottom: 8 }}>Welcome back</h1>
      <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', marginBottom: 28 }}>
        Your record is where you left it. Nothing has been overwritten.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label="Email" htmlFor="email" error={emailError}>
          <input
            id="email" className="ds-input" type="email" autoComplete="email"
            placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password" className="ds-input" type="password" autoComplete="current-password"
            placeholder="••••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button type="button" className="ds-btn-link" style={{ alignSelf: 'flex-start' }}>
          Email me a magic link instead
        </button>
      </div>

      <div style={{ marginTop: 28 }}>
        <Button type="submit" loading={pending} style={{ width: '100%' }}>Continue →</Button>
      </div>

      {submitted && !pending && email.includes('@') ? (
        <p
          role="status"
          style={{
            marginTop: 18, border: '1px solid var(--ds-oxide)', background: 'var(--ds-oxide-wash)',
            padding: '12px 14px', fontSize: 13, lineHeight: 1.55, color: 'var(--ds-text-body)',
          }}
        >
          <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--ds-oxide)', transform: 'rotate(45deg)', marginRight: 8 }} />
          Accounts are not live yet. This screen is the designed shell. Authentication, tenancy and the
          private customer record are the next thing to be built, not something we will pretend at.
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" style={{ flex: 1 }}>Google</button>
        <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" style={{ flex: 1 }}>Microsoft</button>
      </div>
    </form>
  );
}
