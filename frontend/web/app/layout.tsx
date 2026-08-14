import type { Metadata } from 'next';
import { DM_Serif_Display, Space_Grotesk, Space_Mono } from 'next/font/google';
import './globals.css';

const display = DM_Serif_Display({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Space_Grotesk({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = Space_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'DataStrata — know what applies, what changed, and what to do by when',
  description:
    'DataStrata watches EU sustainability market-access rules for your business, determines what applies with citations, and turns obligations into owned work. Run a free CSRD check against the real applicability engine.',
  openGraph: {
    title: 'DataStrata — EU sustainability market access, answered and maintained',
    description:
      'A deterministic, cited answer to what applies to you — and an honest "we do not know yet" wherever a fact is missing.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
