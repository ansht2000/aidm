/**
 * Adventure modules. Each is a hidden outline the DM runs: four scenes sized
 * for a ~25-minute session. The (stretch) AI generator emits this same shape.
 */

import type { AdventureModule } from '../types'

export const BELL_BENEATH_THE_MARSH: AdventureModule = {
  id: 'bell-beneath-the-marsh',
  title: 'The Bell Beneath the Marsh',
  pitch:
    'For three nights a drowned chapel has rung its bell across the fens, and each night someone walks into the fog and does not come back.',
  tone: 'Gothic folk horror with warmth: eerie, damp, candlelit, with moments of grim humor and real stakes.',
  premise:
    'Fifty years ago Deacon Aldous Mourne flooded the Chapel of the Tide with his congregation inside, believing the sea would keep them "safe forever". He became a ghast bound to the chapel bell. Now the bell calls to the grieving: anyone in Saltmere who has lost someone hears their lost one\'s voice in its toll and walks into the marsh. Tonight Elsie Hale, the miller\'s daughter, walked out. The entranced villagers are alive in the flooded crypt; the deacon means to "give them to the tide" at dawn. Cutting the bell rope or destroying Mourne breaks the trance.',
  opening:
    'Open in the Gutted Eel tavern in Saltmere, near midnight, rain on the shutters. The bell tolls once, far out in the fog, and every conversation stops. Hale the miller bursts in shouting that Elsie is gone. Ask the party what they do.',
  scenes: [
    {
      id: 'tavern',
      title: 'The Gutted Eel',
      type: 'tavern',
      goal: 'Learn what the bell is, that the missing walk toward the old chapel, and get a lead on opening its crypt.',
      description:
        'A low smoky taproom that smells of brine and peat smoke. Nets on the rafters, a sputtering fire, a dozen frightened locals who all suddenly find their mugs fascinating.',
      beats: [
        'Hale the miller begs for help, offering 50 gold and his late wife\'s silver locket.',
        'Marta Reeve, the tavern keeper, lost her brother to the bell three nights ago and is angry, not scared.',
        'Old Fennick, a drunk, was the bell-ringer\'s apprentice as a boy. With kindness or a drink he remembers the words carved over the crypt door: "The tide keeps what the tide is given."',
        'Everyone who vanished had lost someone. (Insight or Investigation reveals this pattern.)',
      ],
      npcs: [
        { name: 'Hale', role: 'desperate miller, Elsie\'s father', secret: 'He heard his dead wife\'s voice in the bell too, and is ashamed of how much he wanted to follow it.' },
        { name: 'Marta Reeve', role: 'gruff tavern keeper', secret: 'Will lend a boat-hook and a lantern that never goes out (it is just very good oil).' },
        { name: 'Old Fennick', role: 'drunk former bell-ringer\'s apprentice', secret: 'Knows the crypt door opens when something is offered to the font.' },
      ],
      hazards: [],
      encounters: [],
      exits: 'The causeway path east into the fens leads to the chapel (about an hour\'s walk, compressed in play).',
      minutes: 5,
    },
    {
      id: 'marsh',
      title: 'The Fog Road',
      type: 'marsh',
      goal: 'Cross the fens to the chapel without losing the path, find a sign of Elsie.',
      description:
        'A rotting plank causeway through reeds taller than a person. Fog so thick lantern light stops at arm\'s length. Somewhere ahead, the bell, closer now.',
      beats: [
        'Pale lights drift off the path, mimicking lanterns. Following them leads into sucking mud (Survival or Perception DC 13 to stay on the path).',
        'A collapsed section of causeway: jump or wade (Athletics or Acrobatics DC 12; failure deals 1d6 bludgeoning and soaks gear).',
        'Elsie\'s yellow hair ribbon caught on a reed, pointing the way.',
        'Starving wolves circle in the fog. They can be scared off (Intimidation or Animal Handling DC 13) or fought.',
      ],
      npcs: [],
      hazards: ['Sinking mud', 'False lights', 'Broken causeway'],
      encounters: [
        { id: 'wolves', label: 'Starving wolves', groups: [{ monsterId: 'wolf', base: 2, perExtraPlayer: 0.5 }] },
      ],
      exits: 'The causeway ends at the sunken chapel.',
      minutes: 6,
    },
    {
      id: 'chapel',
      title: 'The Sunken Chapel',
      type: 'ruins',
      goal: 'Get into the crypt beneath the chapel.',
      description:
        'A stone chapel tilted into the marsh, its nave half-flooded with black water. The bell tower stands upright; its rope hangs down into the water, wet and strangely warm.',
      beats: [
        'Pews poke from the water like ribs. A stone font by the altar is dry, the only dry thing here.',
        'The crypt door is carved: "The tide keeps what the tide is given." Offering any object to the font opens it. Forcing it is Athletics DC 15; Religion DC 12 understands the inscription.',
        'A ghostly echo plays out: Deacon Mourne barring the doors while the congregation sings. (Lets clever players learn the bell rope is the heart of the curse.)',
        'If the party is loud, the drowned choir (skeletons) rises from the pews.',
      ],
      npcs: [{ name: 'The echo of Deacon Mourne', role: 'a memory, not a ghost; cannot be spoken to' }],
      hazards: ['Deep water hides a broken floor'],
      encounters: [
        { id: 'choir', label: 'The drowned choir', groups: [{ monsterId: 'skeleton', base: 2, perExtraPlayer: 0.5 }] },
      ],
      exits: 'Stairs spiral down into the flooded crypt.',
      minutes: 6,
    },
    {
      id: 'crypt',
      title: 'The Flooded Crypt',
      type: 'crypt',
      goal: 'Save Elsie and the entranced villagers before dawn by destroying Deacon Mourne or cutting the bell rope.',
      description:
        'Knee-deep black water under a low vault. Candles burn underwater, throwing green light. A dozen villagers stand silent and swaying; Elsie is closest to the altar. The bell rope descends through a hole in the ceiling to the deacon\'s hand.',
      beats: [
        'Deacon Mourne, a ghast in rotting vestments, welcomes the party as new congregants.',
        'He fights to keep his flock; drowned zombies rise to defend him.',
        'Cutting the bell rope (10 damage to it, AC 10, or Athletics DC 14 to tear it) breaks the trance and makes the zombies collapse.',
        'Turn Undead and radiant damage are especially effective here.',
      ],
      npcs: [
        { name: 'Deacon Aldous Mourne', role: 'the ghast deacon, the villain', secret: 'Genuinely believes he is protecting his flock.' },
        { name: 'Elsie Hale', role: 'entranced miller\'s daughter', secret: 'Wakes if someone speaks her father\'s message to her.' },
      ],
      hazards: ['Knee-deep water: difficult terrain'],
      encounters: [
        {
          id: 'finale',
          label: 'Deacon Mourne and the drowned',
          groups: [
            { monsterId: 'ghast', base: 1, perExtraPlayer: 0, name: 'Deacon Mourne' },
            { monsterId: 'zombie', base: 1, perExtraPlayer: 0.5 },
          ],
        },
      ],
      exits: 'Victory ends the adventure.',
      minutes: 8,
    },
  ],
  victory:
    'The bell falls silent, the villagers wake, and the party leads them home through a lifting fog at dawn. Hale pays the reward; Saltmere will remember their names.',
  defeat:
    'The party falls in the black water. At dawn the bell tolls one last time, and Saltmere loses more than it can bear. (Narrate gently and leave a thread of hope.)',
  targetMinutes: 25,
}

export const MODULES: Record<string, AdventureModule> = {
  [BELL_BENEATH_THE_MARSH.id]: BELL_BENEATH_THE_MARSH,
}

export const DEFAULT_MODULE_ID = BELL_BENEATH_THE_MARSH.id
