/**
 * The landing page. A server component, so the pack-derived numbers (sources
 * watched, requirements encoded, pending acts) are read from the real CSRD
 * knowledge pack at request time rather than hard-coded into marketing copy.
 */

import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { Checker } from '@/components/Checker';
import { WhatItDoes } from '@/components/WhatItDoes';
import { ChangeWatch } from '@/components/ChangeWatch';
import { Pricing } from '@/components/Pricing';
import { Footer } from '@/components/Footer';
import { csrdPack } from '@/lib/pack';

export default function Page() {
  const pack = csrdPack();

  return (
    <>
      <Nav />
      <main id="main">
        <Hero sourcesWatched={pack.sources.length} />
        <Checker />
        <WhatItDoes />
        <ChangeWatch
          items={pack.changeWatch.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            affectsRequirements: c.affectsRequirements,
            note: c.expected,
          }))}
          sourceCount={pack.sources.length}
          requirementCount={pack.requirements.length}
        />
        <Pricing />
      </main>
      <Footer legalSnapshot={pack.legalSnapshot} packVersion={pack.version} />
    </>
  );
}
