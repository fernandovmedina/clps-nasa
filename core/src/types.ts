export type Region = 'south-pole' | 'mid-latitude' | 'equatorial' | 'far-side'
export type HorizonSource = 'lola' | 'spherical'

export interface Site {
  id: string
  name: string
  program: string
  region: Region
  lat: number
  lon: number
  elevation_m: number
  has_terrain: boolean
  horizon_source: HorizonSource
  ephemeris_source: string
  coord_source?: string
  approx?: boolean
  notes?: string
}

export interface SitesFile {
  generated_at: string
  ephemeris_range: { start: string; end: string; step_minutes: number }
  sites: Site[]
}

export interface EphemerisFile {
  site_id: string
  source: string
  start: string
  step_minutes: number
  count: number
  sun_az: number[]
  sun_el: number[]
  earth_az: number[]
  earth_el: number[]
}

export interface GlobalFile {
  source: string
  start: string
  step_minutes: number
  count: number
  sub_earth_lon: number[]
  sub_earth_lat: number[]
  sub_solar_lon: number[]
  sub_solar_lat: number[]
  earth_range_km: number[]
}

export interface HorizonFile {
  site_id: string
  az_step_deg: number
  horizon_deg: number[]
  observer_height_m: number
  source: string
  max_range_km: number
}

export interface TerrainInfo {
  site_id: string
  heightmap_url: string
  format: string
  size_px: number
  extent_m: number
  min_height_m: number
  max_height_m: number
  texture_url: string
  site_px: [number, number]
}

export interface BodySample {
  az: number
  el: number
  visible: boolean
}

export interface EphemerisSample {
  t: string
  sun: BodySample
  earth: BodySample
}

export interface EphemerisResponse {
  site_id: string
  step_minutes: number
  source: string
  samples: EphemerisSample[]
}

export type Interval = [string, string]

export interface BodySummary {
  az_now: number
  elev_now: number
  visible_now: boolean
  hours_visible: number
  max_elev: number
  min_elev: number
  avg_elev: number
  next_set: string | null
  next_rise: string | null
}

export type ScenarioStatus = 'viable' | 'marginal' | 'not_viable'

export interface ScenarioResponse {
  site_id: string
  site_name: string
  landing: string
  duration_days: number
  horizon_source: string
  ephemeris_source: string
  truncated: boolean
  sun: BodySummary
  earth: BodySummary
  windows: { sun: Interval[]; earth: Interval[]; both: Interval[] }
  fractions: { sun: number; earth: number; both: number }
  score: number
  status: ScenarioStatus
}

export interface Track {
  siteId: string
  source: string
  startMs: number
  stepMs: number
  count: number
  sunAz: number[]
  sunEl: number[]
  earthAz: number[]
  earthEl: number[]
}

export type MarkerKind = 'rock' | 'slope' | 'shadow' | 'other'

export interface Marker {
  id: string
  site_id: string
  x_m: number
  y_m: number
  kind: MarkerKind
  note?: string
}

export interface RoomState {
  type: 'state'
  site_id: string
  t: string
  playing: boolean
  speed: number
  markers: Marker[]
}

export type ClientMessage =
  | { type: 'hello' }
  | { type: 'ping' }
  | { type: 'set_site'; site_id: string }
  | { type: 'set_time'; t: string; playing?: boolean; speed?: number }
  | {
      type: 'marker_add'
      id: string
      site_id: string
      x_m: number
      y_m: number
      kind: MarkerKind
      note?: string
    }
  | { type: 'marker_remove'; id: string }
