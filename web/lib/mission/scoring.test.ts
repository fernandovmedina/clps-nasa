import { describe, expect, it } from 'vitest';
import { setLang } from '@/lib/i18n';
import { fmtHours } from './scoring';

describe('fmtHours', () => {
  it('writes hours under two days and days with one decimal from two days on', () => {
    expect(fmtHours(5.4)).toBe('5 h');
    expect(fmtHours(47.6)).toBe('48 h');
    expect(fmtHours(48)).toBe('2.0 d');
    expect(fmtHours(60)).toBe('2.5 d');
  });

  it('keeps the same figures in English (en-US)', () => {
    setLang('en', { persist: false });
    expect(fmtHours(5.4)).toBe('5 h');
    expect(fmtHours(48)).toBe('2.0 d');
    expect(fmtHours(336)).toBe('14.0 d');
    expect(fmtHours(1200)).toBe('50.0 d');
  });
});
