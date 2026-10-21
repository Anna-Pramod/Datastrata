/**
 * The contact form appears only where delivery is already configured.
 *
 * Stage 1a, Task 7. The contact page used to render the form whatever the
 * environment said and offer a placeholder address as the fallback. A form
 * that cannot deliver is a claim the record does not back, so the page now
 * asks one pure question of the environment before rendering it:
 *
 * ```
 * CONTACT_WEBHOOK_URL unset              -> not configured
 * CONTACT_WEBHOOK_URL blank after trim   -> not configured
 * CONTACT_WEBHOOK_URL a URL              -> configured
 * ```
 *
 * The URL case is the positive control for the two refusals: a function that
 * answered "not configured" for everything would pass them and fail it. The
 * other-name case is the control for the positive claim: a function that
 * answered "configured" whenever anything was set would pass the URL case and
 * fail it (evidence standard, failure modes 5 and 7). The variable's name is
 * spelled here rather than imported, so the test cannot agree with a module
 * that read the wrong one.
 */

import { describe, expect, it } from 'vitest';
import { contactDelivery } from '@/lib/contact-delivery';

describe('contactDelivery', () => {
  it('is not configured when CONTACT_WEBHOOK_URL is unset', () => {
    expect(contactDelivery({})).toEqual({ configured: false });
  });

  it('is not configured when CONTACT_WEBHOOK_URL is blank after trimming', () => {
    expect(contactDelivery({ CONTACT_WEBHOOK_URL: '' })).toEqual({ configured: false });
    expect(contactDelivery({ CONTACT_WEBHOOK_URL: ' \t ' })).toEqual({ configured: false });
  });

  it('is configured when CONTACT_WEBHOOK_URL names a URL', () => {
    expect(contactDelivery({ CONTACT_WEBHOOK_URL: 'https://example.invalid/hook' })).toEqual({ configured: true });
  });

  it('is not configured by a URL set under any other name', () => {
    expect(contactDelivery({ CONTACT_WEBHOOK: 'https://example.invalid/hook' })).toEqual({ configured: false });
  });
});
