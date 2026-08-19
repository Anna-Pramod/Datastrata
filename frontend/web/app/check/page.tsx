import type { Metadata } from 'next';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { Footer } from '@/components/marketing/Footer';
import { CheckFlow } from '@/components/marketing/CheckFlow';
import { packStats } from '@/lib/pack';

export const metadata: Metadata = {
  title: 'Free check — DataStrata',
  description: 'Eight questions, each one a fact the law turns on. A cited, three-valued CSRD result from the real applicability engine.',
};

export default function CheckPage() {
  const stats = packStats();
  return (
    <>
      <MarketingNav />
      <main id="main"><CheckFlow /></main>
      <Footer packVersion={stats.version} legalSnapshot={stats.legalSnapshot} />
    </>
  );
}
