/**
 * Extract mobjinfo + spawn-state sprites from linuxdoom-1.10/info.c
 * and emit src/game/thinginfo.generated.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INFO_C = path.join(ROOT, 'linuxdoom-1.10/info.c');
const OUT = path.join(ROOT, 'src/game/thinginfo.generated.ts');

const FRACUNIT = 65536;

function parseSprnames(text) {
  const m = text.match(/char \*sprnames\[NUMSPRITES\] = \{([^}]+)\}/s);
  if (!m) throw new Error('sprnames not found');
  return m[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, ''));
}

function parseStates(text) {
  const start = text.indexOf('state_t\tstates[NUMSTATES] = {');
  if (start < 0) throw new Error('states start not found');
  const end = text.indexOf('\n};', start);
  const body = text.slice(start, end);
  const states = [];
  const re = /\{SPR_(\w+),\s*(-?\d+)/g;
  let x;
  while ((x = re.exec(body)) !== null) {
    states.push({ sprKey: x[1], frame: parseInt(x[2], 10) });
  }
  return states;
}

function parseStateEnum(infoH) {
  const m = infoH.match(/typedef enum\s*\{([^}]+)\}\s*statenum_t;/s);
  if (!m) throw new Error('statenum_t not found');
  const names = [];
  for (const line of m[1].split('\n')) {
    const t = line.trim().replace(/,.*/, '').trim();
    if (/^S_/.test(t)) names.push(t);
  }
  return names;
}

function parseSprEnumOrder(infoH) {
  const m = infoH.match(/typedef enum\s*\{([^}]+)\}\s*spritenum_t;/s);
  if (!m) throw new Error('spritenum_t not found');
  const keys = [];
  for (const line of m[1].split('\n')) {
    const t = line.trim().replace(/,.*/, '').trim();
    if (/^SPR_/.test(t)) keys.push(t.replace(/^SPR_/, ''));
  }
  return keys;
}

function frameToChar(frame) {
  const idx = frame & 0x7fff;
  if (idx >= 0 && idx <= 25) return String.fromCharCode(65 + idx);
  if (idx === 26) return '[';
  if (idx === 27) return '\\';
  if (idx === 28) return ']';
  return 'A';
}

function parseFracToken(tok) {
  const m = tok.match(/^(\d+)\*FRACUNIT$/);
  if (m) return parseInt(m[1], 10) * FRACUNIT;
  const n = parseInt(tok, 10);
  if (!Number.isNaN(n)) return n * FRACUNIT;
  throw new Error(`bad frac token: ${tok}`);
}

function parseFlags(tok) {
  if (!tok.includes('MF_')) return parseInt(tok, 10);
  const parts = tok.split('|').map((p) => p.trim());
  let f = 0;
  const map = {
    MF_SPECIAL: 0x1,
    MF_SOLID: 0x2,
    MF_SHOOTABLE: 0x4,
    MF_NOSECTOR: 0x8,
    MF_NOBLOCKMAP: 0x10,
    MF_AMBUSH: 0x20,
    MF_JUSTHIT: 0x40,
    MF_JUSTATTACKED: 0x80,
    MF_SPAWNCEILING: 0x100,
    MF_NOGRAVITY: 0x200,
    MF_DROPOFF: 0x400,
    MF_PICKUP: 0x800,
    MF_NOCLIP: 0x1000,
    MF_SLIDE: 0x2000,
    MF_FLOAT: 0x4000,
    MF_TELEPORT: 0x8000,
    MF_MISSILE: 0x10000,
    MF_DROPPED: 0x20000,
    MF_SHADOW: 0x40000,
    MF_NOBLOOD: 0x80000,
    MF_CORPSE: 0x100000,
    MF_INFLOAT: 0x200000,
    MF_COUNTKILL: 0x400000,
    MF_COUNTITEM: 0x800000,
    MF_SKULLFLY: 0x1000000,
    MF_NOTDMATCH: 0x2000000,
  };
  for (const p of parts) {
    if (map[p] !== undefined) f |= map[p];
    else if (p === '0') continue;
    else throw new Error(`unknown MF ${p}`);
  }
  return f;
}

function lineToken(line) {
  const noCom = line.split('//')[0].trim();
  if (!noCom || noCom === '}' || noCom === '{') return null;
  return noCom.replace(/,\s*$/, '').trim();
}

const WEAPON_DOOMED = new Set([2001, 2002, 2003, 2004, 2005, 2006, 82]);
const AMMO_DOOMED = new Set([2007, 2008, 2010, 2046, 2047, 2048, 2049, 17, 8]);
const HEALTH_DOOMED = new Set([2011, 2012, 2014, 2015, 2018, 2019]);
const POWERUP_DOOMED = new Set([2013, 2022, 2023, 2024, 2025, 2026, 2045, 83]);
const KEY_DOOMED = new Set([5, 6, 13, 38, 39, 40]);

function inferCategory(flags, doomed) {
  if (flags & 0x400000) return 'monster';
  if (!(flags & 0x1)) return 'decoration';
  if (WEAPON_DOOMED.has(doomed)) return 'weapon';
  if (AMMO_DOOMED.has(doomed)) return 'ammo';
  if (HEALTH_DOOMED.has(doomed)) return 'health';
  if (POWERUP_DOOMED.has(doomed)) return 'powerup';
  if (KEY_DOOMED.has(doomed)) return 'key';
  if (flags & 0x800000) return 'health';
  return 'decoration';
}

function main() {
  const infoH = fs.readFileSync(path.join(ROOT, 'linuxdoom-1.10/info.h'), 'utf8');
  const text = fs.readFileSync(INFO_C, 'utf8');

  const sprnames = parseSprnames(text);
  const sprEnumOrder = parseSprEnumOrder(infoH);
  const sprKeyToName = {};
  sprEnumOrder.forEach((k, i) => {
    sprKeyToName[k] = sprnames[i];
  });

  const stateNames = parseStateEnum(infoH);
  const stateIndex = Object.fromEntries(stateNames.map((n, i) => [n, i]));

  const states = parseStates(text);

  const mobjStart = text.indexOf('mobjinfo_t mobjinfo[NUMMOBJTYPES] = {');
  const mobjEnd = text.indexOf('\n};', mobjStart + 50);
  const mobjBody = text.slice(mobjStart, mobjEnd);
  const parts = mobjBody.split(/\{\s*\/\/\s*MT_/).slice(1);

  const rows = [];

  for (const part of parts) {
    const nameLine = part.split('\n')[0].trim();
    const mtName = nameLine.match(/^(\w+)/)[1];
    const lines = part.split('\n').slice(1);
    const tokens = [];
    for (const line of lines) {
      const t = lineToken(line);
      if (t) tokens.push(t);
    }

    if (tokens.length < 22) {
      throw new Error(`MT_${mtName}: expected 22+ tokens, got ${tokens.length}`);
    }

    const doomednum = parseInt(tokens[0], 10);
    const spawnstateName = tokens[1];
    const spawnhealth = parseInt(tokens[2], 10);
    const painchance = parseInt(tokens[8], 10);
    const radiusTok = tokens[16];
    const heightTok = tokens[17];
    const flagsTok = tokens[21];

    const radius = parseFracToken(radiusTok);
    const height = parseFracToken(heightTok);
    const flags = parseFlags(flagsTok);

    const si = stateIndex[spawnstateName];
    if (si === undefined) {
      throw new Error(`MT_${mtName}: unknown spawnstate ${spawnstateName}`);
    }
    const st = states[si];
    if (!st) throw new Error(`MT_${mtName}: state index ${si} OOB`);
    const spriteName = sprKeyToName[st.sprKey];
    if (!spriteName) throw new Error(`MT_${mtName}: unknown SPR ${st.sprKey}`);

    const frame = frameToChar(st.frame);
    const rotation = 0;

    if (doomednum < 0 || doomednum === 0) continue;

    const category = inferCategory(flags, doomednum);

    rows.push({
      doomednum,
      mtName,
      spriteName,
      frame,
      rotation,
      radius,
      height,
      flags,
      health: spawnhealth,
      painChance: painchance,
      countsTowardKill: !!(flags & 0x400000),
      countsTowardItem: !!(flags & 0x800000),
      category,
    });
  }

  rows.sort((a, b) => a.doomednum - b.doomednum);

  const linesOut = [];
  linesOut.push('/** Auto-generated from linuxdoom-1.10/info.c — do not edit by hand. */');
  linesOut.push('');
  linesOut.push('export interface GeneratedThingRow {');
  linesOut.push('  type: number;');
  linesOut.push('  spriteName: string;');
  linesOut.push('  frame: string;');
  linesOut.push('  rotation: number;');
  linesOut.push('  radius: number;');
  linesOut.push('  height: number;');
  linesOut.push('  flags: number;');
  linesOut.push('  health: number;');
  linesOut.push('  painChance: number;');
  linesOut.push('  countsTowardKill: boolean;');
  linesOut.push('  countsTowardItem: boolean;');
  linesOut.push("  category: 'monster' | 'weapon' | 'ammo' | 'health' | 'powerup' | 'key' | 'decoration' | 'player';");
  linesOut.push('  mobjName: string;');
  linesOut.push('}');
  linesOut.push('');
  linesOut.push('export const GENERATED_THING_INFO_ROWS: GeneratedThingRow[] = [');
  for (const r of rows) {
    const safeSprite = r.spriteName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    linesOut.push(`  {`);
    linesOut.push(`    type: ${r.doomednum},`);
    linesOut.push(`    spriteName: '${safeSprite}',`);
    linesOut.push(`    frame: '${r.frame}',`);
    linesOut.push(`    rotation: ${r.rotation},`);
    linesOut.push(`    radius: ${r.radius},`);
    linesOut.push(`    height: ${r.height},`);
    linesOut.push(`    flags: ${r.flags},`);
    linesOut.push(`    health: ${r.health},`);
    linesOut.push(`    painChance: ${r.painChance},`);
    linesOut.push(`    countsTowardKill: ${r.countsTowardKill},`);
    linesOut.push(`    countsTowardItem: ${r.countsTowardItem},`);
    linesOut.push(`    category: '${r.category}',`);
    linesOut.push(`    mobjName: '${r.mtName}',`);
    linesOut.push(`  },`);
  }
  linesOut.push('];');
  linesOut.push('');

  fs.writeFileSync(OUT, linesOut.join('\n'));
  console.log(`Wrote ${rows.length} things to ${OUT}`);
}

main();
