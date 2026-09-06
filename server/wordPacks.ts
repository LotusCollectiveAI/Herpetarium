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

// Concrete, picturable nouns: the game is played by finding an oblique
// angle on a word, which needs something that can be seen from more than
// one side. Abstractions ("freedom", "progress") give a clue-giver nothing
// to be indirect about, and near-synonyms of an existing entry ("sea"
// against "ocean") make a clue ambiguous no matter how well it is chosen,
// so both are kept out. Grouped only to keep the list reviewable -- every
// entry is drawn from one flat pool.
export const EXPANDED_WORDS: string[] = [
  // Landscape and water
  "tundra", "reef", "marsh", "dune", "geyser", "fjord", "delta", "savanna",
  "plateau", "cavern", "waterfall", "lagoon", "gorge", "moor", "swamp",
  "estuary", "isthmus", "summit", "ridge", "crater", "quicksand", "glade",
  "thicket", "orchard", "vineyard", "pasture", "hedgerow", "riverbank",
  "shoreline", "sandbar", "whirlpool", "rapids", "spring", "well", "pond",
  "creek", "brook", "gulf", "strait", "peninsula",

  // Weather and sky
  "blizzard", "monsoon", "hurricane", "tornado", "aurora", "dawn", "dusk",
  "twilight", "mist", "frost", "hail", "sleet", "breeze", "gale", "drizzle",
  "downpour", "smog", "haze", "sunrise", "sunset", "solstice", "equinox",
  "midnight", "noon", "shade", "drought", "flood", "thaw",

  // Animals
  "otter", "badger", "heron", "lynx", "panther", "gazelle", "walrus",
  "penguin", "dolphin", "octopus", "jellyfish", "scorpion", "beetle", "moth",
  "hummingbird", "flamingo", "pelican", "crocodile", "iguana", "chameleon",
  "tortoise", "hedgehog", "ferret", "mongoose", "bison", "moose", "camel",
  "llama", "orca", "narwhal", "manatee", "stingray", "cobra", "python",
  "gecko", "toad", "newt", "salamander", "crab", "lobster", "oyster", "snail",
  "spider", "wasp", "hornet", "dragonfly", "firefly", "cricket", "locust",
  "mantis", "swallow", "magpie", "peacock", "vulture", "stork", "puffin",
  "seal", "porcupine", "armadillo", "sloth", "lemur", "gorilla", "rhino",
  "hippo", "cheetah", "jackal", "hyena", "meerkat", "beaver", "squirrel",
  "hare", "mole", "bat", "rooster", "goose", "swan",

  // Plants
  "bamboo", "cactus", "fern", "ivy", "willow", "birch", "cedar", "maple",
  "oak", "redwood", "sunflower", "poppy", "lavender", "thistle", "clover",
  "mushroom", "acorn", "pinecone", "vine", "bramble", "reed", "seaweed",
  "lotus", "bonsai", "sapling", "stump", "bark", "thorn", "nectar", "pollen",

  // Food and drink
  "bagel", "pretzel", "waffle", "pancake", "croissant", "dumpling", "sushi",
  "taco", "curry", "chowder", "omelet", "custard", "caramel", "nougat",
  "sorbet", "espresso", "cider", "whiskey", "vinegar", "molasses", "honey",
  "syrup", "mustard", "paprika", "saffron", "cinnamon", "vanilla", "ginger",
  "garlic", "olive", "walnut", "almond", "apricot", "mango", "papaya",
  "lychee", "fig", "plum", "peach", "melon", "coconut", "pickle", "porridge",
  "biscuit", "marmalade", "yogurt", "sausage", "noodle", "dough", "yeast",

  // Tools and hardware
  "anvil", "hammer", "chisel", "wrench", "pliers", "drill", "ladder",
  "shovel", "rake", "scythe", "axe", "saw", "nail", "screw", "bolt", "hinge",
  "latch", "padlock", "rope", "pulley", "lever", "wedge", "clamp", "vice",
  "trowel", "sandpaper", "crowbar", "tweezers", "scissors", "stapler",

  // Household
  "kettle", "teapot", "cauldron", "skillet", "colander", "whisk", "spatula",
  "corkscrew", "thimble", "yarn", "quilt", "pillow", "mattress", "curtain",
  "rug", "vase", "candle", "doorknob", "mailbox", "broom", "mop", "bucket",
  "basket", "drawer", "cupboard", "faucet", "bathtub", "kettledrum",
  "coaster", "napkin", "apron", "hanger", "doormat", "birdcage", "aquarium",

  // Instruments
  "harp", "banjo", "cello", "oboe", "clarinet", "trumpet", "trombone", "tuba",
  "accordion", "harmonica", "bagpipe", "tambourine", "xylophone", "sitar",
  "ukulele", "saxophone", "metronome", "chime", "gong", "whistle",

  // Buildings and places
  "windmill", "barn", "silo", "chapel", "monastery", "pagoda", "obelisk",
  "aqueduct", "fortress", "dungeon", "catacomb", "observatory", "museum",
  "tavern", "bazaar", "plaza", "courtyard", "balcony", "attic", "basement",
  "chimney", "staircase", "elevator", "corridor", "vault", "greenhouse",
  "stable", "hangar", "warehouse", "factory", "quarry", "dam", "canal",
  "tunnel", "pier", "dock", "arena", "stadium", "theater", "carousel",
  "treehouse", "igloo", "tent", "cabin", "cottage", "mansion", "skyscraper",

  // Transport
  "schooner", "galleon", "canoe", "kayak", "raft", "ferry", "tugboat",
  "gondola", "sled", "chariot", "carriage", "wagon", "tractor", "bulldozer",
  "forklift", "locomotive", "caboose", "trolley", "tram", "scooter",
  "glider", "blimp", "zeppelin", "helicopter", "rocket", "satellite",
  "rover", "bicycle", "motorcycle", "ambulance", "lifeboat", "hovercraft",

  // Clothing and adornment
  "cloak", "poncho", "kimono", "kilt", "turban", "beret", "fedora", "bonnet",
  "mitten", "scarf", "sandal", "boot", "slipper", "tuxedo", "gown", "veil",
  "brooch", "locket", "bracelet", "tiara", "monocle", "goggles", "glove",
  "sneaker", "raincoat", "pajamas", "uniform", "costume", "buckle", "zipper",

  // Science, minerals, cosmos
  "quasar", "pulsar", "asteroid", "meteorite", "telescope", "microscope",
  "centrifuge", "beaker", "flask", "atom", "molecule", "fossil", "granite",
  "marble", "slate", "flint", "limestone", "sandstone", "geode", "stalactite",
  "magnet", "battery", "circuit", "antenna", "radar", "sonar", "laser",
  "thermometer", "barometer", "seismograph", "gyroscope", "pendulum",

  // Myth and legend
  "minotaur", "centaur", "siren", "chimera", "basilisk", "banshee", "golem",
  "wraith", "goblin", "troll", "ogre", "sphinx", "hydra", "cyclops",
  "valkyrie", "titan", "sorcerer", "alchemist", "druid", "mermaid", "yeti",
  "werewolf", "vampire", "gargoyle", "talisman", "amulet", "relic", "curse",

  // People and trades
  "blacksmith", "carpenter", "cobbler", "butcher", "tailor", "weaver",
  "potter", "mason", "miner", "sailor", "captain", "admiral", "sentry",
  "herald", "minstrel", "acrobat", "magician", "juggler", "detective", "spy",
  "smuggler", "bandit", "nomad", "hermit", "monk", "pilgrim", "scholar",
  "librarian", "surgeon", "architect", "astronaut", "lumberjack", "shepherd",
  "fisherman", "gardener", "chef", "barber", "jockey", "referee", "conductor",

  // Games and sport
  "chess", "domino", "roulette", "jigsaw", "kite", "pinball", "bowling",
  "archery", "fencing", "javelin", "hurdle", "trampoline", "skateboard",
  "surfboard", "snowboard", "toboggan", "parachute", "harness", "dartboard",
  "racket", "puck", "trophy", "medal", "podium", "marathon", "relay",

  // Writing, records, navigation
  "hourglass", "sundial", "scroll", "parchment", "quill", "inkwell", "stamp",
  "envelope", "postcard", "telegram", "diary", "ledger", "almanac", "atlas",
  "dictionary", "blueprint", "manuscript", "bookmark", "calendar", "receipt",
  "passport", "ticket", "banner", "flag", "signpost", "beacon", "buoy",
  "periscope", "spyglass", "binoculars", "keyhole", "riddle", "cipher",
];

export const ALL_WORDS: string[] = Array.from(new Set([
  ...LEGACY_WORDS.map(w => w.toLowerCase()),
  ...CURATED_WORDS.map(w => w.toLowerCase()),
  ...EXPANDED_WORDS.map(w => w.toLowerCase()),
  ...WORD_PACKS.flatMap(p => p.words.map(w => w.label.toLowerCase())),
])).sort();

export function getRandomKeywords(count: number = 4, rng?: () => number): string[] {
  // Partial Fisher-Yates: only shuffle the first `count` slots instead of
  // the whole ~180-word pool, since that's all that's ever read back out.
  const pool = [...ALL_WORDS];
  const random = rng || Math.random;
  const n = pool.length;
  const result: string[] = [];
  for (let i = 0; i < count && i < n; i++) {
    const j = i + Math.floor(random() * (n - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    result.push(pool[i]);
  }
  return result;
}

// Deals both teams from a single draw, so no word can land on both boards.
// Drawing each team separately put a shared keyword in roughly one game in
// ten, and a word sitting on both boards makes clues ambiguous in a way the
// game has no answer for: a clue aimed at your own copy reads just as well
// against the opponent's, which is exactly the signal interception is
// supposed to turn on.
export function dealTeamKeywords(
  perTeam: number = 4,
  rng?: () => number,
): { amber: string[]; blue: string[] } {
  const drawn = getRandomKeywords(perTeam * 2, rng);
  return { amber: drawn.slice(0, perTeam), blue: drawn.slice(perTeam) };
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
