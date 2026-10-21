import type { Metadata } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Archivo({ weight: ['700', '800'], subsets: ['latin'], variable: '--font-display', display: 'swap' });
const ui = Inter({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const mono = JetBrains_Mono({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'DataStrata: know what applies, what changed, and what to do by when',
  description:
    "DataStrata evaluates CSRD applicability from your stated facts, cites each requirement's sources and shows what remains unresolved.",
  openGraph: {
    title: 'DataStrata: regulatory intelligence for market access',
    description: "DataStrata evaluates CSRD applicability from your stated facts, cites each requirement's sources and shows what remains unresolved.",
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>
        <a className="ds-skip" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
