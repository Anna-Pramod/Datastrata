import type { Metadata } from 'next';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { Footer } from '@/components/marketing/Footer';
import { CheckFlow } from '@/components/marketing/CheckFlow';
import { checkQuestionCount } from '@/lib/check-view';
import { planned } from '@/lib/coverage';
import { packStats } from '@/lib/pack';
import { siteCoverage } from '@/lib/site-coverage';

/** How many questions a visitor answers, read from the question model over proposal §4.5's visitor types, never written here. */
const questions = checkQuestionCount();

export const metadata: Metadata = {
  title: 'Free check · DataStrata',
  description: `${questions.fewest} to ${questions.most} questions, each one a fact the law turns on, and ${questions.optional} more to check a parent company on its own. A cited, three-valued CSRD result from the real applicability engine.`,
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
