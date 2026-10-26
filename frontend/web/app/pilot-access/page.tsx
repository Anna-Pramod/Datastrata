/**
 * /pilot-access: the public page in front of the gate, where the passphrase is entered.
 *
 * **Why it is a plain form post.** The form posts to `/api/pilot-access`, which answers with a redirect and sets the session
 * cookie, so the page needs no script, holds no state and offers no control that does nothing. It works before any bundle has
 * loaded, and a refused browser is sent back here with the reason in the query string.
 *
 * **Why the reason is a sentence from a map and never the query string itself.** Anyone can write a link to this page with any
 * text in `reason`. `accessReasonMessage` answers only for the ten reasons the gate and the routes send and gives null for
 * everything else, so nothing a visitor writes into a link can appear here as the gate's own words. A reason given twice is
 * ignored rather than guessed at.
 *
 * **Why it reads no secret and no profile.** It is public, so it imports only Next, the site primitives, the pilot switch (which
 * imports nothing) and the handler's sentence function, and a test holds its imports to those. Whether the gate is configured is
 * learned the way a visitor learns it: by being sent back with `unconfigured`.
 *
 * **Why it says what a session is.** The two notes state what the gate does and no more: a session lasts twelve hours from the
 * moment the passphrase is accepted, and signing out clears the cookie in this browser only, because the token is stateless and
 * stays valid elsewhere until it expires or access is revoked. The page is rendered for each request and never cached.
 *
 * **Why it can be a 404.** The page is part of the pilot surface, which answers only where a server sets
 * `DATASTRATA_PILOT_GATE=on` (DP1 plan, DG-10). Unless it is `on`, the page calls `notFound()` as the first thing it does, before its
 * search parameters are read, and Next renders the standard 404. Being rendered for each request, the page reads the switch then.
 * Its metadata is decided the same way, by `generateMetadata`: none while the switch is off, because Next streams a page's metadata
 * into the document even when the page calls `notFound()`, and a static export put "Pilot access" and "passphrase" into the 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, Field, Wordmark } from '@/components/ui/primitives';
import { PILOT_GATE_ENV, pilotSurfaceEnabled } from '@/lib/hosting-mode';
import { accessReasonMessage } from '@/lib/pilot-access-handler';

export const dynamic = 'force-dynamic';

/** The pilot switch, read by name for each request (DG-10): the page's metadata and its body each ask it before anything else. */
function surfaceOn(): boolean {
  return pilotSurfaceEnabled({ [PILOT_GATE_ENV]: process.env.DATASTRATA_PILOT_GATE });
}

/** The page's metadata while the pilot surface is on. */
const METADATA: Metadata = {
  title: 'Pilot access · DataStrata',
  description: 'Enter the passphrase for a pilot evaluation.',
  robots: { index: false, follow: false },
};

/** None while the pilot surface is off, so the 404 says nothing of this page; `METADATA` while it is on. `{}` rather than a second `notFound()`, because the body already answers 404 first. */
export async function generateMetadata(): Promise<Metadata> {
  if (!surfaceOn()) return {};
  return METADATA;
}

export default async function PilotAccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!surfaceOn()) notFound();
  const { reason } = await searchParams;
  const message = accessReasonMessage(typeof reason === 'string' ? reason : undefined);
  return (
    <div className="ds-grid-paper" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="ds-gutter" style={{ paddingTop: 28 }}>
        <Link href="/"><Wordmark size={17} /></Link>
      </div>

      <main id="main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' }}>
        <div className="ds-card" style={{ width: 448, maxWidth: '100%', padding: 36 }}>
          <h1 className="ds-h3" style={{ marginBottom: 8 }}>Pilot access</h1>
          <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', marginBottom: 24 }}>
            Enter the passphrase you were given to open the dashboard.
          </p>

          {message === null ? null : (
            <p role="alert" style={{ border: '1px solid var(--ds-oxide)', background: 'var(--ds-oxide-wash)', padding: '12px 14px', fontSize: 13, lineHeight: 1.55, marginBottom: 20 }}>
              <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--ds-oxide)', transform: 'rotate(45deg)', marginRight: 8 }} />
              {message}
            </p>
          )}

          <form method="post" action="/api/pilot-access" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Field label="Passphrase" htmlFor="pilot-passphrase">
              <input id="pilot-passphrase" className="ds-input" type="password" name="passphrase" autoComplete="off" required />
            </Field>
            <div>
              <Button type="submit">Open the dashboard</Button>
            </div>
          </form>

          <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', marginTop: 28 }}>
            A session lasts 12 hours from the moment the passphrase is accepted, then the passphrase is needed again.
          </p>
          <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', marginTop: 12 }}>
            Signing out clears the session in this browser only. The session itself stays valid until it expires or access is revoked.
          </p>
        </div>
      </main>
    </div>
  );
}
