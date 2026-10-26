/**
 * Company — who builds this, on what principles, and what is honestly next.
 *
 * Structure follows a conventional about-us: mission, origin, principles, proof,
 * team, what's next, contact. Two substitutions are deliberate. There is no
 * customer logo wall, because there are no customers to name — in its place, the
 * institutions whose official record the pack is actually built from, counted
 * from the sources. And there is no press section, because there is no press —
 * in its place, the real build order.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { Footer } from '@/components/marketing/Footer';
import { answerable, planned } from '@/lib/coverage';
import { packStats, sourceInstitutions } from '@/lib/pack';
import { COMPANY, MISSION, NEXT, ORIGIN, PRINCIPLES, TEAM } from '@/lib/company';
import { siteCoverage } from '@/lib/site-coverage';

export const metadata: Metadata = {
  title: 'Company · DataStrata',
  description:
    'Why DataStrata exists, the principles the product is built to, and what we are building next.',
};

export default function CompanyPage() {
  const stats = packStats();
  const institutions = sourceInstitutions();
  const coverage = siteCoverage();

  return (
    <>
      <MarketingNav current="company" />
      <main id="main">
        {/* hero */}
        <section className="ds-gutter" style={{ paddingTop: 'clamp(48px, 7vw, 84px)', paddingBottom: 56 }}>
          <p className="ds-mono ds-oxide" style={{ fontSize: 11.5, letterSpacing: '0.2em', marginBottom: 24 }}>COMPANY</p>
          <h1 className="ds-display-2" style={{ maxWidth: '18ch', textWrap: 'balance', marginBottom: 28 }}>
            Someone has to read every layer.
          </h1>
          <p className="ds-body-lg" style={{ maxWidth: '60ch', marginBottom: 32 }}>{MISSION}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link className="ds-btn ds-btn-primary" href="/check">Check what applies to you - free</Link>
            <Link className="ds-btn ds-btn-secondary" href="/contact">Talk to us</Link>
          </div>
        </section>

        {/* origin */}
        <section className="ds-gutter ds-section" style={{ borderTop: '1px solid var(--ds-hairline-1)' }}>
          <div className="ds-company-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 5fr) 7fr', gap: 'clamp(24px, 5vw, 64px)' }}>
            <div>
              <p className="ds-label" style={{ marginBottom: 18 }}>01 · WHY WE EXIST</p>
              <h2 className="ds-h2" style={{ maxWidth: '18ch' }}>Answers that survive the next amendment.</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {ORIGIN.map((para, i) => (
                <p key={i} style={{ fontSize: 16.5, lineHeight: 1.65, color: 'var(--ds-text-body)', maxWidth: '62ch' }}>{para}</p>
              ))}
              <p className="ds-mono" style={{ fontSize: 12, color: 'var(--ds-text-muted)', borderTop: '1px solid var(--ds-hairline-2)', paddingTop: 18 }}>
                {COMPANY.scale.toUpperCase()}
              </p>
            </div>
          </div>
        </section>

        {/* principles */}
        <section className="ds-gutter ds-panel" style={{ borderTop: '1px solid var(--ds-ink)', borderBottom: '1px solid var(--ds-ink)', paddingBlock: 88 }}>
          <p className="ds-label" style={{ marginBottom: 18 }}>02 · HOW WE BUILD</p>
          <h2 className="ds-h2" style={{ maxWidth: '22ch', marginBottom: 12 }}>Six rules the product is held to.</h2>
          <p className="ds-body-lg" style={{ maxWidth: '60ch', marginBottom: 40 }}>
            These are not values on a wall. They are enforced by the test suite, and a change that breaks
            one of them fails to ship.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px 40px' }}>
            {PRINCIPLES.map((p) => (
              <div key={p.n} style={{ borderTop: '2px solid var(--ds-oxide)', paddingTop: 16 }}>
                <p className="ds-mono ds-oxide" style={{ fontSize: 12, marginBottom: 10 }}>{p.n}</p>
                <h3 className="ds-h4" style={{ marginBottom: 8 }}>{p.h}</h3>
                <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', maxWidth: '46ch' }}>{p.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* what we read — the honest substitute for a logo wall */}
        <section className="ds-gutter ds-section">
          <p className="ds-label" style={{ marginBottom: 18 }}>03 · WHAT WE READ</p>
          <h2 className="ds-h2" style={{ maxWidth: '22ch', marginBottom: 12 }}>Built on the official record, not on secondary reporting.</h2>
          <p className="ds-body-lg" style={{ maxWidth: '62ch', marginBottom: 36 }}>
            We have no customer logos to show you; we are early, and we would rather say so. What we can
            show you is whose record every determination is built on. {stats.sources} sources, all primary.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {institutions.map((inst) => (
              <div key={inst.name} className="ds-card" style={{ padding: 20 }}>
                <div className="ds-stat" style={{ fontSize: 30 }}>{inst.count}</div>
                <p className="ds-h4" style={{ fontFamily: 'var(--ds-font-ui)', fontSize: 15, marginTop: 10 }}>{inst.name}</p>
                <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', marginTop: 6 }}>{inst.detail}</p>
              </div>
            ))}
          </div>
          <p className="ds-micro" style={{ marginTop: 20, maxWidth: '70ch' }}>
            {answerable(coverage).length} REGIME ANSWERABLE AS DRAFT · {planned(coverage).length} PLANNED · {stats.requirements} REQUIREMENTS ·
            {' '}{stats.ratified} OF {stats.requirements} EXPERT-RATIFIED · THE GATE WE HAVE NOT YET PASSED.
          </p>
        </section>

        {/* team */}
        <section className="ds-gutter ds-section" style={{ borderTop: '1px solid var(--ds-hairline-1)' }}>
          <p className="ds-label" style={{ marginBottom: 18 }}>04 · WHO</p>
          <h2 className="ds-h2" style={{ maxWidth: '20ch', marginBottom: 36 }}>Two people, both accountable.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 24, maxWidth: 900 }}>
            {TEAM.map((person, i) => (
              <div key={i} className="ds-card" style={{ padding: 24 }}>
                <p className="ds-mono" style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--ds-oxide)', textTransform: 'uppercase', marginBottom: 12 }}>
                  {person.role}
                </p>
                <p className="ds-h4" style={{ marginBottom: 10 }}>{person.name ?? 'Name to be published'}</p>
                <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)' }}>
                  {person.bio ?? 'Biography to be published. We would rather leave this blank than fill it with something we have not written properly.'}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* what's next */}
        <section className="ds-gutter ds-section" style={{ borderTop: '1px solid var(--ds-hairline-1)' }}>
          <p className="ds-label" style={{ marginBottom: 18 }}>05 · WHAT IS NEXT</p>
          <h2 className="ds-h2" style={{ maxWidth: '22ch', marginBottom: 12 }}>The order we are building in.</h2>
          <p className="ds-body-lg" style={{ maxWidth: '60ch', marginBottom: 36 }}>
            Not a roadmap of promises: the next four things that have to be true before anyone should
            rely on this.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
            {NEXT.map((n, i) => (
              <div key={n.h} style={{ borderTop: '1px solid var(--ds-ink)', paddingTop: 16 }}>
                <p className="ds-mono ds-oxide" style={{ fontSize: 12, marginBottom: 10 }}>{String(i + 1).padStart(2, '0')}</p>
                <h3 className="ds-h4" style={{ marginBottom: 8 }}>{n.h}</h3>
                <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)' }}>{n.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* contact CTA */}
        <section className="ds-gutter" style={{ paddingTop: 24, paddingBottom: 'clamp(72px, 10vw, 120px)' }}>
          <h2 className="ds-display-2" style={{ maxWidth: '16ch', textWrap: 'balance', marginBottom: 24 }}>
            Tell us what we have got wrong.
          </h2>
          <p className="ds-body-lg" style={{ maxWidth: '54ch', marginBottom: 28 }}>
            The most useful message we can receive is a determination you think is incorrect, with the
            reason. That is how the record gets better.
          </p>
          <Link className="ds-btn ds-btn-primary" href="/contact" style={{ fontSize: 16.5, padding: '16px 28px' }}>
            Contact us →
          </Link>
        </section>
      </main>
      <Footer packVersion={stats.version} legalSnapshot={stats.legalSnapshot} />
    </>
  );
}
