/**
 * Candidate landing sites near the lunar south pole.
 *
 * Names follow the Artemis III candidate regions announced by NASA plus the
 * Shackleton–de Gerlache ridge. COORDINATES AND TERRAIN VALUES ARE APPROXIMATE
 * demo values — replace them with LOLA / Quickmap data from your backend.
 */
export interface SiteInput {
  id: string;
  name: string;
  lat: number;        // deg (negative = south)
  lon: number;        // deg east
  elevationKm: number; // height above the local mean surface (raises the horizon dip)
  slopeDeg: number;   // mean slope inside the landing ellipse
  horizonDeg: number; // mean elevation of the surrounding terrain horizon
  note?: string;
}

export const DEFAULT_SITES: SiteInput[] = [
  { id: 'malapert', name: 'Macizo Malapert', lat: -86.0, lon: 2.9, elevationKm: 5.0, slopeDeg: 6.5, horizonDeg: 0.6, note: 'Macizo alto con vista casi continua a la Tierra.' },
  { id: 'cabeus-b', name: 'Pico cerca de Cabeus B', lat: -84.6, lon: -57.0, elevationKm: 2.4, slopeDeg: 5.8, horizonDeg: 1.1 },
  { id: 'haworth', name: 'Haworth', lat: -86.9, lon: -4.0, elevationKm: 1.2, slopeDeg: 7.4, horizonDeg: 1.6, note: 'Junto a una región en sombra permanente.' },
  { id: 'mouton-plateau', name: 'Meseta de Mons Mouton', lat: -85.3, lon: 33.5, elevationKm: 5.6, slopeDeg: 3.2, horizonDeg: 0.4, note: 'Meseta amplia y plana.' },
  { id: 'mouton', name: 'Mons Mouton', lat: -84.4, lon: 29.0, elevationKm: 4.8, slopeDeg: 8.9, horizonDeg: 0.5 },
  { id: 'nobile-1', name: 'Borde de Nobile 1', lat: -84.9, lon: 51.0, elevationKm: 1.6, slopeDeg: 6.1, horizonDeg: 1.2 },
  { id: 'nobile-2', name: 'Borde de Nobile 2', lat: -85.9, lon: 58.0, elevationKm: 1.4, slopeDeg: 7.8, horizonDeg: 1.4 },
  { id: 'gerlache-2', name: 'Borde de Gerlache 2', lat: -88.3, lon: -64.0, elevationKm: 1.8, slopeDeg: 9.5, horizonDeg: 1.0 },
  { id: 'slater', name: 'Llanura Slater', lat: -87.8, lon: -110.0, elevationKm: 0.6, slopeDeg: 4.1, horizonDeg: 2.0 },
  { id: 'shackleton-ridge', name: 'Cresta Shackleton–de Gerlache', lat: -89.4, lon: -136.0, elevationKm: 1.9, slopeDeg: 10.5, horizonDeg: 0.8, note: 'Iluminación casi continua, pendiente alta.' },
];

export interface MissionData {
  /** Planned landing time (UTC). */
  landingDate: Date;
  sites: SiteInput[];
}

/**
 * Replace this with the real calls (JPL Horizons, LOLA, your API).
 * onProgress(0..1, message) drives the launch animation.
 */
export async function loadMissionData(onProgress: (p: number, msg: string) => void): Promise<MissionData> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const steps: [string, number][] = [
    ['Consultando efemérides Sol/Tierra · JPL Horizons', 2600],
    ['Descargando topografía LOLA del polo sur', 3200],
    ['Calculando horizontes locales', 2200],
    ['Cargando catálogo de sitios candidatos', 1600],
  ];
  for (let i = 0; i < steps.length; i++) {
    onProgress(i / steps.length, steps[i][0]);
    await sleep(steps[i][1]);
  }
  onProgress(1, 'Datos listos');
  return { landingDate: new Date(Date.UTC(2027, 8, 14, 6, 0)), sites: DEFAULT_SITES };
}
