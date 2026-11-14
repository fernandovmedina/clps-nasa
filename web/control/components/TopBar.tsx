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
    <header
      className={`no-print top-bar sticky top-0 z-40 border-b-[0.5px] bg-base ${scrolled ? 'border-line-strong' : 'border-line'}`}
    >
      <div className="page-margin mx-auto flex max-w-[1440px] items-center justify-between gap-3 py-3 sm:py-4">
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-quiet px-0 xl:hidden" aria-label={t('openCatalog')} onClick={onOpenCatalog}>
            <PanelLeft size={20} aria-hidden="true" />
          </button>
          <span className="text-[1.0625rem] font-[650] max-[359px]:hidden">{t('appName')}</span>
          <span className="hidden text-[0.875rem] text-label-2 sm:inline">{t('appSubtitle')}</span>
        </div>
        <div className="flex items-center gap-3">
          <div role="group" aria-label={t('language')} className="flex gap-1 rounded-[10px] bg-raised p-1">
            {(['es', 'en'] as const).map((code) => (
              <button
                key={code}
                type="button"
                lang={code}
                className="btn btn-quiet px-3 text-label-2 aria-pressed:bg-toggle-on aria-pressed:text-label"
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
            className="btn btn-outline px-0"
            aria-label={theme === 'dark' ? t('themeToLight') : t('themeToDark')}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  )
}
