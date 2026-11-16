'use client';

import { setLang } from '@/lib/i18n';
import { langDict } from '@/lib/i18n/dicts/lang';
import { useLang, useT } from '@/lib/i18n/react';
import type { Lang } from '@/lib/i18n';
import styles from './LangToggle.module.css';

const OPTIONS = ['es', 'en'] as const;

interface Props {
  /** Después de cambiar el idioma (no si se vuelve a pulsar el actual): la capa lo usa para repintar el HUD sin esperar al sondeo. */
  onChange?: (lang: Lang) => void;
}

/** Selector ES/EN de la experiencia. Comparte la preferencia con Mission Control. */
export default function LangToggle({ onChange }: Props) {
  const lang = useLang();
  const t = useT(langDict);
  return (
    <div role="group" aria-label={t('group')} className={styles.group}>
      {OPTIONS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          className={styles.opt}
          aria-pressed={lang === code}
          title={t(code)}
          onClick={() => {
            if (code === lang) return;
            setLang(code);
            onChange?.(code);
          }}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
