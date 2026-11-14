/**
 * Moon textures. Drop your three images in /public/textures/moon/ with these names
 * (or change the paths). Missing files fall back to a procedural moon.
 *
 *  - general:  global equirectangular map (2:1), lon −180° at the left edge, north up.
 *  - south/north: polar stereographic mosaics centred on the pole.
 *
 * If a polar image looks rotated or mirrored on the sphere, adjust rotationDeg / flipX.
 * extentDeg = how many degrees from the pole the polar image reaches at its edge
 * (e.g. an image covering 90°S→80°S uses 10; 90°S→60°S uses 30).
 */
export const MOON_TEXTURES = {
  general: '/textures/moon/general.jpg',
  north: { url: '/textures/moon/north-pole.jpg', extentDeg: 20, rotationDeg: 0, flipX: false },
  south: { url: '/textures/moon/south-pole.jpg', extentDeg: 20, rotationDeg: 0, flipX: false },
};

/** Lunar radius in km (used for horizon-dip and scale readouts). */
export const MOON_RADIUS_KM = 1737.4;
