import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Astronaut, astronautSpot } from './astronaut';

const unit = (deg: number) => new THREE.Vector3(Math.sin(deg * Math.PI / 180), 0, -Math.cos(deg * Math.PI / 180));
const cross = (a: THREE.Vector3, b: THREE.Vector3) => a.x * b.z - a.z * b.x;

function rig() {
  const model = new THREE.Group();
  const names = ['hips', 'torso', 'chest', 'helmet', 'arm_r', 'arm_l', 'leg_r', 'leg_l'];
  const nodes: Record<string, THREE.Object3D> = {};
  for (const name of names) {
    const node = new THREE.Group();
    node.name = name; model.add(node); nodes[name] = node;
  }
  nodes.chest.position.set(0, 0.13, 0);
  return { astronaut: new Astronaut(model), nodes };
}

afterEach(() => vi.unstubAllGlobals());

describe('astronautSpot', () => {
  const cases = [0, 40, 95, 150, 210, 275, 330];

  it('stands 4.5 to 6 m from the lander, ahead of it as seen from the viewer and clear of the line of sight', () => {
    for (const sunAz of cases) {
      for (const viewAz of [10, 125, 250]) {
        const view = unit(viewAz), spot = astronautSpot(unit(sunAz), view, unit(viewAz + 130));
        expect(spot.length()).toBeGreaterThanOrEqual(4.5 - 1e-6);
        expect(spot.length()).toBeLessThanOrEqual(6 + 1e-6);
        expect(spot.dot(view)).toBeGreaterThan(0);
        expect(Math.abs(cross(view, spot))).toBeGreaterThanOrEqual(3.2 - 1e-6);
        expect(spot.y).toBe(0);
      }
    }
  });

  it('keeps his shadow off the lander and out of the lander shadow', () => {
    for (const sunAz of cases) {
      const sun = unit(sunAz), spot = astronautSpot(sun, unit(200), unit(330));
      const acrossSun = Math.abs(cross(sun, spot));
      expect(spot.dot(sun) < 0 ? acrossSun >= 7 - 1e-6 : acrossSun >= 2.8 - 1e-6).toBe(true);
    }
  });

  it('is deterministic', () => {
    const a = astronautSpot(unit(30), unit(200), unit(330)), b = astronautSpot(unit(30), unit(200), unit(330));
    expect(a.equals(b)).toBe(true);
  });
});

describe('Astronaut', () => {
  const run = (a: Astronaut, seconds: number, viewer: THREE.Vector3, earth: THREE.Vector3) => {
    for (let i = 0; i < seconds * 30; i++) a.update(1 / 30, viewer, earth);
  };
  const viewer = new THREE.Vector3(10, 1.6, 20), earth = new THREE.Vector3(-20000, 3000, -22000);

  it('faces the viewer when placed', () => {
    const { astronaut } = rig();
    astronaut.place(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0));
    expect(astronaut.root.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('breathes: the chest moves a few millimetres and the torso swells', () => {
    const { astronaut, nodes } = rig();
    astronaut.place(new THREE.Vector3(), viewer);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 4.6 * 30; i++) {
      astronaut.update(1 / 30, viewer, earth);
      lo = Math.min(lo, nodes.chest.position.y); hi = Math.max(hi, nodes.chest.position.y);
    }
    expect(hi - lo).toBeGreaterThan(0.001);
    expect(hi - lo).toBeLessThan(0.003);
    expect(nodes.torso.scale.x).toBeGreaterThanOrEqual(1);
  });

  it('with reduced motion only breathes', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }));
    const { astronaut, nodes } = rig();
    astronaut.place(new THREE.Vector3(), viewer);
    astronaut.setPoint(1);
    run(astronaut, 20, viewer, earth);
    for (const name of ['hips', 'helmet', 'arm_r', 'arm_l', 'leg_r', 'leg_l']) {
      expect(nodes[name].quaternion.angleTo(new THREE.Quaternion())).toBe(0);
      expect(nodes[name].position.length()).toBe(0);
    }
    expect(nodes.chest.position.y).toBeGreaterThan(0.13);
  });

  it('turns the helmet toward the Earth within the neck limits and back again', () => {
    const { astronaut, nodes } = rig();
    astronaut.place(new THREE.Vector3(), viewer);
    let peak = 0;
    for (let i = 0; i < 28 * 30; i++) {
      astronaut.update(1 / 30, viewer, earth);
      peak = Math.max(peak, nodes.helmet.quaternion.angleTo(new THREE.Quaternion()));
    }
    expect(peak).toBeGreaterThan(0.4);
    expect(peak).toBeLessThan(1.4);
    expect(nodes.helmet.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(0.05);
  });

  it('points the arm on the Earth side along the line to the Earth, then lowers it', () => {
    const { astronaut, nodes } = rig();
    astronaut.place(new THREE.Vector3(), viewer);
    astronaut.setMode('point');
    astronaut.setPoint(1);
    run(astronaut, 8, viewer, earth);
    const earthDir = earth.clone().normalize();
    const reach = (arm: THREE.Object3D, axis: number) => new THREE.Vector3(axis, 0, 0).applyQuaternion(arm.quaternion).applyQuaternion(astronaut.root.quaternion);
    const right = reach(nodes.arm_r, -1), left = reach(nodes.arm_l, 1);
    const best = right.dot(earthDir) > left.dot(earthDir) ? right : left;
    expect(best.dot(earthDir)).toBeGreaterThan(0.95);
    astronaut.setPoint(0);
    run(astronaut, 8, viewer, earth);
    for (const arm of [nodes.arm_r, nodes.arm_l]) expect(arm.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.5);
    expect(reach(nodes.arm_l, 1).y).toBeLessThan(-0.5);
    expect(reach(nodes.arm_r, -1).y).toBeLessThan(-0.5);
  });

  it('waves with the right arm toward the viewer from time to time', () => {
    const { astronaut, nodes } = rig();
    astronaut.place(new THREE.Vector3(), viewer);
    let highest = -1, lowest = 1;
    for (let i = 0; i < 44 * 30; i++) {
      astronaut.update(1 / 30, viewer, earth);
      const y = new THREE.Vector3(-1, 0, 0).applyQuaternion(nodes.arm_r.quaternion).y;
      highest = Math.max(highest, y); lowest = Math.min(lowest, y);
    }
    expect(highest).toBeGreaterThan(0.5);
    expect(lowest).toBeLessThan(-0.5);
  });

  it('keeps every pose finite', () => {
    const { astronaut, nodes } = rig();
    astronaut.place(new THREE.Vector3(), viewer);
    astronaut.setMode('point');
    for (let i = 0; i < 60 * 30; i++) {
      astronaut.setPoint(Math.sin(i / 90) * 0.7 + 0.5);
      astronaut.update(1 / 30, viewer, earth);
    }
    for (const node of Object.values(nodes)) {
      expect(Number.isFinite(node.quaternion.lengthSq())).toBe(true);
      expect(Number.isFinite(node.position.length())).toBe(true);
    }
  });
});
