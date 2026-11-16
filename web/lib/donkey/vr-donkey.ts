import { DonkeyGuide } from './donkey';

const DISTANCE_M = 1.2;
/** Low and to the right of the viewer, where it does not cover the phase panels or the exit button on the left. */
const AZIMUTH_DEG = 34;
const DEPRESSION_DEG = 32;
/** The landing cabin has its own console low in front: there it stands higher, on the window pillar. */
const CABIN_AZIMUTH_DEG = 50;
const CABIN_DEPRESSION_DEG = 16;

/**
 * The Burro Pardo hopping beside the viewer in VR, as pure decoration (no voice, no network). Child of the rig;
 * the engine calls `update` every frame with whether VR is showing and whether the phase owns the cabin console.
 */
export class VrDonkey {
  private readonly donkey = new DonkeyGuide().load();
  private inCabin: boolean | null = null;

  constructor(private readonly eyeHeight: number) {
    this.donkey.group.visible = false;
  }

  get group() { return this.donkey.group; }

  update(visible: boolean, inCabin: boolean) {
    this.donkey.group.visible = visible;
    if (!visible) return;
    if (inCabin !== this.inCabin) {
      this.inCabin = inCabin;
      this.placeAt(inCabin ? CABIN_AZIMUTH_DEG : AZIMUTH_DEG, inCabin ? CABIN_DEPRESSION_DEG : DEPRESSION_DEG);
    }
    this.donkey.update(performance.now() / 1000);
  }

  dispose() { this.donkey.dispose(); }

  /** Feet on the line of sight at that azimuth / depression, facing the viewer. */
  private placeAt(azimuthDeg: number, depressionDeg: number) {
    const a = (depressionDeg * Math.PI) / 180;
    const z = (azimuthDeg * Math.PI) / 180;
    const x = DISTANCE_M * Math.cos(a) * Math.sin(z);
    const zz = -DISTANCE_M * Math.cos(a) * Math.cos(z);
    this.donkey.group.position.set(x, this.eyeHeight - DISTANCE_M * Math.sin(a), zz);
    this.donkey.group.rotation.y = Math.atan2(-x, -zz);
  }
}
