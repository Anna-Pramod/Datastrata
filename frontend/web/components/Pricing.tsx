const TIERS = [
  {
    stage: 'Stage 1 · Wedge',
    name: 'Market Access',
    tagline: 'For a single exporter reaching a first cited answer.',
    features: [
      'Document-assisted profile & checker',
      'Applicability, determinations & universe map',
      'Weekly briefing & change loop',
      'Obligation register & gap ledger',
    ],
    cta: 'Start with the free check',
    href: '#checker',
    className: 'tier tier-1',
    btn: 'btn btn-sm btn-cream',
  },
  {
    stage: 'Stage 2 · Operations',
    name: 'Compliance Ops',
    tagline: 'When the whole team holds operational state.',
    features: [
      'Everything in Market Access',
      'Native tasks, approvals & SLAs',
      'Full evidence registry & controls',
      'Assurance readiness & quarterly reports',
    ],
    cta: 'Talk to us',
    href: '#checker',
    className: 'tier tier-2',
    btn: 'btn btn-sm btn-mustard',
  },
  {
    stage: 'Stage 3 · Assurance',
    name: 'Assurance & Ecosystem',
    tagline: 'Buyer portals, findings loop and shared lanes.',
    features: [
      'Everything in Compliance Ops',
      'Auditor / buyer read-only portals',
      'Findings loop & shared-lane data',
      'Optional managed evidence custody',
    ],
    cta: 'Talk to us',
    href: '#checker',
    className: 'tier tier-3',
    btn: 'btn btn-sm btn-cream',
  },
];

export function Pricing() {
  return (
    <section className="section" id="pricing" aria-labelledby="pricing-h">
      <div className="wrap">
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <span className="eyebrow">Pricing</span>
          <h2 id="pricing-h" style={{ fontSize: 'clamp(26px, 4vw, 34px)', margin: '12px 0 8px' }}>
            Start at the wedge, grow into the whole spine
          </h2>
          <p className="lede" style={{ maxWidth: 560, margin: '0 auto' }}>
            One product spine, activated in stages. Nothing you build in Stage 1 is thrown away later.
          </p>
        </div>
        <div className="tiers">
          {TIERS.map((t) => (
            <div className={t.className} key={t.name}>
              <span className="tier-stage">{t.stage}</span>
              <h3>{t.name}</h3>
              <p className="tier-tagline">{t.tagline}</p>
              <ul className="tier-features">
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {/* Placeholder destination — scrolls to the checker until sales routing exists. */}
              <a className={t.btn} href={t.href}>{t.cta}</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
