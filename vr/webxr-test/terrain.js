import * as THREE from 'three';

/**
 * Carga un heightmap RAW16 little-endian + su JSON de contrato
 * (GET /api/sites/{id}/terrain de CLAUDE.md) y construye una malla
 * de Three.js a escala real (metros).
 *
 * @param {string} baseUrl - ej. './terrain/test-site'
 * @returns {Promise<{mesh: THREE.Mesh, contract: object}>}
 */
export async function loadTerrain(baseUrl) {
  const contract = await fetch(`${baseUrl}.json`).then((r) => r.json());
  const buffer = await fetch(`${baseUrl}.raw`).then((r) => r.arrayBuffer());

  const { size_px, extent_m, min_height_m, max_height_m } = contract;
  const heights = new Uint16Array(buffer); // little-endian nativo en la mayoria de plataformas

  if (heights.length !== size_px * size_px) {
    throw new Error(
      `Tamano inesperado: esperaba ${size_px * size_px} muestras, llegaron ${heights.length}`
    );
  }

  const geometry = new THREE.PlaneGeometry(
    extent_m,
    extent_m,
    size_px - 1,
    size_px - 1
  );
  geometry.rotateX(-Math.PI / 2); // de XY (plano) a XZ (piso horizontal, Y arriba)

  const posAttr = geometry.attributes.position;
  const scale = (max_height_m - min_height_m) / 65535;

  for (let row = 0; row < size_px; row++) {
    for (let col = 0; col < size_px; col++) {
      const sample = heights[row * size_px + col];
      const heightM = min_height_m + sample * scale;
      const vertexIndex = row * size_px + col;
      posAttr.setY(vertexIndex, heightM - min_height_m); // relativo al minimo del sitio
    }
  }
  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x888888,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.contract = contract;

  const [siteCol, siteRow] = contract.site_px;
  const siteSample = heights[siteRow * size_px + siteCol];
  const siteLocalHeightM = min_height_m + siteSample * scale - min_height_m;

  return { mesh, contract, siteLocalHeightM };
}
