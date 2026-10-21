/**
 * Landing — Seismograph / Oxide, option 5a section order.
 *
 * A server component: every figure on this page is read from the real CSRD
 * knowledge pack at request time. The mockup's placeholder stats ("6 REGIMES
 * READ", "14 OBLIGATIONS FOUND") are deliberately not reproduced — per the
 * brief, the site states what the engine actually holds.
 */

import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { Footer } from '@/components/marketing/Footer';
import { LiveTrace } from '@/components/marketing/LiveTrace';
import { CoverageStrip, CoverageTable } from '@/components/marketing/CoverageStrip';
import { SheetApplicability, SheetChange, SheetSchedule, StrataSection } from '@/components/marketing/Sheets';
import { CHECK_QUESTION_COUNT } from '@/lib/checker';
import { answerable, planned } from '@/lib/coverage';
import { packStats, traceSeries } from '@/lib/pack';
import { siteCoverage } from '@/lib/site-coverage';

const PAINS = [
  'A German buyer emails demanding verified CBAM emissions data by Friday.',
  'The Omnibus rewrote CSRD scope after you spent a year preparing.',
  'A 200-question customer audit lands on the one person who also runs EHS.',
];

const PROOF = [
  'Every determination carries its derivation trace and official sources.',
  'Every result names the pack version and legal snapshot it ran on. Storing each run, so that a past answer can be reconstructed exactly, is planned.',
  'A deterministic core decides applicability; AI drafts and explains, but never decides, and never publishes into the record.',
];

const HOW = [
  'Profile once',
  'Applicability determined and cited',
  'Obligations instantiated, each traced to its determination',
];

/** The planned regimes, named from the register: "CBAM, … and ESPR are planned, not yet encoded." */
function plannedSentence(names: string[]): string | null {
  if (names.length === 0) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? 'is' : 'are'} planned, not yet encoded.`;
}

export default function Page() {
  const stats = packStats();
  const series = traceSeries();
  const coverage = siteCoverage();
  const plannedCopy = plannedSentence(planned(coverage).map((r) => r.short));

  return (
    <>
      <MarketingNav />
      <main id="main">
        {/* ---------------------------------------------------------- hero */}
        <section className="ds-gutter" style={{ paddingTop: 'clamp(48px, 7vw, 84px)', paddingBottom: 56 }}>
          <p className="ds-mono ds-oxide" style={{ fontSize: 11.5, letterSpacing: '0.2em', marginBottom: 24 }}>
            REGULATORY INTELLIGENCE FOR MARKET ACCESS
          </p>
          <h1 className="ds-display-1" style={{ maxWidth: '17ch', textWrap: 'balance', marginBottom: 24 }}>
            Know what applies. What changed. And what to do, by when.
          </h1>
          <p className="ds-body-lg" style={{ maxWidth: '58ch', marginBottom: 32 }}>
            Sustainability regulation accumulates like sediment, layer upon shifting layer. DataStrata
            evaluates CSRD applicability from your stated facts, cites each requirement&apos;s sources and
            shows what remains unresolved.{plannedCopy === null ? null : ` ${plannedCopy}`}
          </p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 56 }}>
            <Link className="ds-btn ds-btn-primary" href="/check">Check what applies to you - free</Link>
            <span className="ds-mono ds-faint" style={{ fontSize: 11.5, letterSpacing: '0.06em' }}>
              {CHECK_QUESTION_COUNT.standard} QUESTIONS, {CHECK_QUESTION_COUNT.parent} FOR A PARENT UNDERTAKING · CITED RESULT
            </span>
          </div>

          {/* stat shelf — pack-derived, not copy */}
          <div className="ds-shelf">
            <div className="ds-shelf-cell">
              <div className="ds-stat-lg">{stats.requirements}</div>
              <div className="ds-stat-sub">Requirements encoded</div>
            </div>
            <div className="ds-shelf-div" />
            <div className="ds-shelf-cell">
              <div className="ds-stat-lg">{stats.sources}</div>
              <div className="ds-stat-sub">Official sources cited</div>
            </div>
            <div className="ds-shelf-div" />
            <div className="ds-shelf-cell">
              <div className="ds-stat-lg ds-oxide">{stats.signed}</div>
              <div className="ds-stat-sub">of {stats.requirements} requirements signed</div>
            </div>
          </div>

          <div style={{ padding: '10px 0 4px', borderBottom: '1px solid var(--ds-hairline-1)' }}>
            <p className="ds-mono" style={{ fontSize: 9.5, letterSpacing: '0.16em', color: 'var(--ds-text-faint)', marginBottom: 2 }}>
              LIVE TRACE · THE RECORD ACCUMULATING, ACT BY ACT
            </p>
            <LiveTrace acts={series.acts} pending={series.pending} requirements={stats.requirements} snapshot={stats.legalSnapshot} idPrefix="hero" />
          </div>
        </section>

        <CoverageStrip />

        {/* ------------------------------------------------------- problem */}
        <section id="product" className="ds-gutter ds-section" style={{ borderTop: '1px solid var(--ds-hairline-1)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 24 }}>
            <div style={{ gridColumn: 'span 5' }} className="ds-problem-head">
              <p className="ds-label" style={{ marginBottom: 18 }}>01 · THE PROBLEM</p>
              <h2 className="ds-h2" style={{ maxWidth: '20ch', textWrap: 'balance' }}>
                The rules that decide whether you can sell now change faster than you can track.
              </h2>
            </div>
            <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column' }} className="ds-problem-list">
              {PAINS.map((p, i) => (
                <div
                  key={p}
                  style={{
                    borderTop: i === 0 ? '1px solid var(--ds-ink)' : '1px solid var(--ds-hairline-1)',
                    borderBottom: i === PAINS.length - 1 ? '1px solid var(--ds-ink)' : undefined,
                    padding: '22px 0', display: 'flex', gap: 22, alignItems: 'baseline',
                  }}
                >
                  <span className="ds-mono ds-oxide" style={{ fontSize: 11.5 }}>[{String(i + 1).padStart(2, '0')}]</span>
                  <p style={{ fontSize: 16.5, lineHeight: 1.6, color: 'var(--ds-text-body)', maxWidth: '58ch' }}>{p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------- the three questions */}
        <section id="how" className="ds-gutter" style={{ paddingBottom: 48 }}>
          <p className="ds-label" style={{ marginBottom: 8 }}>02 · THE THREE QUESTIONS</p>
          {[
            {
              step: 'STEP 01 · WHAT APPLIES TO YOU',
              h: 'One core sample. Every CSRD requirement, evaluated.',
              p: 'Enter your profile once. The engine evaluates every requirement in the CSRD pack and returns applies, does not apply, or requires judgment, with the why, cited to official sources. No silent “does not apply.”',
              sheet: <SheetApplicability />,
            },
            {
              step: 'STEP 02 · WHAT CHANGED',
              h: 'New rules land like fresh sediment. These pending acts are listed in the pack; no automatic updates run yet.',
              p: 'A tiered source register lists what each requirement cites; nothing scans it yet. Pending acts are listed from the pack with the requirements each would move, and until an act is actually in force, it changes nothing. Dated briefings and change monitoring are planned.',
              sheet: <SheetChange />,
            },
            {
              step: 'STEP 03 · WHAT TO DO, BY WHEN',
              h: 'From strata to schedule.',
              p: 'Applicable requirements instantiate obligations, each with an owner role and a deadline rule, and each one traceable back to the determination that created it. Calendar export is planned.',
              sheet: <SheetSchedule />,
            },
          ].map((row, i) => (
            <div
              key={row.step}
              className="ds-story-row"
              style={{
                display: 'grid', gridTemplateColumns: '1fr 460px', gap: 80, alignItems: 'center',
                padding: '44px 0', borderTop: i === 0 ? '1px solid var(--ds-ink)' : '1px solid var(--ds-hairline-1)',
              }}
            >
              <div>
                <p className="ds-mono ds-oxide" style={{ fontSize: 11, letterSpacing: '0.18em', marginBottom: 14 }}>{row.step}</p>
                <h3 className="ds-h3" style={{ marginBottom: 16 }}>{row.h}</h3>
                <p style={{ fontSize: 16, lineHeight: 1.68, color: 'var(--ds-text-muted)', maxWidth: '58ch' }}>{row.p}</p>
              </div>
              {row.sheet}
            </div>
          ))}
        </section>

        {/* -------------------------------------------------------- record */}
        <section
          id="record"
          className="ds-gutter ds-panel"
          style={{ borderTop: '1px solid var(--ds-ink)', borderBottom: '1px solid var(--ds-ink)', paddingBlock: 88 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 24 }}>
            <div style={{ gridColumn: 'span 5' }} className="ds-problem-head">
              <p className="ds-label" style={{ marginBottom: 18 }}>03 · THE RECORD</p>
              <h2 className="ds-h2" style={{ marginBottom: 28 }}>Built to survive inspection.</h2>
              <div className="ds-card-quiet" style={{ background: 'var(--ds-paper)', padding: 10 }}>
                <StrataSection answerable={answerable(coverage).length} planned={planned(coverage).length} />
              </div>
            </div>
            <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column' }} className="ds-problem-list">
              {PROOF.map((t, i) => (
                <div
                  key={t}
                  style={{
                    borderTop: '1px solid var(--ds-hairline-2)',
                    borderBottom: i === PROOF.length - 1 ? '1px solid var(--ds-hairline-2)' : undefined,
                    padding: '22px 0', display: 'flex', gap: 18, alignItems: 'flex-start',
                  }}
                >
                  <span className="ds-mono ds-oxide" style={{ fontSize: 11.5, paddingTop: 3 }}>[{String(i + 1).padStart(2, '0')}]</span>
                  <p style={{ fontSize: 16.5, lineHeight: 1.6, color: 'var(--ds-text-body)' }}>{t}</p>
                </div>
              ))}
              <p className="ds-micro" style={{ marginTop: 20, maxWidth: '62ch' }}>
                Today every requirement in the pack is still draft and unratified, and no country pack is
                ratified, so every result ends by saying national-law status requires review. That sentence
                is the product working, not the product failing.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ how it works */}
        <section className="ds-gutter" style={{ paddingBlock: 'clamp(56px, 8vw, 96px)' }}>
          <p className="ds-label" style={{ marginBottom: 32 }}>04 · HOW IT WORKS</p>
          <div className="ds-how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {HOW.map((h, i) => (
              <div key={h} style={{ borderTop: '2px solid var(--ds-oxide)', paddingTop: 18 }}>
                <p className="ds-mono ds-oxide" style={{ fontSize: 12, marginBottom: 10 }}>{String(i + 1).padStart(2, '0')}</p>
                <p className="ds-h4" style={{ fontFamily: 'var(--ds-font-display)' }}>{h}</p>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- coverage */}
        <section id="coverage" className="ds-gutter" style={{ paddingBottom: 'clamp(56px, 8vw, 96px)' }}>
          <p className="ds-label" style={{ marginBottom: 18 }}>05 · COVERAGE</p>
          <h2 className="ds-h2" style={{ maxWidth: '22ch', marginBottom: 12 }}>
            What we can answer, and what is planned.
          </h2>
          <p className="ds-body-lg" style={{ maxWidth: '62ch', marginBottom: 36 }}>
            CSRD is encoded as draft content for evaluation. Nothing is monitored or supported yet, and
            further regimes are planned. We publish the difference because you are entitled to know which
            answer you are getting.
          </p>
          <CoverageTable />
        </section>

        {/* --------------------------------------------------------- closing */}
        <section className="ds-gutter" style={{ paddingTop: 24, paddingBottom: 'clamp(72px, 10vw, 132px)' }}>
          <h2 className="ds-display-2" style={{ maxWidth: '17ch', textWrap: 'balance', marginBottom: 30 }}>
            Check what applies to you - free
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <Link className="ds-btn ds-btn-primary" href="/check" style={{ fontSize: 16.5, padding: '16px 28px' }}>
              Check what applies →
            </Link>
            <span className="ds-mono ds-faint" style={{ fontSize: 11.5, letterSpacing: '0.06em' }}>
              {CHECK_QUESTION_COUNT.standard} QUESTIONS, {CHECK_QUESTION_COUNT.parent} FOR A PARENT UNDERTAKING · CITED RESULT
            </span>
          </div>
        </section>
      </main>
      <Footer packVersion={stats.version} legalSnapshot={stats.legalSnapshot} />
    </>
  );
}
