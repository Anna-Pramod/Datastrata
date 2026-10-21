import Link from 'next/link';
import { Wordmark } from '@/components/ui/primitives';

/**
 * LoginCard — a plain statement that accounts are not live, in place of the
 * designed sign-in shell.
 *
 * The shell had a form that could sign nobody in, a "Verifying…" state, a
 * "Welcome back" heading and three inert buttons. Each was a claim the record
 * does not back: there is no account, no session store and no identity
 * provider. The only access that exists is a passphrase for pilot evaluations,
 * entered at `/pilot-access`, so this card says that and links there. It
 * renders on the server, holds no state and offers no control that does nothing.
 */
export function LoginCard() {
  return (
    <div className="ds-card" style={{ width: 448, maxWidth: '100%', padding: 36 }}>
      <div style={{ marginBottom: 28 }}><Wordmark /></div>
      <h1 className="ds-h3" style={{ marginBottom: 8 }}>Accounts are not live yet</h1>
      <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)' }}>
        Pilot evaluations use a passphrase. If you are taking part in one, go to{' '}
        <Link href="/pilot-access" style={{ color: 'var(--ds-oxide)' }}>Pilot access</Link>.
      </p>
    </div>
  );
}
