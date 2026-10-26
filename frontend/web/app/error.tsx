/**
 * The error page: what a visitor sees when a page throws while it renders (DP1 plan, Task 7; EXP-6, EXP-9).
 *
 * **Why it exists.** Without it Next answers a page that throws with its own default error page, worded by Next rather than by the
 * site. So the site's error page says the approved words for `server_error` (Task 5's table), read from `lib/wording.ts` and never
 * retyped here, in the same frame as the 404: the wordmark home, one card, the words, and a link home. Next requires an error
 * boundary to be a client component, hence the directive below; the wording module is client-safe, which is why the check's own
 * client component reads it too.
 *
 * **Why it shows nothing of the error.** Next hands this page the error that was thrown: a message, a digest for an error from the
 * server, and a stack. In development, or for an error thrown in the browser, the message and the stack are the error's own, and
 * either can carry a server path, a variable's name or a value. None of it is rendered: not the message, not the digest, not the
 * stack. The page takes the error and Next's `reset` only because that is the boundary's interface, and reads neither. It offers no
 * "Try again" control, because the approved words say to try again later, and a button that retried at once would say the opposite.
 * Like the 404, it implies nothing about a visitor's answers, which the site never keeps (plan §1, Data), and its text is set in the
 * body and muted inks, never in the shared ghost or faint inks, which fall below 4.5:1 on white.
 *
 * **Why the words are split as they are.** The first sentence of the approved words is the heading and the rest is said beneath it,
 * so the page shows the words once, in order, joined exactly as approved, and nothing of its own beyond the link label.
 */

'use client';

import Link from 'next/link';
import { Wordmark } from '@/components/ui/primitives';
import { ERROR_STATES } from '@/lib/wording';

const WORDS = ERROR_STATES.server_error.words;
/** Where the first sentence ends: the heading is the words up to it, and the rest is said beneath. */
const CUT = WORDS.indexOf('. ');
const HEADING = CUT === -1 ? WORDS : WORDS.slice(0, CUT + 1);
const DETAIL = CUT === -1 ? '' : WORDS.slice(CUT + 2);

/** The boundary's interface, as Next calls it. Neither value is read, so nothing of the error can be shown. */
interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ServerErrorPage(_props: ErrorPageProps) {
  return (
    <div className="ds-grid-paper" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="ds-gutter" style={{ paddingTop: 28 }}>
        <Link href="/"><Wordmark size={17} /></Link>
      </div>

      <main id="main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' }}>
        <div className="ds-card" style={{ width: 448, maxWidth: '100%', padding: 36 }}>
          <h1 className="ds-h3" style={{ marginBottom: 8 }}>{HEADING}</h1>
          {DETAIL === '' ? null : (
            <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', marginBottom: 24 }}>{DETAIL}</p>
          )}
          <Link className="ds-btn ds-btn-primary" href="/">Go to the home page</Link>
        </div>
      </main>
    </div>
  );
}
