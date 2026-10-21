'use client';

import { useState } from 'react';
import { Button, Field } from '@/components/ui/primitives';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'undelivered'; message: string } | { kind: 'error'; message: string };

export function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', website: '' });
  const [submitted, setSubmitted] = useState(false);
  const [state, setState] = useState<State>({ kind: 'idle' });

  const emailError = submitted && !form.email.includes('@') ? 'A valid email is required.' : undefined;
  const messageError = submitted && form.message.trim().length < 10 ? 'Tell us a little more than that.' : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!form.email.includes('@') || form.message.trim().length < 10) return;
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string };
      if (res.ok && body.ok) setState({ kind: 'sent' });
      else if (res.status === 503) setState({ kind: 'undelivered', message: body.message ?? 'Delivery is not configured.' });
      else setState({ kind: 'error', message: body.message ?? `The server returned ${res.status}.` });
    } catch {
      setState({ kind: 'error', message: 'The message could not be sent.' });
    }
  }

  if (state.kind === 'sent') {
    return (
      <div className="ds-card" style={{ padding: 28, maxWidth: 560 }}>
        <p className="ds-h4" style={{ marginBottom: 8 }}>Message received.</p>
        <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)' }}>
          We read everything ourselves; there is no queue and no auto-responder. Expect a reply from a person.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="ds-card" style={{ padding: 28, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
      {/* Honeypot: off-screen and hidden from assistive tech. Bots fill it, people do not. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" tabIndex={-1} autoComplete="off"
          value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      </div>
      <Field label="Name" htmlFor="c-name">
        <input id="c-name" className="ds-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
      </Field>
      <Field label="Email" htmlFor="c-email" error={emailError}>
        <input id="c-email" className="ds-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
      </Field>
      <Field label="Company" htmlFor="c-company" hint="OPTIONAL">
        <input id="c-company" className="ds-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} autoComplete="organization" />
      </Field>
      <Field label="What do you need?" htmlFor="c-message" error={messageError}>
        <textarea id="c-message" className="ds-input" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} style={{ resize: 'vertical' }} />
      </Field>

      {state.kind === 'undelivered' || state.kind === 'error' ? (
        <p role="alert" style={{ border: '1px solid var(--ds-oxide)', background: 'var(--ds-oxide-wash)', padding: '12px 14px', fontSize: 13, lineHeight: 1.55 }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--ds-oxide)', transform: 'rotate(45deg)', marginRight: 8 }} />
          {state.message}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button type="submit" loading={state.kind === 'sending'}>Send →</Button>
        <span className="ds-micro">NO NEWSLETTER · NO SEQUENCE · A PERSON REPLIES</span>
      </div>
    </form>
  );
}
