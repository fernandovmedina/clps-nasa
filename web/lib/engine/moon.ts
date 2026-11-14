import * as THREE from 'three';
import { MOON_TEXTURES } from '../mission/config';
import { DEG } from './util';
import { moonFallbackTexture, tryLoad } from './textures';

export interface MoonTextures {
  general: THREE.Texture;
  north: THREE.Texture | null;
  south: THREE.Texture | null;
}

let cache: Promise<MoonTextures> | null = null;
/** Loads general + north pole + south pole textures once (shared by every moon mesh). */
export function loadMoonTextures(): Promise<MoonTextures> {
  if (!cache) {
    cache = Promise.all([
      tryLoad(MOON_TEXTURES.general),
      tryLoad(MOON_TEXTURES.north.url),
      tryLoad(MOON_TEXTURES.south.url),
    ]).then(([general, north, south]) => ({ general: general ?? moonFallbackTexture(), north, south }));
  }
  return cache;
}

/**
 * Moon material that blends the global equirectangular map with polar stereographic
 * mosaics near each pole, so the south-pole landing region gets the detailed texture.
 */
export function createMoonMaterial(tex: MoonTextures) {
  const mat = new THREE.MeshStandardMaterial({ map: tex.general, roughness: 1, metalness: 0 });
  const uniforms = {
    northMap: { value: tex.north ?? tex.general },
    southMap: { value: tex.south ?? tex.general },
    hasNorth: { value: tex.north ? 1 : 0 },
    hasSouth: { value: tex.south ? 1 : 0 },
    extN: { value: MOON_TEXTURES.north.extentDeg * DEG },
    extS: { value: MOON_TEXTURES.south.extentDeg * DEG },
    rotN: { value: MOON_TEXTURES.north.rotationDeg * DEG },
    rotS: { value: MOON_TEXTURES.south.rotationDeg * DEG },
    flipN: { value: MOON_TEXTURES.north.flipX ? -1 : 1 },
    flipS: { value: MOON_TEXTURES.south.flipX ? -1 : 1 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObjPos;
        uniform sampler2D northMap; uniform sampler2D southMap;
        uniform float hasNorth, hasSouth, extN, extS, rotN, rotS, flipN, flipS;
        vec2 polarUv(float colat, float lon, float ext, float rot, float flip, float south){
          float r = 0.5 * tan(colat * 0.5) / tan(ext * 0.5);   // stereographic
          float a = (lon + rot) * flip;
          // south: lon 0 at top of the image; north: lon 0 at bottom
          return south > 0.5 ? vec2(0.5 + r * sin(a), 0.5 + r * cos(a))
                             : vec2(0.5 + r * sin(a), 0.5 - r * cos(a));
        }`)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          vec3 dN = normalize(vObjPos);
          float lat = asin(clamp(dN.y, -1.0, 1.0));
          float lon = atan(-dN.z, dN.x);
          float colat = 1.5707963 - abs(lat);
          float isS = lat < 0.0 ? 1.0 : 0.0;
          vec4 cS = texture2D(southMap, polarUv(colat, lon, extS, rotS, flipS, 1.0));
          vec4 cN = texture2D(northMap, polarUv(colat, lon, extN, rotN, flipN, 0.0));
          float wS = isS * hasSouth * (1.0 - smoothstep(extS * 0.82, extS * 0.98, colat));
          float wN = (1.0 - isS) * hasNorth * (1.0 - smoothstep(extN * 0.82, extN * 0.98, colat));
          sampledDiffuseColor = mix(sampledDiffuseColor, cS, wS);
          sampledDiffuseColor = mix(sampledDiffuseColor, cN, wN);
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'moon-tri-texture';
  return mat;
}

export function createMoon(radius: number, tex: MoonTextures, segments = 192) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments / 2), createMoonMaterial(tex));
  mesh.name = 'moon';
  return mesh;
}
