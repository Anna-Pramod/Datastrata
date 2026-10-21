/**
 * Whether a contact message has anywhere to go.
 *
 * `/api/contact` delivers to the webhook `CONTACT_WEBHOOK_URL` names and
 * refuses with 503 when it is unset. The page used to render the form
 * regardless, so a visitor could write a message the site already knew it
 * would not deliver, then be offered a placeholder address instead. A form
 * that cannot deliver is a claim the record does not back. The contact page
 * asks this question on the server, at request time, and renders the form
 * only on a yes; otherwise it says plainly that contact details are published
 * when the inbox is connected.
 *
 * The answer is derived from the environment handed in, never read from
 * `process.env` here, so the test can state each case directly. A value of
 * spaces names nothing, so blank after trimming is unset. The variable's
 * value is never returned: a configured destination is operator
 * configuration, not page content.
 *
 * Pure: no environment read, no network, no clock.
 */

/** The server-side variable `/api/contact` delivers to. Never `NEXT_PUBLIC_`. */
const CONTACT_WEBHOOK_ENV = 'CONTACT_WEBHOOK_URL';

export function contactDelivery(env: Readonly<Record<string, string | undefined>>): { configured: boolean } {
  const target = env[CONTACT_WEBHOOK_ENV];
  return { configured: target !== undefined && target.trim() !== '' };
}
