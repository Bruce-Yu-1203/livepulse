import type { Metadata } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';

import { AuthSessionProvider } from '../components/auth-session-provider';
import { AuthDialogProvider } from '../components/auth-dialog-provider';
import { themeInitScript } from '../lib/theme';
import './globals.css';

const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--lp-font-display',
});

const bodyFont = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--lp-font-body',
});

export const metadata: Metadata = {
  description: 'Live rooms for shared moments and real-time conversation.',
  title: {
    default: 'LivePulse',
    template: '%s · LivePulse',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${displayFont.variable} ${bodyFont.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AuthSessionProvider>
          <AuthDialogProvider>{children}</AuthDialogProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
