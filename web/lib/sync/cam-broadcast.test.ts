import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ClientMessage } from '@touchdown/core';
import { CAM_SEND_INTERVAL_S, CamBroadcaster } from './cam-broadcast';

function host(isHost: boolean) {
  const sent: ClientMessage[] = [];
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1, 2, 3);
  camera.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  camera.updateMatrixWorld();
  return { isHost, camera, room: { send: vi.fn((m: ClientMessage) => { sent.push(m); }) }, sent };
}

describe('CamBroadcaster', () => {
  it('sends the camera pose of the host with the site id', () => {
    const h = host(true);
    expect(new CamBroadcaster(h).update(0, 'malapert-a')).toBe(true);
    const msg = h.sent[0]!;
    expect(msg).toMatchObject({ type: 'cam_update', site_id: 'malapert-a', px: 1, py: 2, pz: 3 });
    const q = (msg as Extract<ClientMessage, { type: 'cam_update' }>);
    expect(q.qy).toBeCloseTo(Math.SQRT1_2, 5);
    expect(q.qw).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('sends at 10 Hz and no faster, whatever the frame rate', () => {
    const h = host(true);
    const cam = new CamBroadcaster(h);
    let t = 0;
    for (let i = 0; i < 180; i++) { cam.update(t, 's'); t += 1 / 60; } // three seconds at 60 fps
    expect(CAM_SEND_INTERVAL_S).toBe(0.1);
    expect(h.sent.length).toBeGreaterThanOrEqual(25);
    expect(h.sent.length).toBeLessThanOrEqual(30);
  });

  it('keeps pace on a 90 Hz headset too', () => {
    const h = host(true);
    const cam = new CamBroadcaster(h);
    let t = 0;
    for (let i = 0; i < 270; i++) { cam.update(t, 's'); t += 1 / 90; }
    expect(h.sent.length).toBeGreaterThanOrEqual(25);
    expect(h.sent.length).toBeLessThanOrEqual(30);
  });

  it('never sends from the monitor', () => {
    const h = host(false);
    const cam = new CamBroadcaster(h);
    for (let t = 0; t < 3; t += 1 / 60) expect(cam.update(t, 's')).toBe(false);
    expect(h.sent).toEqual([]);
  });

  it('starts sending when a monitor becomes the host, and stops when the host becomes a monitor', () => {
    const h = host(false) as ReturnType<typeof host> & { isHost: boolean };
    const cam = new CamBroadcaster(h);
    cam.update(0, 's');
    expect(h.sent).toHaveLength(0);
    h.isHost = true;
    cam.update(0.2, 's');
    expect(h.sent).toHaveLength(1);
    h.isHost = false;
    cam.update(1, 's');
    expect(h.sent).toHaveLength(1);
  });
});
