export const MOON_RADIUS_M = 1_737_400

const RAD = Math.PI / 180

type Vec3 = [number, number, number]

function unit(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * RAD
  const lon = lonDeg * RAD
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function topocentric(
  siteLat: number,
  siteLon: number,
  siteHeightM: number,
  subLat: number,
  subLon: number,
  rangeKm: number,
): { az: number; el: number } {
  const up = unit(siteLat, siteLon)
  const sub = unit(subLat, subLon)
  let d: Vec3
  if (rangeKm === Infinity) {
    d = sub
  } else {
    const radius = MOON_RADIUS_M + siteHeightM
    const range = rangeKm * 1000
    d = [
      range * sub[0] - radius * up[0],
      range * sub[1] - radius * up[1],
      range * sub[2] - radius * up[2],
    ]
  }
  const lat = siteLat * RAD
  const lon = siteLon * RAD
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0]
  const north: Vec3 = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)]
  const az = Math.atan2(dot(d, east), dot(d, north)) / RAD
  const sinEl = dot(d, up) / Math.hypot(d[0], d[1], d[2])
  return {
    az: ((az % 360) + 360) % 360,
    el: Math.asin(Math.max(-1, Math.min(1, sinEl))) / RAD,
  }
}
