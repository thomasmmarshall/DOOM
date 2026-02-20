/**
 * Phase 0 Demo
 * Load DOOM1.WAD and parse E1M1 to verify all parsers work
 */

import { WADReader } from './wad';
import { MapParser } from './level';
import { PaletteLoader, PatchDecoder, FlatLoader } from './graphics';

export async function loadWAD(url: string): Promise<WADReader> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load WAD: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new WADReader(arrayBuffer);
}

export async function runPhase0Demo(wadUrl: string) {
  console.log('=== DOOM three.js - Phase 0 Demo ===');
  console.log('');

  // Load WAD file
  console.log(`Loading WAD from: ${wadUrl}`);
  const wad = await loadWAD(wadUrl);
  console.log('');

  // Show WAD info
  const info = wad.getInfo();
  console.log(`WAD Type: ${info.identification}`);
  console.log(`Total Lumps: ${info.numlumps}`);
  console.log('');

  // Find all maps
  const maps = wad.findMapLumps();
  console.log(`Found ${maps.length} maps: ${maps.join(', ')}`);
  console.log('');

  // Load palette
  console.log('Loading PLAYPAL (palette)...');
  const playpalData = wad.readLump('PLAYPAL');
  if (!playpalData) {
    throw new Error('PLAYPAL not found');
  }
  const palette = PaletteLoader.loadPalette(playpalData);
  const rgbaPalette = PaletteLoader.paletteToRGBA(palette, 255);
  console.log(`Palette loaded: 256 colors`);
  console.log('');

  // Load colormap
  console.log('Loading COLORMAP...');
  const colormapData = wad.readLump('COLORMAP');
  if (!colormapData) {
    throw new Error('COLORMAP not found');
  }
  const colormap = PaletteLoader.loadColormap(colormapData);
  console.log(`Colormap loaded: ${colormap.length / 256} maps`);
  console.log('');

  // Parse first map (E1M1 for DOOM, MAP01 for DOOM2)
  const firstMap = maps[0];
  console.log(`Parsing ${firstMap}...`);
  const mapLumps = wad.getMapLumps(firstMap);
  if (!mapLumps) {
    throw new Error(`Map ${firstMap} not found`);
  }

  const mapData = MapParser.parseMap(firstMap, mapLumps, wad);
  console.log('');

  // Show map statistics
  console.log('=== Map Statistics ===');
  console.log(`Vertices: ${mapData.vertexes.length}`);
  console.log(`LineDefs: ${mapData.linedefs.length}`);
  console.log(`SideDefs: ${mapData.sidedefs.length}`);
  console.log(`Sectors: ${mapData.sectors.length}`);
  console.log(`Things: ${mapData.things.length}`);
  console.log(`Segs: ${mapData.segs.length}`);
  console.log(`SubSectors: ${mapData.subsectors.length}`);
  console.log(`Nodes: ${mapData.nodes.length}`);
  console.log('');

  // Show first few sectors
  console.log('=== First 5 Sectors ===');
  for (let i = 0; i < Math.min(5, mapData.sectors.length); i++) {
    const sector = mapData.sectors[i];
    console.log(`Sector ${i}:`);
    console.log(`  Floor: ${sector.floorheight} (${sector.floorpic})`);
    console.log(`  Ceiling: ${sector.ceilingheight} (${sector.ceilingpic})`);
    console.log(`  Light: ${sector.lightlevel}`);
  }
  console.log('');

  // Show thing types
  const thingTypes = new Map<number, number>();
  for (const thing of mapData.things) {
    thingTypes.set(thing.type, (thingTypes.get(thing.type) || 0) + 1);
  }
  console.log('=== Thing Types ===');
  for (const [type, count] of Array.from(thingTypes.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  Type ${type}: ${count}`);
  }
  console.log('');

  // Test patch decoding
  console.log('Testing patch decoder...');
  const statusBarPatch = wad.readLump('STBAR');
  if (statusBarPatch) {
    const decodedPatch = PatchDecoder.decodePatch(statusBarPatch, rgbaPalette);
    console.log(`Decoded STBAR patch: ${decodedPatch.width}x${decodedPatch.height}`);
  }
  console.log('');

  // Test flat loading
  console.log('Testing flat loader...');
  const firstFlat = mapData.sectors[0].floorpic;
  const flatData = wad.readLump(firstFlat);
  if (flatData) {
    const decodedFlat = FlatLoader.decodeFlat(flatData, rgbaPalette);
    console.log(`Decoded ${firstFlat} flat: 64x64 (${decodedFlat.length / 4} pixels)`);
  }
  console.log('');

  console.log('=== Phase 0 Complete! ===');
  console.log('All parsers working correctly.');

  return { wad, mapData, palette: rgbaPalette };
}
