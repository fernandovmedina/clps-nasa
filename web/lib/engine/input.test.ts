import { describe, expect, it } from 'vitest';
import { rightAButtonHeld } from './input';

const pad = (...pressed: boolean[]) => ({ buttons: pressed.map((p) => ({ pressed: p })) });

describe('rightAButtonHeld', () => {
  it('is true only while the right controller holds button A (index 4)', () => {
    expect(rightAButtonHeld([{ handedness: 'right', gamepad: pad(false, false, false, false, true) }])).toBe(true);
    expect(rightAButtonHeld([{ handedness: 'right', gamepad: pad(true, true, true, true, false) }])).toBe(false);
  });

  it('ignores the left controller, hands without a gamepad and an empty list', () => {
    expect(rightAButtonHeld([{ handedness: 'left', gamepad: pad(false, false, false, false, true) }])).toBe(false);
    expect(rightAButtonHeld([{ handedness: 'right', gamepad: null }, { handedness: 'right' }])).toBe(false);
    expect(rightAButtonHeld([])).toBe(false);
  });

  it('finds the right controller among several input sources', () => {
    expect(rightAButtonHeld([
      { handedness: 'left', gamepad: pad(false) },
      { handedness: 'right', gamepad: pad(false, false, false, false, true) },
    ])).toBe(true);
  });
});
