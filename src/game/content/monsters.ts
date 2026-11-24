/** Monster stat blocks from the 5e SRD 5.1 (CC-BY-4.0). */

import type { Monster } from '../types'

export const MONSTERS: Record<string, Monster> = {
  'giant-rat': {
    id: 'giant-rat',
    name: 'Giant Rat',
    ac: 12,
    hp: 7,
    initMod: 2,
    attacks: [{ name: 'Bite', toHit: 4, damage: '1d4+2', damageType: 'piercing' }],
    traits: ['Pack Tactics: advantage when an ally is next to the target.'],
  },
  wolf: {
    id: 'wolf',
    name: 'Wolf',
    ac: 13,
    hp: 11,
    initMod: 2,
    attacks: [{ name: 'Bite', toHit: 4, damage: '2d4+2', damageType: 'piercing', note: 'DC 11 STR save or knocked prone' }],
    traits: ['Pack Tactics.', 'Keen hearing and smell.'],
  },
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    ac: 13,
    hp: 13,
    initMod: 2,
    attacks: [
      { name: 'Shortsword', toHit: 4, damage: '1d6+2', damageType: 'piercing' },
      { name: 'Shortbow', toHit: 4, damage: '1d6+2', damageType: 'piercing' },
    ],
    traits: ['Vulnerable to bludgeoning damage.', 'Undead.'],
  },
  zombie: {
    id: 'zombie',
    name: 'Drowned Zombie',
    ac: 8,
    hp: 22,
    initMod: -2,
    attacks: [{ name: 'Slam', toHit: 3, damage: '1d6+1', damageType: 'bludgeoning' }],
    traits: ['Undead Fortitude: may stay at 1 HP when dropped (not vs radiant or crits).', 'Undead.'],
  },
  ghoul: {
    id: 'ghoul',
    name: 'Ghoul',
    ac: 12,
    hp: 22,
    initMod: 2,
    attacks: [
      { name: 'Claws', toHit: 4, damage: '2d4+2', damageType: 'slashing', note: 'DC 10 CON save or paralyzed 1 minute' },
      { name: 'Bite', toHit: 2, damage: '2d6+2', damageType: 'piercing' },
    ],
    traits: ['Undead.'],
  },
  ghast: {
    id: 'ghast',
    name: 'Ghast',
    ac: 13,
    hp: 36,
    initMod: 3,
    attacks: [
      { name: 'Claws', toHit: 5, damage: '2d6+3', damageType: 'slashing', note: 'DC 10 CON save or paralyzed 1 minute' },
      { name: 'Bite', toHit: 3, damage: '2d8+3', damageType: 'piercing' },
    ],
    traits: ['Stench: creatures starting a turn within 5 ft make a DC 10 CON save or are poisoned.', 'Turning Defiance.', 'Undead.'],
  },
}
