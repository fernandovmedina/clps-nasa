import * as THREE from 'three';

/**
 * Convierte azimut/elevacion topocentricos (como los devuelve JPL Horizons /
 * el contrato GET /api/sites/{id}/ephemeris de CLAUDE.md) a un vector
 * direccion unitario en el espacio de Three.js.
 *
 * CONVENCION ASUMIDA (confirmar con la persona de Datos antes de usar
 * datos reales — ver docs/jpl-horizons.md):
 *   - Azimut: 0deg = Norte, crece en sentido horario hacia el Este (90deg).
 *   - Elevacion: 0deg = horizonte, 90deg = cenit.
 *   - En Three.js: +Y = arriba, -Z = Norte, +X = Este.
 *
 * Si el pipeline usa una convencion distinta de "norte" en el polo sur,
 * este mapeo hay que ajustarlo aqui, no en cada sitio donde se use.
 *
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @returns {THREE.Vector3} vector unitario
 */
export function azElToDirection(azimuthDeg, elevationDeg) {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);

  const x = Math.cos(el) * Math.sin(az); // Este
  const y = Math.sin(el); // Arriba
  const z = -Math.cos(el) * Math.cos(az); // Norte = -Z

  return new THREE.Vector3(x, y, z).normalize();
}

/**
 * Coloca un objeto (Sol/Tierra) a una distancia fija en la direccion
 * az/el dada, y orienta una luz direccional para que coincida (solo Sol).
 */
export function placeCelestialBody(object3D, azimuthDeg, elevationDeg, distance) {
  const dir = azElToDirection(azimuthDeg, elevationDeg);
  object3D.position.copy(dir.multiplyScalar(distance));
}
