import * as THREE from 'three';
import type { ClientMessage } from '@touchdown/core';

/** 10 Hz - tiny payload (7 numbers), see core/src/room.ts cam_update. */
export const CAM_SEND_INTERVAL_S = 1 / 10;

export interface CamHost {
  readonly isHost: boolean;
  readonly camera: { updateMatrixWorld(): void; matrixWorld: THREE.Matrix4 };
  readonly room: { send(msg: ClientMessage): void };
}

/** The inspector's view for whoever follows the room: its camera pose, at most every 100 ms, and only from the host. */
export class CamBroadcaster {
  private lastSentAt = -Infinity;
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private scale = new THREE.Vector3();

  constructor(private host: CamHost) {}

  /** `t` is the app clock. True when a message went out. */
  update(t: number, siteId: string): boolean {
    if (!this.host.isHost || t - this.lastSentAt <= CAM_SEND_INTERVAL_S) return false;
    this.lastSentAt = t;
    this.host.camera.updateMatrixWorld();
    this.host.camera.matrixWorld.decompose(this.pos, this.quat, this.scale);
    this.host.room.send({
      type: 'cam_update', site_id: siteId,
      px: this.pos.x, py: this.pos.y, pz: this.pos.z,
      qx: this.quat.x, qy: this.quat.y, qz: this.quat.z, qw: this.quat.w,
    });
    return true;
  }
}
