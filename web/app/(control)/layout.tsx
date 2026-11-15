import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/inter'
import '@/control/styles/globals.css'
import { BOOT_SCRIPT } from '@/control/lib/prefs'

export const metadata: Metadata = {
  title: 'Touchdown · Mission Control',
  description: 'Lunar landing site and date planner with real horizon masks and JPL Horizons ephemerides.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
