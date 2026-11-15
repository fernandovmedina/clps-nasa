export type Layer = 'quilt' | 'bellows' | 'rubber' | 'fabric';

export const LAYERS: readonly Layer[] = ['quilt', 'bellows', 'rubber', 'fabric'];

/** Meters of suit covered by one repetition of each texture. */
export const TILE: Record<Layer, number> = { quilt: 0.12, bellows: 0.06, rubber: 0.05, fabric: 0.07 };

export const layerId = (layer: Layer) => LAYERS.indexOf(layer);
