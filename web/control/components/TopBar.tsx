'use client'

import { Moon, PanelLeft, Sun } from 'lucide-react'
import { useI18n, type Lang } from '@/control/i18n'
import type { Theme } from '@/control/lib/prefs'

interface Props {
  theme: Theme
  lang: Lang
  scrolled: boolean
  onChangeLang: (lang: Lang) => void
  onToggleTheme: () => void
  onOpenCatalog: () => void
}

export function TopBar({ theme, lang, onToggleTheme, onChangeLang, scrolled, onOpenCatalog }: Props) {
  const { t } = useI18n()
  return (
    <header className="no-print top-bar page-margin fixed inset-x-0 top-0 z-40 pt-3">
      <div
        className={`mx-auto flex min-h-14 max-w-[1600px] items-center justify-between gap-3 rounded-2xl border-[0.5px] px-2 sm:px-4 ${
          scrolled ? 'glass' : 'border-transparent bg-transparent'
        }`}
      >
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-quiet px-0 xl:hidden" aria-label={t('openCatalog')} onClick={onOpenCatalog}>
            <PanelLeft size={20} aria-hidden="true" />
          </button>
          <span className="text-body font-semibold tracking-[0.04em] max-[359px]:hidden sm:text-heading sm:tracking-[0.08em]">{t('appName')}</span>
          <span className="hidden text-caption text-label-2 sm:inline">{t('appSubtitle')}</span>
        </div>
        <div className="flex items-center gap-3">
          <div role="group" aria-label={t('language')} className="flex gap-1 rounded-control border border-line-strong p-1">
            {(['es', 'en'] as const).map((code) => (
              <button
                key={code}
                type="button"
                lang={code}
                className="btn btn-quiet px-3 aria-pressed:bg-label aria-pressed:text-base"
                aria-pressed={lang === code}
                title={code === 'es' ? t('languageEs') : t('languageEn')}
                onClick={() => onChangeLang(code)}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-quiet px-0"
            aria-label={theme === 'dark' ? t('themeToLight') : t('themeToDark')}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  )
}
