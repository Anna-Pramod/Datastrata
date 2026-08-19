import type { Metadata } from 'next';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { Footer } from '@/components/marketing/Footer';
import { ContactForm } from '@/components/marketing/ContactForm';
import { COMPANY } from '@/lib/company';
import { packStats } from '@/lib/pack';

export const metadata: Metadata = {
  title: 'Contact — DataStrata',
  description: 'Talk to the people who build and maintain the record.',
};

export default function ContactPage() {
  const stats = packStats();
  return (
    <>
      <MarketingNav current="contact" />
      <main id="main" className="ds-gutter" style={{ paddingBlock: 'clamp(48px, 7vw, 88px)' }}>
        <p className="ds-label" style={{ marginBottom: 18 }}>Contact</p>
        <h1 className="ds-h2" style={{ maxWidth: '20ch', marginBottom: 20 }}>
          Talk to the people who maintain the record.
        </h1>
        <p className="ds-body-lg" style={{ maxWidth: '58ch', marginBottom: 44 }}>
          {COMPANY.scale} Whoever replies to you is the same person who encodes the requirements and
          signs them off — there is no sales layer between you and the record.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 560px) 1fr', gap: 'clamp(32px, 6vw, 80px)', alignItems: 'start' }} className="ds-contact-grid">
          <ContactForm />
          <div>
            <p className="ds-label" style={{ marginBottom: 12 }}>Direct</p>
            <p className="ds-body" style={{ marginBottom: 24 }}>
              <a href={`mailto:${COMPANY.email}`} style={{ color: 'var(--ds-oxide)', borderBottom: '1px solid rgba(169,59,42,.4)' }}>
                {COMPANY.email}
              </a>
            </p>

            <p className="ds-label" style={{ marginBottom: 12 }}>Good reasons to write</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              <li className="ds-body-sm">You want a regime encoded that we only watch today.</li>
              <li className="ds-body-sm">You think one of our determinations is wrong. Tell us which and why — that is the most useful message we can get.</li>
              <li className="ds-body-sm">You are an expert who could ratify content in a jurisdiction we have not covered.</li>
              <li className="ds-body-sm">You ran the free check and want the answer built on sourced documents instead of stated facts.</li>
            </ul>

            <p className="ds-micro" style={{ maxWidth: '46ch' }}>
              WE HOLD NOTHING YOU DO NOT SEND US. THE FREE CHECK STORES NO PROFILE, SETS NO COOKIE AND
              MAKES NO THIRD-PARTY REQUEST. PACK {stats.version.toUpperCase()} · SNAPSHOT {stats.legalSnapshot}.
            </p>
          </div>
        </div>
      </main>
      <Footer packVersion={stats.version} legalSnapshot={stats.legalSnapshot} />
    </>
  );
}
