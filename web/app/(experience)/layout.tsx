import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@/styles/tokens.css';
import '../globals.css';
import { BOOT_SCRIPT } from '@/control/lib/prefs';

export const metadata: Metadata = {
  title: 'Lunar South Pole · Site Planner',
  description: 'Selección de sitios de alunizaje en el polo sur lunar — escritorio y VR (Meta Quest).',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#faf9f5', colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
