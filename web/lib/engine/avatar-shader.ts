import type * as THREE from 'three';
import { LAYERS } from './avatar-layers';

const indices = LAYERS.map((_, i) => i);

const fetchLayer = indices
  .map((i) => `${i ? 'else ' : ''}if ( suitLayer == ${i} ) {
	suitTexel = textureGrad( suitMap${i}, vSuitUv, suitDx, suitDy ).rgb;
	suitNormal = textureGrad( suitNormal${i}, vSuitUv, suitDx, suitDy ).xyz;
}`)
  .join('\n');

const VERTEX_PARS = `
attribute vec2 surface;
varying vec2 vSurface;
varying vec2 vSuitUv;
`;

const FRAGMENT_PARS = `
uniform sampler2D ${indices.map((i) => `suitMap${i}, suitNormal${i}`).join(', ')};
uniform vec3 suitMean[ ${LAYERS.length} ];
uniform vec2 suitBump[ ${LAYERS.length} ];
uniform float suitRough[ ${LAYERS.length} ];
varying vec2 vSurface;
varying vec2 vSuitUv;
mat3 suitFrame( vec3 eye, vec3 n, vec2 uv ) {
	vec3 q0 = dFdx( eye );
	vec3 q1 = dFdy( eye );
	vec2 st0 = dFdx( uv );
	vec2 st1 = dFdy( uv );
	vec3 q1perp = cross( q1, n );
	vec3 q0perp = cross( n, q0 );
	vec3 T = q1perp * st0.x + q0perp * st1.x;
	vec3 B = q1perp * st0.y + q0perp * st1.y;
	float det = max( dot( T, T ), dot( B, B ) );
	float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
	return mat3( T * scale, B * scale, n );
}
`;

const ALBEDO = `
int suitLayer = int( vSurface.x + 0.5 );
vec2 suitDx = dFdx( vSuitUv );
vec2 suitDy = dFdy( vSuitUv );
vec3 suitTexel = vec3( 1.0 );
vec3 suitNormal = vec3( 0.5, 0.5, 1.0 );
${fetchLayer}
diffuseColor.rgb *= suitTexel / suitMean[ suitLayer ];
`;

const ROUGHNESS = 'float roughnessFactor = mix( suitRough[ suitLayer ], 1.0, vSurface.y * 0.7 );';

const NORMAL = `
vec3 suitMapN = suitNormal * 2.0 - 1.0;
suitMapN.xy *= suitBump[ suitLayer ] * faceDirection;
normal = normalize( suitFrame( - vViewPosition, normal, vSuitUv ) * suitMapN );
`;

export const SUIT_PROGRAM_KEY = 'suit-layers';

/**
 * Lets one standard material draw every cloth-like part of the suit: each vertex carries a texture layer and a
 * dust amount (attribute `surface`), and the fragment shader reads that layer's color and normal map, scaled
 * by the uniforms in `uniforms`. A single draw call then covers quilting, bellows, rubber and fabric.
 */
export function injectSuitLayers(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }, uniforms: Record<string, THREE.IUniform>) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>${VERTEX_PARS}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = surface;\nvSuitUv = uv;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>${FRAGMENT_PARS}`)
    .replace('#include <map_fragment>', ALBEDO)
    .replace('#include <roughnessmap_fragment>', ROUGHNESS)
    .replace('#include <normal_fragment_maps>', NORMAL);
}
