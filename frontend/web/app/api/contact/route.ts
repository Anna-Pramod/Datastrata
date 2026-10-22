/**
 * POST /api/contact
 *
 * Delivery is a single configured webhook (`CONTACT_WEBHOOK_URL`) so this works
 * with whatever the company already uses — Formspree, Zapier, Make, a Slack
 * incoming webhook, an internal endpoint — with no mail dependency here.
 *
 * If nothing is configured, the route says so honestly (503) instead of
 * accepting the message and dropping it. The contact page does not render the
 * form at all while the variable is unset (`lib/contact-delivery.ts`), so this
 * refusal is the backstop for a direct request, not the visitor's experience.
 *
 * The body is read within 32 KiB (`lib/request-body.ts`, pilot readiness B4):
 * a 5,000-character message at up to four bytes per character, and the other
 * fields. A larger body is answered 413 in this route's own shape before it is
 * parsed or delivered; one within the limit is parsed as before.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CONTACT_BODY_LIMIT, readBodyWithin, withBoundedBody } from '@/lib/request-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().max(200).optional(),
  email: z.string().email().max(320),
  company: z.string().max(200).optional(),
  message: z.string().min(10).max(5000),
  /** Honeypot: real people leave it empty. */
  website: z.string().max(0).optional(),
});

export async function POST(request: Request) {
  const bounded = await readBodyWithin(request, CONTACT_BODY_LIMIT);
  if (!bounded.ok) {
    return NextResponse.json(
      { ok: false, message: 'Your message is too long.' },
      { status: 413, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await withBoundedBody(request, bounded.bytes).json());
  } catch {
    return NextResponse.json({ ok: false, message: 'Please check the form and try again.' }, { status: 400 });
  }

  const target = process.env.CONTACT_WEBHOOK_URL;
  if (!target) {
    return NextResponse.json(
      { ok: false, message: 'This form is not connected to an inbox yet, so nothing was sent.' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, receivedAt: new Date().toISOString(), source: 'datastrata.site/contact' }),
    });
    if (!res.ok) throw new Error(`delivery endpoint returned ${res.status}`);
  } catch {
    return NextResponse.json(
      { ok: false, message: 'We could not deliver that message.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
