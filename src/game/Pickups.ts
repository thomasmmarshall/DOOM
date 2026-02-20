/**
 * Item Pickup System
 * Handles player collecting health, ammo, weapons, powerups, etc.
 * Based on linuxdoom-1.10/p_inter.c
 */

import type { Mobj } from './mobj';
import { MobjFlags } from './mobj';
import { FixedToFloat } from '../core/fixed';

/**
 * Pickup result
 */
export interface PickupResult {
  success: boolean;
  message?: string;
}

/**
 * Try to pickup an item
 */
export function tryPickupItem(item: Mobj, player: Mobj): PickupResult {
  // Check if item is pickupable
  if (!(item.flags & MobjFlags.SPECIAL)) {
    return { success: false };
  }

  // Check if player can actually pick it up
  if (!(player.flags & MobjFlags.PICKUP)) {
    return { success: false };
  }

  // Item already picked up (corpse/dead)
  if (item.health <= 0) {
    return { success: false };
  }

  // Try to pick up based on item type
  const result = pickupByType(item, player);

  if (result.success) {
    // Remove item from world
    item.health = 0;
    item.flags &= ~MobjFlags.SPECIAL;
    item.flags &= ~MobjFlags.SOLID;

    // TODO: Play pickup sound
    // TODO: Show pickup message

    console.log(`Picked up: ${result.message || 'item'}`);
  }

  return result;
}

/**
 * Pickup item based on its type
 */
function pickupByType(item: Mobj, player: Mobj): PickupResult {
  if (!player.player) {
    return { success: false };
  }

  // Thing type determines what kind of item it is
  // Based on DOOM thing types
  switch (item.type) {
    // HEALTH ITEMS
    case 2011: // Stimpack
      return giveHealth(player, 10, 100, 'Picked up a stimpack.');

    case 2012: // Medikit
      return giveHealth(player, 25, 100, 'Picked up a medikit.');

    case 2014: // Health bonus
      return giveHealth(player, 1, 200, 'Picked up a health bonus.');

    case 2013: // Soul sphere
      return giveHealth(player, 100, 200, 'Supercharge!');

    // ARMOR ITEMS
    case 2018: // Armor bonus
      return giveArmor(player, 1, 200, 'Picked up an armor bonus.');

    case 2019: // Green armor
      return giveArmor(player, 100, 100, 'Picked up the armor.');

    case 2015: // Blue armor
      return giveArmor(player, 200, 200, 'Picked up the MegaArmor!');

    // AMMO - BULLETS
    case 2007: // Clip
      return giveAmmo(player, 'bullets', 10, 'Picked up a clip.');

    case 2048: // Box of bullets
      return giveAmmo(player, 'bullets', 50, 'Picked up a box of bullets.');

    // AMMO - SHELLS
    case 2008: // Shells
      return giveAmmo(player, 'shells', 4, 'Picked up 4 shotgun shells.');

    case 2049: // Box of shells
      return giveAmmo(player, 'shells', 20, 'Picked up a box of shotgun shells.');

    // AMMO - ROCKETS
    case 2010: // Rocket
      return giveAmmo(player, 'rockets', 1, 'Picked up a rocket.');

    case 2046: // Box of rockets
      return giveAmmo(player, 'rockets', 5, 'Picked up a box of rockets.');

    // AMMO - CELLS
    case 2047: // Cell
      return giveAmmo(player, 'cells', 20, 'Picked up an energy cell.');

    case 17: // Cell pack
      return giveAmmo(player, 'cells', 100, 'Picked up an energy cell pack.');

    // WEAPONS
    case 2001: // Shotgun
      return giveWeapon(player, 2, 'shells', 8, 'You got the shotgun!');

    case 2002: // Chaingun
      return giveWeapon(player, 3, 'bullets', 20, 'You got the chaingun!');

    case 2003: // Rocket launcher
      return giveWeapon(player, 4, 'rockets', 2, 'You got the rocket launcher!');

    case 2004: // Plasma rifle
      return giveWeapon(player, 5, 'cells', 40, 'You got the plasma gun!');

    case 2006: // BFG9000
      return giveWeapon(player, 6, 'cells', 40, 'You got the BFG9000! Oh yes.');

    case 2005: // Chainsaw
      return giveWeapon(player, 7, null, 0, 'A chainsaw! Find some meat!');

    // KEYS
    case 5: // Blue keycard
      return giveKey(player, 'blueCard', 'Picked up a blue keycard.');

    case 40: // Blue skull key
      return giveKey(player, 'blueSkull', 'Picked up a blue skull key.');

    case 13: // Red keycard
      return giveKey(player, 'redCard', 'Picked up a red keycard.');

    case 38: // Red skull key
      return giveKey(player, 'redSkull', 'Picked up a red skull key.');

    case 6: // Yellow keycard
      return giveKey(player, 'yellowCard', 'Picked up a yellow keycard.');

    case 39: // Yellow skull key
      return giveKey(player, 'yellowSkull', 'Picked up a yellow skull key.');

    // POWERUPS
    case 2022: // Invulnerability
      return givePowerup(player, 'invulnerability', 30, 'Invulnerability!');

    case 2023: // Berserk
      return givePowerup(player, 'berserk', -1, 'Berserk!'); // Permanent until death

    case 2024: // Invisibility
      return givePowerup(player, 'invisibility', 60, 'Partial invisibility!');

    case 2025: // Radiation suit
      return givePowerup(player, 'radsuit', 60, 'Radiation shielding suit!');

    case 2026: // Computer map
      return givePowerup(player, 'allmap', -1, 'Computer area map!');

    case 2045: // Light amplification
      return givePowerup(player, 'infrared', 120, 'Light amplification visor!');

    default:
      return { success: false };
  }
}

/**
 * Give health to player
 */
function giveHealth(player: Mobj, amount: number, max: number, message: string): PickupResult {
  // Already at max health?
  if (player.health >= max) {
    return { success: false };
  }

  player.health = Math.min(player.health + amount, max);
  return { success: true, message };
}

/**
 * Give armor to player
 */
function giveArmor(player: Mobj, amount: number, max: number, message: string): PickupResult {
  if (!player.player) return { success: false };

  // TODO: Add armor to player state
  // For now, just accept it
  console.log(`Armor given: ${amount} (max: ${max})`);

  return { success: true, message };
}

/**
 * Give ammo to player
 */
function giveAmmo(
  player: Mobj,
  ammoType: 'bullets' | 'shells' | 'rockets' | 'cells',
  amount: number,
  message: string
): PickupResult {
  if (!player.player?.ammo) return { success: false };

  const maxAmmo = {
    bullets: 200,
    shells: 50,
    rockets: 50,
    cells: 300,
  };

  const currentAmmo = player.player.ammo[ammoType] || 0;
  if (currentAmmo >= maxAmmo[ammoType]) {
    return { success: false }; // Already at max
  }

  player.player.ammo[ammoType] = Math.min(currentAmmo + amount, maxAmmo[ammoType]);
  return { success: true, message };
}

/**
 * Give weapon to player
 */
function giveWeapon(
  player: Mobj,
  weaponNum: number,
  ammoType: string | null,
  ammoAmount: number,
  message: string
): PickupResult {
  if (!player.player) return { success: false };

  // TODO: Track owned weapons in player state
  // For now, just give ammo
  if (ammoType && player.player.ammo) {
    const type = ammoType as 'bullets' | 'shells' | 'rockets' | 'cells';
    const currentAmmo = player.player.ammo[type] || 0;
    player.player.ammo[type] = currentAmmo + ammoAmount;
  }

  return { success: true, message };
}

/**
 * Give key to player
 */
function giveKey(player: Mobj, keyType: string, message: string): PickupResult {
  if (!player.player) return { success: false };

  // TODO: Track keys in player state
  console.log(`Key given: ${keyType}`);

  return { success: true, message };
}

/**
 * Give powerup to player
 */
function givePowerup(player: Mobj, powerupType: string, duration: number, message: string): PickupResult {
  if (!player.player) return { success: false };

  // TODO: Track powerups in player state with duration timers
  console.log(`Powerup given: ${powerupType} for ${duration} seconds`);

  return { success: true, message };
}

/**
 * Check if player can touch item (collision check)
 */
export function checkItemCollision(player: Mobj, item: Mobj): boolean {
  // Calculate 2D distance
  const dx = FixedToFloat(player.x - item.x);
  const dy = FixedToFloat(player.y - item.y);
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Check if within pickup range (player radius + item radius)
  const playerRadius = FixedToFloat(player.radius);
  const itemRadius = FixedToFloat(item.radius);
  const pickupDist = playerRadius + itemRadius;

  return dist < pickupDist;
}
