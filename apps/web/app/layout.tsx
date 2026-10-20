import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthSessionProvider } from '../components/auth-session-provider';
import './globals.css';

export const metadata: Metadata = {
  description: 'Live rooms for shared moments and real-time conversation.',
  title: {
    default: 'LivePulse',
    template: '%s · LivePulse',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
