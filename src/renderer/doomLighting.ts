import * as THREE from 'three';
import type { Colormap, Palette } from '../graphics/types';

const PALETTE_WIDTH = 256;
const COLORMAP_HEIGHT = 34;
const DEFAULT_DISTANCE_SCALE = 64;
const DEFAULT_DISTANCE_OFFSET = 32;

export interface DoomPaletteResources {
  paletteTexture: THREE.DataTexture;
  colormapTexture: THREE.DataTexture;
}

interface DoomIndexedUniforms {
  uPaletteMap: { value: THREE.DataTexture };
  uColormapMap: { value: THREE.DataTexture };
  uLightLevel: { value: number };
  uFakeContrast: { value: number };
  uDistanceScale: { value: number };
  uDistanceOffset: { value: number };
  uUseDistanceLighting: { value: number };
  uFullBright: { value: number };
}

export interface DoomIndexedMaterialOptions {
  paletteResources: DoomPaletteResources;
  lightLevel: number;
  fakeContrast?: number;
  useDistanceLighting?: boolean;
  distanceScale?: number;
  distanceOffset?: number;
  fullBright?: boolean;
}

export function createDoomPaletteResources(
  palette: Palette,
  colormap: Colormap
): DoomPaletteResources {
  const palettePixels = new Uint8Array(PALETTE_WIDTH * 4);
  for (let i = 0; i < PALETTE_WIDTH; i++) {
    palettePixels[(i * 4)] = palette[i * 3];
    palettePixels[(i * 4) + 1] = palette[(i * 3) + 1];
    palettePixels[(i * 4) + 2] = palette[(i * 3) + 2];
    palettePixels[(i * 4) + 3] = 255;
  }

  const paletteTexture = new THREE.DataTexture(
    palettePixels,
    PALETTE_WIDTH,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  paletteTexture.magFilter = THREE.NearestFilter;
  paletteTexture.minFilter = THREE.NearestFilter;
  paletteTexture.wrapS = THREE.ClampToEdgeWrapping;
  paletteTexture.wrapT = THREE.ClampToEdgeWrapping;
  paletteTexture.flipY = false;
  paletteTexture.needsUpdate = true;

  const colormapPixels = new Uint8Array(PALETTE_WIDTH * COLORMAP_HEIGHT * 4);
  for (let row = 0; row < COLORMAP_HEIGHT; row++) {
    for (let column = 0; column < PALETTE_WIDTH; column++) {
      const srcOffset = (row * PALETTE_WIDTH) + column;
      const dstOffset = srcOffset * 4;
      colormapPixels[dstOffset] = colormap[srcOffset];
      colormapPixels[dstOffset + 3] = 255;
    }
  }

  const colormapTexture = new THREE.DataTexture(
    colormapPixels,
    PALETTE_WIDTH,
    COLORMAP_HEIGHT,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  colormapTexture.magFilter = THREE.NearestFilter;
  colormapTexture.minFilter = THREE.NearestFilter;
  colormapTexture.wrapS = THREE.ClampToEdgeWrapping;
  colormapTexture.wrapT = THREE.ClampToEdgeWrapping;
  colormapTexture.flipY = false;
  colormapTexture.needsUpdate = true;

  return {
    paletteTexture,
    colormapTexture,
  };
}

export function disposeDoomPaletteResources(resources: DoomPaletteResources): void {
  resources.paletteTexture.dispose();
  resources.colormapTexture.dispose();
}

export function applyDoomIndexedMaterial(
  material: THREE.MeshBasicMaterial | THREE.SpriteMaterial,
  options: DoomIndexedMaterialOptions
): void {
  const uniforms: DoomIndexedUniforms = {
    uPaletteMap: { value: options.paletteResources.paletteTexture },
    uColormapMap: { value: options.paletteResources.colormapTexture },
    uLightLevel: { value: options.lightLevel },
    uFakeContrast: { value: options.fakeContrast ?? 0 },
    uDistanceScale: { value: options.distanceScale ?? DEFAULT_DISTANCE_SCALE },
    uDistanceOffset: { value: options.distanceOffset ?? DEFAULT_DISTANCE_OFFSET },
    uUseDistanceLighting: { value: options.useDistanceLighting ? 1 : 0 },
    uFullBright: { value: options.fullBright ? 1 : 0 },
  };

  material.userData.doomIndexedUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vDoomDistance;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vDoomDistance = length( mvPosition.xyz );`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uPaletteMap;
uniform sampler2D uColormapMap;
uniform float uLightLevel;
uniform float uFakeContrast;
uniform float uDistanceScale;
uniform float uDistanceOffset;
uniform float uUseDistanceLighting;
uniform float uFullBright;
varying float vDoomDistance;

float samplePaletteIndex(float value) {
  return floor((value * 255.0) + 0.5);
}

vec3 doomSrgbToLinear(vec3 color) {
  vec3 cutoff = step(vec3(0.04045), color);
  vec3 lower = color / 12.92;
  vec3 higher = pow((color + 0.055) / 1.055, vec3(2.4));
  return mix(lower, higher, cutoff);
}

float computeColormapRow() {
  if (uFullBright > 0.5) {
    return 0.0;
  }

  float adjustedLight = clamp(uLightLevel + uFakeContrast, 0.0, 255.0);
  float baseRow = clamp(31.0 - floor(adjustedLight / 8.0), 0.0, 31.0);
  float distanceRow = 0.0;

  if (uUseDistanceLighting > 0.5) {
    distanceRow = floor(max(0.0, vDoomDistance - uDistanceOffset) / max(1.0, uDistanceScale));
  }

  return clamp(baseRow + distanceRow, 0.0, 31.0);
}`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
vec4 indexedTexel = texture2D( map, vMapUv );
float paletteIndex = samplePaletteIndex(indexedTexel.r);
float alpha = indexedTexel.a;
float colormapRow = computeColormapRow();
float mappedIndex = samplePaletteIndex(
  texture2D(
    uColormapMap,
    vec2((paletteIndex + 0.5) / 256.0, (colormapRow + 0.5) / 34.0)
  ).r
);
vec3 paletteColor = doomSrgbToLinear(
  texture2D(uPaletteMap, vec2((mappedIndex + 0.5) / 256.0, 0.5)).rgb
);
diffuseColor *= vec4(paletteColor, alpha);
#endif`
      );
  };

  material.customProgramCacheKey = () => [
    'doomIndexed',
    options.useDistanceLighting ? 'distance' : 'nodistance',
    options.fullBright ? 'fullbright' : 'lit',
  ].join(':');
  material.needsUpdate = true;
}

export function updateDoomIndexedMaterialLight(
  material: THREE.Material,
  lightLevel: number,
  fakeContrast: number = 0
): void {
  const uniforms = material.userData.doomIndexedUniforms as DoomIndexedUniforms | undefined;
  if (!uniforms) {
    return;
  }

  uniforms.uLightLevel.value = lightLevel;
  uniforms.uFakeContrast.value = fakeContrast;
}

export function getWallFakeContrast(dx: number, dy: number): number {
  if (Math.abs(dx) > Math.abs(dy)) {
    return -16;
  }

  if (Math.abs(dy) > Math.abs(dx)) {
    return 16;
  }

  return 0;
}

export function isSkyFlat(name: string): boolean {
  return name.toUpperCase() === 'F_SKY1';
}

export function selectSkyTexture(mapName: string): string {
  const upperName = mapName.toUpperCase();

  const doom2Match = upperName.match(/^MAP(\d\d)$/);
  if (doom2Match) {
    const mapNumber = Number.parseInt(doom2Match[1], 10);
    if (mapNumber >= 1 && mapNumber <= 11) {
      return 'SKY1';
    }
    if (mapNumber >= 12 && mapNumber <= 20) {
      return 'SKY2';
    }
    return 'SKY3';
  }

  const doom1Match = upperName.match(/^E(\d)M\d$/);
  if (doom1Match) {
    const episode = Number.parseInt(doom1Match[1], 10);
    return `SKY${Math.min(4, Math.max(1, episode))}`;
  }

  return 'SKY1';
}
