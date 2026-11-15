import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Narrator } from './narration';

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  lang = '';
  voice: unknown = null;
  rate = 1;
  constructor(readonly text: string) {}
}

describe('Narrator suspension', () => {
  const spoken: string[] = [];
  const cancel = vi.fn();

  beforeEach(() => {
    spoken.length = 0;
    cancel.mockClear();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [],
      addEventListener() {},
      removeEventListener() {},
      cancel,
      speak: (u: FakeUtterance) => { spoken.push(u.text); u.onend?.(); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('cancels what it was saying when suspended and ignores new lines until released', async () => {
    const narrator = new Narrator();
    narrator.setSuspended(true);
    expect(cancel).toHaveBeenCalled();
    narrator.speak('Aproximándonos a la Luna');
    await Promise.resolve();
    expect(spoken).toEqual([]);

    narrator.setSuspended(false);
    narrator.speak('Preparando inserción orbital');
    await vi.waitFor(() => expect(spoken).toEqual(['Preparando inserción orbital']));
    narrator.dispose();
  });
});
