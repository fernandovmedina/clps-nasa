import type { CapcomTool } from './types';

export const TRIP_STATUS_FIXTURE = {
  fase: 'Despegue',
  altitud_km: 169,
  velocidad_km_s: 0.35,
  distancia_luna_km: 404200,
} as const;

export const tripStatusTool: CapcomTool = {
  name: 'estado_del_viaje',
  description:
    'Devuelve el estado actual del viaje a la Luna: fase, altitud en kilómetros, velocidad en kilómetros por segundo y distancia a la Luna en kilómetros. Úsala siempre que se pregunte por cualquier cifra del viaje.',
  inputSchema: { type: 'object', properties: {}, required: [] },
  run: () => TRIP_STATUS_FIXTURE,
};
