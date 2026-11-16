'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { followDict } from '@/lib/i18n/dicts/ui-follow';
import { missionDict } from '@/lib/i18n/dicts/ui-mission';
import { useT } from '@/lib/i18n/react';
import dialog from './Dialog.module.css';
import layer from './MissionLayer.module.css';

interface Props {
  /** The room this client is in now: typing it again is not a way to follow anything. */
  code: string;
  onJoin: (code: string) => boolean;
  onClose: () => void;
  /** Back to the main route for someone with no code: explore the mission alone. Hidden when absent. */
  onExplore?: () => void;
}

const FOCUSABLE = 'input:not(:disabled), button:not(:disabled)';

/** "Seguir una misión": the tracking code the crew shares turns this client into its follower. */
export default function FollowMissionDialog({ code, onJoin, onClose, onExplore }: Props) {
  const t = useT(followDict);
  const tm = useT(missionDict);
  const titleId = useId();
  const errorId = useId();
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<'same' | 'invalid' | null>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    field.current?.focus();
    return () => {
      if (previous && previous !== document.body && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const first = items[0], last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = value.trim().toUpperCase();
    if (!next || !onJoin(next)) {
      setError(next === code ? 'same' : 'invalid');
      return;
    }
    onClose();
  };

  return (
    <>
      <div className={dialog.veil} data-level="follow" aria-hidden="true" />
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={dialog.card}
        data-level="follow"
        onKeyDown={trapTab}
      >
        <form className={dialog.form} noValidate onSubmit={submit}>
          <div className={dialog.head}>
            <p className={dialog.eyebrow}>{t('eyebrow')}</p>
            <h2 id={titleId} className={dialog.title}>{t('title')}</h2>
            <p className={dialog.lede}>{t('ledeCode')}</p>
            <p className={dialog.lede}>{t('ledeWhere', { label: tm('block.code') })}</p>
          </div>

          <label className={dialog.field}>
            <span>{t('field')}</span>
            <input
              ref={field}
              className={dialog.input}
              data-size="lg"
              value={value}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={64}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
            />
          </label>
          {error && <p id={errorId} role="alert" className={dialog.error}>{t(error)}</p>}

          <div className={dialog.actions}>
            <button type="button" className={layer.btn} onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className={layer.btn} data-variant="cta">{t('connect')}</button>
          </div>
          {onExplore && (
            <p className={dialog.lede}>
              {t('noCode')}{' '}
              <button type="button" className={layer.linkBtn} onClick={onExplore}>{t('explore')}</button>
            </p>
          )}
        </form>
      </div>
    </>
  );
}
