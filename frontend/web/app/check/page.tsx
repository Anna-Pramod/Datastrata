import type { Metadata } from 'next';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { Footer } from '@/components/marketing/Footer';
import { CheckFlow } from '@/components/marketing/CheckFlow';
import { CHECK_QUESTION_COUNT } from '@/lib/checker';
import { planned } from '@/lib/coverage';
import { packStats } from '@/lib/pack';
import { siteCoverage } from '@/lib/site-coverage';

export const metadata: Metadata = {
  title: 'Free check · DataStrata',
  description: `${CHECK_QUESTION_COUNT.standard} questions, ${CHECK_QUESTION_COUNT.parent} for a parent undertaking, each one a fact the law turns on. A cited, three-valued CSRD result from the real applicability engine.`,
};

export default function CheckPage() {
  const stats = packStats();
  const plannedRegimes = planned(siteCoverage()).map((r) => r.short);
  return (
    <>
      <MarketingNav />
      <main id="main"><CheckFlow plannedRegimes={plannedRegimes} /></main>
      <Footer packVersion={stats.version} legalSnapshot={stats.legalSnapshot} />
    </>
  );
}
