/**
 * The standard 404: what any path the site does not serve answers, and what the pilot surface's pages render while the surface is off
 * (DP1 plan, Task 7; DG-10, EXP-6, EXP-9).
 *
 * **Why it exists.** Without it Next answers an unknown path with its own default page, worded by Next rather than by the site, and
 * the pilot surface's pages, which call `notFound()` unless a server sets `DATASTRATA_PILOT_GATE=on`, would end on that page too. So
 * the site's 404 says the approved words for `not_found` (Task 5's table), read from `lib/wording.ts` and never retyped here, inside
 * the site's own frame: the wordmark home, one card, the words, and a link home.
 *
 * **Why the words are split as they are.** The first sentence of the approved words is the page's heading and the rest is said
 * beneath it, so the page shows the words once, in order, joined exactly as approved, and nothing of its own beyond the link label.
 *
 * **Why it says nothing else.** Next renders this page for a path it was never asked to show, so it carries no path, no variable
 * name and nothing about a request; and it implies nothing about a visitor's answers, which the site never keeps (plan §1, Data).
 * Its text is set in the body and muted inks, never in the shared ghost or faint inks, which fall below 4.5:1 on white.
 */

import Link from 'next/link';
import { Wordmark } from '@/components/ui/primitives';
import { ERROR_STATES } from '@/lib/wording';

const WORDS = ERROR_STATES.not_found.words;
/** Where the first sentence ends: the heading is the words up to it, and the rest is said beneath. */
const CUT = WORDS.indexOf('. ');
const HEADING = CUT === -1 ? WORDS : WORDS.slice(0, CUT + 1);
const DETAIL = CUT === -1 ? '' : WORDS.slice(CUT + 2);

export default function NotFound() {
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
