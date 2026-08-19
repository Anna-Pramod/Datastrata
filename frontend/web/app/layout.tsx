import type { Metadata } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Archivo({ weight: ['700', '800'], subsets: ['latin'], variable: '--font-display', display: 'swap' });
const ui = Inter({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const mono = JetBrains_Mono({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'DataStrata: know what applies, what changed, and what to do by when',
  description:
    'Sustainability regulation accumulates like sediment. DataStrata reads every layer for your company and returns one clear, cited, continuously maintained answer.',
  openGraph: {
    title: 'DataStrata: regulatory intelligence for market access',
    description: 'One clear, cited, continuously maintained answer to what applies to you.',
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
