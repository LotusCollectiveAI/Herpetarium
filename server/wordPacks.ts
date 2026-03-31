/**
 * Enriched word lists and themed word packs for Decrypto Arena.
 * Merged from three sources: Herpetarium originals, decryptoai curated list,
 * and decrypto word packs with semantic tags.
 */

export interface WordCard {
  label: string;
  vibe: string;
  tags: string[];
}

export interface WordPack {
  name: string;
  words: WordCard[];
}

export const WORD_PACKS: WordPack[] = [
  {
    name: "Fire & Navigation",
    words: [
      { label: "Volcano", vibe: "fiery pressure", tags: ["lava", "magma", "ash", "crater", "eruption", "molten", "smoke"] },
      { label: "Compass", vibe: "directional certainty", tags: ["north", "needle", "bearing", "map", "magnet", "navigate", "course"] },
      { label: "Lantern", vibe: "warm light", tags: ["glow", "wick", "oil", "beam", "night", "guiding", "flame"] },
      { label: "Mirror", vibe: "silver reflection", tags: ["glass", "reflection", "double", "shine", "echo", "vanity", "image"] },
    ],
  },
  {
    name: "Harbor & Ceremony",
    words: [
      { label: "Harbor", vibe: "safe arrival", tags: ["dock", "anchor", "port", "ships", "mooring", "bay", "pier"] },
      { label: "Violin", vibe: "bright resonance", tags: ["bow", "string", "orchestra", "vibrato", "sonata", "wood", "melody"] },
      { label: "Meteor", vibe: "sudden streak", tags: ["space", "streak", "burn", "impact", "sky", "tail", "flash"] },
      { label: "Crown", vibe: "ceremonial power", tags: ["royal", "gold", "throne", "jewel", "king", "coronation", "scepter"] },
    ],
  },
  {
    name: "Knowledge & Nature",
    words: [
      { label: "Library", vibe: "quiet knowledge", tags: ["books", "shelf", "archive", "study", "pages", "catalog", "hush"] },
      { label: "Thunder", vibe: "violent sound", tags: ["storm", "boom", "lightning", "rumble", "cloud", "crack", "roar"] },
      { label: "Clock", vibe: "measured time", tags: ["tick", "gear", "hours", "alarm", "pendulum", "minute", "watch"] },
      { label: "Garden", vibe: "cultivated life", tags: ["bloom", "soil", "petal", "hedge", "green", "seed", "sprout"] },
    ],
  },
  {
    name: "Sacred & Delicate",
    words: [
      { label: "Cathedral", vibe: "reverent height", tags: ["choir", "stone", "stained", "spire", "altar", "echo", "saint"] },
      { label: "Teacup", vibe: "delicate comfort", tags: ["porcelain", "saucer", "steam", "sip", "china", "brew", "fragile"] },
      { label: "Glacier", vibe: "slow cold mass", tags: ["ice", "crevasse", "frozen", "blue", "drift", "crack", "melt"] },
      { label: "Parrot", vibe: "bright mimicry", tags: ["feather", "tropical", "squawk", "pirate", "beak", "repeat", "perch"] },
    ],
  },
  {
    name: "Warmth & Scale",
    words: [
      { label: "Bakery", vibe: "warm sweetness", tags: ["bread", "oven", "dough", "yeast", "flour", "pastry", "crumb"] },
      { label: "Planet", vibe: "orbital scale", tags: ["orbit", "world", "rings", "gravity", "moon", "solar", "sphere"] },
      { label: "Bridge", vibe: "spanning connection", tags: ["river", "span", "steel", "crossing", "arch", "cables", "link"] },
      { label: "Phoenix", vibe: "burning rebirth", tags: ["reborn", "embers", "myth", "wings", "firebird", "rise", "ashes"] },
    ],
  },
  {
    name: "Force & Memory",
    words: [
      { label: "Avalanche", vibe: "unstoppable force", tags: ["snow", "slide", "mountain", "crash", "bury", "slope", "whiteout"] },
      { label: "Camera", vibe: "captured memory", tags: ["lens", "flash", "focus", "film", "shutter", "zoom", "snapshot"] },
      { label: "Oasis", vibe: "hidden relief", tags: ["desert", "water", "palm", "mirage", "spring", "shade", "rest"] },
      { label: "Dagger", vibe: "quick danger", tags: ["blade", "steel", "stab", "hilt", "cloak", "sharp", "knife"] },
    ],
  },
  {
    name: "Spectacle & Guidance",
    words: [
      { label: "Circus", vibe: "restless spectacle", tags: ["tent", "clown", "ring", "trapeze", "crowd", "juggle", "spotlight"] },
      { label: "Lighthouse", vibe: "lonely guidance", tags: ["beacon", "coast", "beam", "tower", "fog", "signal", "shore"] },
      { label: "Dragon", vibe: "ancient menace", tags: ["scales", "treasure", "smoke", "wing", "hoard", "flame", "wyrm"] },
      { label: "Typewriter", vibe: "mechanical language", tags: ["keys", "ink", "ribbon", "click", "carriage", "letter", "paper"] },
    ],
  },
  {
    name: "Wild & Brilliant",
    words: [
      { label: "Forest", vibe: "layered wildness", tags: ["trees", "moss", "canopy", "roots", "pine", "trail", "shadow"] },
      { label: "Opera", vibe: "grand emotion", tags: ["aria", "stage", "dramatic", "soprano", "curtain", "voice", "costume"] },
      { label: "Submarine", vibe: "hidden pressure", tags: ["sonar", "depth", "torpedo", "hull", "periscope", "ocean", "dive"] },
      { label: "Diamond", vibe: "hard brilliance", tags: ["gem", "sparkle", "cut", "clarity", "ring", "facet", "jewel"] },
    ],
  },
];

export const CURATED_WORDS: string[] = [
  "Ocean", "Mountain", "Desert", "Forest", "River",
  "Thunder", "Lightning", "Rainbow", "Storm", "Cloud",
  "Eagle", "Wolf", "Bear", "Fox", "Owl",
  "Dragon", "Phoenix", "Unicorn", "Griffin", "Pegasus",
  "Knight", "Wizard", "Archer", "Warrior", "Rogue",
  "Castle", "Tower", "Bridge", "Gate", "Wall",
  "Crown", "Sword", "Shield", "Armor", "Helmet",
  "Diamond", "Ruby", "Emerald", "Sapphire", "Pearl",
  "Moon", "Star", "Sun", "Comet", "Galaxy",
  "Music", "Dance", "Song", "Rhythm", "Melody",
  "Book", "Pen", "Paper", "Letter", "Story",
  "Fire", "Water", "Earth", "Wind", "Ice",
  "Gold", "Silver", "Bronze", "Copper", "Iron",
  "Apple", "Orange", "Banana", "Grape", "Cherry",
  "Rose", "Lily", "Tulip", "Daisy", "Orchid",
  "Piano", "Guitar", "Drum", "Flute", "Violin",
  "Painting", "Sculpture", "Drawing", "Portrait", "Canvas",
  "Island", "Beach", "Wave", "Tide",
  "Valley", "Hill", "Peak", "Cliff",
  "Garden", "Meadow", "Prairie", "Field", "Farm",
];

export const LEGACY_WORDS: string[] = [
  "beach", "castle", "dragon", "eagle", "forest", "garden", "harbor", "island",
  "jungle", "knight", "lantern", "mountain", "Neptune", "ocean", "palace", "queen",
  "rainbow", "shadow", "thunder", "unicorn", "valley", "wizard", "arctic", "bridge",
  "crystal", "desert", "ember", "falcon", "glacier", "horizon", "ivory", "jasmine",
  "kingdom", "legend", "meteor", "nebula", "oracle", "phoenix", "quartz", "raven",
  "serpent", "temple", "umbrella", "volcano", "whisper", "xenon", "youth", "zenith",
  "anchor", "blossom", "canyon", "diamond", "eclipse", "flame", "ghost", "harvest",
  "iceberg", "jester", "kraken", "labyrinth", "mirror", "nova", "obsidian", "prism",
];

export const ALL_WORDS: string[] = Array.from(new Set([
  ...LEGACY_WORDS.map(w => w.toLowerCase()),
  ...CURATED_WORDS.map(w => w.toLowerCase()),
  ...WORD_PACKS.flatMap(p => p.words.map(w => w.label.toLowerCase())),
])).sort();

export function getRandomKeywords(count: number = 4, rng?: () => number): string[] {
  const shuffled = [...ALL_WORDS];
  const random = rng || Math.random;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function getWordPacks(): WordPack[] {
  return WORD_PACKS;
}

export function getRandomKeywordsFromPack(packIndex: number, count: number): string[] {
  const pack = WORD_PACKS[packIndex % WORD_PACKS.length];
  return pack.words.slice(0, count).map(w => w.label);
}

export function getWordCardForLabel(label: string): WordCard | undefined {
  const lower = label.toLowerCase();
  for (const pack of WORD_PACKS) {
    const card = pack.words.find(w => w.label.toLowerCase() === lower);
    if (card) return card;
  }
  return undefined;
}
