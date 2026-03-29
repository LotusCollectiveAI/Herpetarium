import type { GenomeModules, StrategyGenome, EvolutionConfig, PhaseTransition, AIPlayerConfig } from "@shared/schema";
import { storage } from "./storage";
import { runHeadlessMatch } from "./headlessRunner";
import { log } from "./index";

const activeRuns = new Map<number, boolean>();

export function isEvolutionRunning(id: number): boolean {
  return activeRuns.get(id) === true;
}

export function stopEvolutionRun(id: number) {
  activeRuns.set(id, false);
}

const SEED_GENOME_TEMPLATES: GenomeModules[] = [
  {
    cluePhilosophy: "Use abstract, metaphorical associations. Prefer poetic and lateral thinking over direct synonyms. Aim for clues that feel thematic rather than dictionary-like.",
    opponentModeling: "Assume opponents are tracking patterns. Vary your clue style each round to prevent pattern recognition. Occasionally sacrifice clarity for unpredictability.",
    riskTolerance: "Moderate risk. Prefer clues your team will likely understand even if they're not perfectly obscure. Avoid overly clever clues that might confuse teammates.",
    memoryPolicy: "Track which clue styles have been intercepted in past rounds. Avoid repeating approaches that led to interceptions. Build on successful patterns from earlier rounds.",
  },
  {
    cluePhilosophy: "Use concrete, sensory-based associations. Think about what the keyword looks like, sounds like, or feels like. Ground clues in physical experience.",
    opponentModeling: "Aggressive interception focus. Study opponent clue patterns closely and try to decode their keyword mapping. Prioritize breaking their code over protecting your own.",
    riskTolerance: "High risk tolerance. Willing to use obscure clues that only deep teammates would catch. Accept some miscommunication for better security against interception.",
    memoryPolicy: "Maintain a mental map of opponent keyword-clue associations. Each round, refine your model of what their keywords might be based on accumulated evidence.",
  },
  {
    cluePhilosophy: "Use functional and relational associations. Think about what the keyword does, what category it belongs to, or what it relates to in everyday use.",
    opponentModeling: "Defensive posture. Focus primarily on making your own clues clear to teammates rather than trying to intercept. Only attempt interception when very confident.",
    riskTolerance: "Low risk. Prioritize team communication clarity above all else. Use straightforward associations that minimize miscommunication risk.",
    memoryPolicy: "Focus on consistency. Establish clue patterns early and maintain them so teammates can predict your style. Consistency builds team trust and accuracy.",
  },
  {
    cluePhilosophy: "Use cultural and contextual references. Draw from shared cultural knowledge—movies, books, common expressions. Assume your teammates share similar cultural context.",
    opponentModeling: "Balanced approach. Split attention equally between making good clues and attempting interceptions. Adapt based on the score—more aggressive when behind, more defensive when ahead.",
    riskTolerance: "Adaptive risk. Take bigger risks early in the game to establish advantages, then become more conservative as token counts accumulate.",
    memoryPolicy: "Learn from mistakes. If a clue was too obvious (intercepted), shift to more obscure associations next round. If too obscure (miscommunicated), shift to clearer ones.",
  },
  {
    cluePhilosophy: "Use oppositional and negative space associations. Think about what the keyword is NOT, or what contrasts with it. Clue by exclusion and contrast rather than similarity.",
    opponentModeling: "Theory of mind focused. Try to think about what opponents think you're thinking. Use second and third-order reasoning to stay ahead of their interception attempts.",
    riskTolerance: "Variable risk based on game state. Very conservative when close to losing (2 white tokens), very aggressive when opponent is close to losing.",
    memoryPolicy: "Build a comprehensive game model. Track all clues, codes, and outcomes for both teams. Use this complete history to make increasingly informed decisions.",
  },
  {
    cluePhilosophy: "Use phonetic and linguistic associations. Think about how words sound, rhyme, or share etymological roots. Wordplay and language structure over meaning.",
    opponentModeling: "Minimal opponent modeling. Focus entirely on your own team's communication efficiency. Assume opponents will sometimes intercept and plan around it.",
    riskTolerance: "Extremely high risk. Use creative, unusual associations that require lateral thinking. Accept higher miscommunication rates for near-zero interception vulnerability.",
    memoryPolicy: "Short memory. Treat each round relatively fresh. Don't over-anchor on past patterns—stay flexible and responsive to the current situation.",
  },
  {
    cluePhilosophy: "Use hierarchical category associations. Place the keyword in taxonomic categories (genus, species, family). Think like a classifier or encyclopedia.",
    opponentModeling: "Pattern-breaking focus. Actively change your clue strategy every 2-3 rounds to keep opponents off-balance. Use unpredictability as a weapon.",
    riskTolerance: "Medium-low risk. Slightly favor clarity over security but maintain enough variety to avoid being fully predictable.",
    memoryPolicy: "Selective memory. Remember only the most important events—interceptions and miscommunications. Ignore neutral rounds to avoid information overload.",
  },
  {
    cluePhilosophy: "Use emotional and psychological associations. Connect keywords to feelings, moods, or psychological states they evoke. Tap into shared emotional understanding.",
    opponentModeling: "Exploit-focused. Look for weaknesses in opponent patterns. If they consistently struggle with certain types of clues, exploit those patterns aggressively.",
    riskTolerance: "Calculated risk. Assign rough probabilities to whether teammates and opponents will decode each clue. Choose the option with the best expected value.",
    memoryPolicy: "Strategic note-taking. Keep running notes on what works and what doesn't. Refine strategy between rounds based on accumulated intelligence.",
  },
];

export function generateSeedPopulation(runId: number, size: number): GenomeModules[] {
  const population: GenomeModules[] = [];
  for (let i = 0; i < size; i++) {
    const template = SEED_GENOME_TEMPLATES[i % SEED_GENOME_TEMPLATES.length];
    if (i < SEED_GENOME_TEMPLATES.length) {
      population.push({ ...template });
    } else {
      population.push(crossoverModules(
        SEED_GENOME_TEMPLATES[Math.floor(Math.random() * SEED_GENOME_TEMPLATES.length)],
        SEED_GENOME_TEMPLATES[Math.floor(Math.random() * SEED_GENOME_TEMPLATES.length)]
      ));
    }
  }
  return population;
}

function crossoverModules(a: GenomeModules, b: GenomeModules): GenomeModules {
  const keys: (keyof GenomeModules)[] = ["cluePhilosophy", "opponentModeling", "riskTolerance", "memoryPolicy"];
  const child: GenomeModules = { cluePhilosophy: "", opponentModeling: "", riskTolerance: "", memoryPolicy: "" };
  for (const key of keys) {
    child[key] = Math.random() < 0.5 ? a[key] : b[key];
  }
  return child;
}

function buildGenomeSystemPrompt(modules: GenomeModules): string {
  return `You are a highly competitive Decrypto player with the following strategic profile:

CLUE PHILOSOPHY: ${modules.cluePhilosophy}

OPPONENT MODELING: ${modules.opponentModeling}

RISK TOLERANCE: ${modules.riskTolerance}

MEMORY POLICY: ${modules.memoryPolicy}

Apply these strategic principles when generating clues, making guesses, and attempting interceptions. Your goal is to win the game by getting your team 2 interception tokens or forcing the opponent into 2 miscommunication tokens.`;
}

const K_FACTOR = 32;

function updateElo(winnerElo: number, loserElo: number): { winnerNew: number; loserNew: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 - expectedWinner;
  return {
    winnerNew: Math.round(winnerElo + K_FACTOR * (1 - expectedWinner)),
    loserNew: Math.round(loserElo + K_FACTOR * (0 - expectedLoser)),
  };
}

function computeFitness(genome: { wins: number; losses: number; matchesPlayed: number; eloRating: number; interceptionRate?: string | null; miscommunicationRate?: string | null }): number {
  if (genome.matchesPlayed === 0) return 0;
  const winRate = genome.wins / genome.matchesPlayed;
  const eloNorm = (genome.eloRating - 800) / 800;
  const intRate = genome.interceptionRate ? parseFloat(genome.interceptionRate) : 0;
  const miscRate = genome.miscommunicationRate ? parseFloat(genome.miscommunicationRate) : 0;
  return (winRate * 0.4) + (eloNorm * 0.3) + (intRate * 0.15) - (miscRate * 0.15);
}

function tournamentSelect(genomes: StrategyGenome[], tournamentSize: number = 3): StrategyGenome {
  const candidates: StrategyGenome[] = [];
  for (let i = 0; i < tournamentSize; i++) {
    candidates.push(genomes[Math.floor(Math.random() * genomes.length)]);
  }
  return candidates.sort((a, b) => computeFitness(b) - computeFitness(a))[0];
}

function computePopulationDiversity(genomes: StrategyGenome[]): number {
  if (genomes.length < 2) return 0;
  const moduleKeys: (keyof GenomeModules)[] = ["cluePhilosophy", "opponentModeling", "riskTolerance", "memoryPolicy"];
  let totalPairs = 0;
  let totalDiff = 0;
  for (let i = 0; i < genomes.length; i++) {
    for (let j = i + 1; j < genomes.length; j++) {
      totalPairs++;
      let diff = 0;
      for (const key of moduleKeys) {
        const a = (genomes[i].modules as GenomeModules)[key];
        const b = (genomes[j].modules as GenomeModules)[key];
        if (a !== b) diff++;
      }
      totalDiff += diff / moduleKeys.length;
    }
  }
  return totalPairs > 0 ? totalDiff / totalPairs : 0;
}

function detectPhaseTransitions(
  currentGen: number,
  generationStats: Array<{ gen: number; avgFitness: number; maxFitness: number; diversity: number; fitnessStdDev: number }>
): PhaseTransition | null {
  if (generationStats.length < 3) return null;

  const recent = generationStats.slice(-3);
  const prev = recent[recent.length - 2];
  const curr = recent[recent.length - 1];

  if (curr.diversity < 0.2 && prev.diversity >= 0.2) {
    return {
      fromGeneration: currentGen - 1,
      toGeneration: currentGen,
      type: "convergence",
      evidence: `Diversity dropped from ${prev.diversity.toFixed(3)} to ${curr.diversity.toFixed(3)}`,
      detectedAt: new Date().toISOString(),
    };
  }

  if (curr.diversity < 0.1 && curr.fitnessStdDev < 0.05) {
    return {
      fromGeneration: currentGen - 1,
      toGeneration: currentGen,
      type: "collapse",
      evidence: `Very low diversity (${curr.diversity.toFixed(3)}) and fitness std dev (${curr.fitnessStdDev.toFixed(3)})`,
      detectedAt: new Date().toISOString(),
    };
  }

  if (curr.fitnessStdDev > prev.fitnessStdDev * 1.5 && curr.diversity > prev.diversity) {
    return {
      fromGeneration: currentGen - 1,
      toGeneration: currentGen,
      type: "exploration",
      evidence: `Fitness variance increased ${(curr.fitnessStdDev / prev.fitnessStdDev).toFixed(2)}x with rising diversity`,
      detectedAt: new Date().toISOString(),
    };
  }

  if (curr.maxFitness > prev.maxFitness && curr.diversity < prev.diversity) {
    return {
      fromGeneration: currentGen - 1,
      toGeneration: currentGen,
      type: "exploitation",
      evidence: `Max fitness rising (${prev.maxFitness.toFixed(3)} → ${curr.maxFitness.toFixed(3)}) while diversity decreasing`,
      detectedAt: new Date().toISOString(),
    };
  }

  return null;
}

export async function createEvolutionRun(config: EvolutionConfig) {
  const run = await storage.createEvolutionRun({
    name: `Evolution: ${config.baseProvider}/${config.baseModel} pop=${config.populationSize}`,
    status: "pending",
    config: config as any,
    populationSize: config.populationSize,
    totalGenerations: config.totalGenerations,
    currentGeneration: 0,
    mutationRate: config.mutationRate.toString(),
    crossoverRate: config.crossoverRate.toString(),
    elitismCount: config.elitismCount,
    budgetCapUsd: config.budgetCapUsd || null,
  });

  const seedPopulation = generateSeedPopulation(run.id, config.populationSize);
  for (let i = 0; i < seedPopulation.length; i++) {
    await storage.createStrategyGenome({
      evolutionRunId: run.id,
      generationNumber: 0,
      parentIds: [],
      modules: seedPopulation[i],
      eloRating: 1200,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      lineageTag: `seed-${i}`,
    });
  }

  return run;
}

export async function runEvolution(runId: number) {
  if (activeRuns.get(runId)) {
    log(`[evolution] Run ${runId} already active`, "evolution");
    return;
  }

  activeRuns.set(runId, true);

  try {
    const run = await storage.getEvolutionRun(runId);
    if (!run) throw new Error(`Evolution run ${runId} not found`);

    const config = run.config as EvolutionConfig;
    const budgetCap = run.budgetCapUsd ? parseFloat(run.budgetCapUsd) : null;

    await storage.updateEvolutionRun(runId, {
      status: "running",
      startedAt: new Date(),
    });

    log(`[evolution] Starting run ${runId}: ${config.totalGenerations} generations, pop ${config.populationSize}`, "evolution");

    const generationStats: Array<{ gen: number; avgFitness: number; maxFitness: number; diversity: number; fitnessStdDev: number }> = [];
    const allMatchIds: number[] = [];
    const transitions: PhaseTransition[] = [];

    for (let gen = run.currentGeneration; gen < config.totalGenerations; gen++) {
      if (!activeRuns.get(runId)) {
        log(`[evolution] Run ${runId} stopped at generation ${gen}`, "evolution");
        break;
      }

      if (budgetCap && allMatchIds.length > 0) {
        const currentCost = await storage.getCumulativeCost(allMatchIds);
        await storage.updateEvolutionRun(runId, { actualCostUsd: currentCost.toFixed(6) });
        if (currentCost >= budgetCap) {
          log(`[evolution] Run ${runId} budget exceeded at gen ${gen}`, "evolution");
          await storage.updateEvolutionRun(runId, { status: "budget_exceeded" });
          break;
        }
      }

      log(`[evolution] Run ${runId} - Generation ${gen}/${config.totalGenerations}`, "evolution");

      const genRecord = await storage.createGeneration({
        evolutionRunId: runId,
        generationNumber: gen,
        status: "running",
      });

      const population = await storage.getStrategyGenomes(runId, gen);
      const matchIds: number[] = [];

      const stats = new Map<number, { elo: number; wins: number; losses: number; matchesPlayed: number; interceptedOpp: number; interceptAttempts: number; miscommunications: number; ownGuesses: number }>();
      for (const g of population) {
        stats.set(g.id, { elo: g.eloRating, wins: 0, losses: 0, matchesPlayed: 0, interceptedOpp: 0, interceptAttempts: 0, miscommunications: 0, ownGuesses: 0 });
      }

      for (let i = 0; i < population.length; i++) {
        for (let j = i + 1; j < population.length; j++) {
          if (!activeRuns.get(runId)) break;

          for (let m = 0; m < config.matchesPerEvaluation; m++) {
            try {
              const genomeA = population[i];
              const genomeB = population[j];
              const modulesA = genomeA.modules as GenomeModules;
              const modulesB = genomeB.modules as GenomeModules;

              const result = await runHeadlessMatch({
                players: [
                  { name: `G${gen}-${i}`, aiProvider: config.baseProvider, team: "amber", aiConfig: { provider: config.baseProvider, model: config.baseModel, timeoutMs: 120000, temperature: 0.7, promptStrategy: "default" as const } },
                  { name: `G${gen}-${j}`, aiProvider: config.baseProvider, team: "blue", aiConfig: { provider: config.baseProvider, model: config.baseModel, timeoutMs: 120000, temperature: 0.7, promptStrategy: "default" as const } },
                ],
                fastMode: true,
                seed: `evo-${runId}-g${gen}-${i}v${j}-m${m}`,
              }, undefined, {
                amber: buildGenomeSystemPrompt(modulesA),
                blue: buildGenomeSystemPrompt(modulesB),
              });

              matchIds.push(result.matchId);
              allMatchIds.push(result.matchId);

              const sA = stats.get(genomeA.id)!;
              const sB = stats.get(genomeB.id)!;

              sA.matchesPlayed++;
              sB.matchesPlayed++;

              const amberWhite = result.teams.amber.whiteTokens;
              const blueWhite = result.teams.blue.whiteTokens;
              const amberBlack = result.teams.amber.blackTokens;
              const blueBlack = result.teams.blue.blackTokens;

              sA.miscommunications += amberWhite;
              sA.ownGuesses += result.totalRounds;
              sA.interceptedOpp += blueBlack;
              sA.interceptAttempts += result.totalRounds;

              sB.miscommunications += blueWhite;
              sB.ownGuesses += result.totalRounds;
              sB.interceptedOpp += amberBlack;
              sB.interceptAttempts += result.totalRounds;

              if (result.winner === "amber") {
                sA.wins++;
                sB.losses++;
                const { winnerNew, loserNew } = updateElo(sA.elo, sB.elo);
                sA.elo = winnerNew;
                sB.elo = loserNew;
              } else if (result.winner === "blue") {
                sB.wins++;
                sA.losses++;
                const { winnerNew, loserNew } = updateElo(sB.elo, sA.elo);
                sB.elo = winnerNew;
                sA.elo = loserNew;
              }
            } catch (err) {
              log(`[evolution] Match failed in gen ${gen}: ${err}`, "evolution");
            }
          }
        }
      }

      for (const g of population) {
        const s = stats.get(g.id)!;
        const intRate = s.interceptAttempts > 0 ? (s.interceptedOpp / s.interceptAttempts).toFixed(6) : null;
        const miscRate = s.ownGuesses > 0 ? (s.miscommunications / s.ownGuesses).toFixed(6) : null;
        await storage.updateStrategyGenome(g.id, {
          eloRating: s.elo,
          wins: s.wins,
          losses: s.losses,
          matchesPlayed: s.matchesPlayed,
          interceptionRate: intRate,
          miscommunicationRate: miscRate,
        });
      }

      const updatedPop = await storage.getStrategyGenomes(runId, gen);
      const fitnessScores = updatedPop.map(g => computeFitness(g));

      for (let i = 0; i < updatedPop.length; i++) {
        await storage.updateStrategyGenome(updatedPop[i].id, {
          fitnessScore: fitnessScores[i].toFixed(6),
        });
      }

      const avgFitness = fitnessScores.reduce((a, b) => a + b, 0) / fitnessScores.length;
      const maxFitness = Math.max(...fitnessScores);
      const minFitness = Math.min(...fitnessScores);
      const variance = fitnessScores.reduce((sum, f) => sum + Math.pow(f - avgFitness, 2), 0) / fitnessScores.length;
      const stdDev = Math.sqrt(variance);
      const diversity = computePopulationDiversity(updatedPop);

      generationStats.push({ gen, avgFitness, maxFitness, diversity, fitnessStdDev: stdDev });

      await storage.updateGeneration(genRecord.id, {
        status: "completed",
        avgFitness: avgFitness.toFixed(6),
        maxFitness: maxFitness.toFixed(6),
        minFitness: minFitness.toFixed(6),
        fitnessStdDev: stdDev.toFixed(6),
        avgElo: Math.round(updatedPop.reduce((s, g) => s + g.eloRating, 0) / updatedPop.length),
        maxElo: Math.max(...updatedPop.map(g => g.eloRating)),
        diversityScore: diversity.toFixed(6),
        matchIds,
        completedAt: new Date(),
      });

      const transition = detectPhaseTransitions(gen, generationStats);
      if (transition) {
        transitions.push(transition);
        await storage.updateEvolutionRun(runId, { phaseTransitions: transitions });
        log(`[evolution] Phase transition detected at gen ${gen}: ${transition.type} - ${transition.evidence}`, "evolution");
      }

      await storage.updateEvolutionRun(runId, { currentGeneration: gen + 1 });

      if (gen < config.totalGenerations - 1 && activeRuns.get(runId)) {
        const nextGenPopulation = await produceNextGeneration(
          runId, gen, updatedPop, config
        );
        log(`[evolution] Gen ${gen} complete. Next gen has ${nextGenPopulation.length} genomes. Best Elo: ${Math.max(...updatedPop.map(g => g.eloRating))}`, "evolution");
      }
    }

    if (allMatchIds.length > 0) {
      const finalCost = await storage.getCumulativeCost(allMatchIds);
      await storage.updateEvolutionRun(runId, { actualCostUsd: finalCost.toFixed(6) });
    }

    const finalRun = await storage.getEvolutionRun(runId);
    if (finalRun && finalRun.status === "running") {
      await storage.updateEvolutionRun(runId, {
        status: "completed",
        completedAt: new Date(),
      });
    }

    log(`[evolution] Run ${runId} finished`, "evolution");
  } catch (err) {
    log(`[evolution] Run ${runId} error: ${err}`, "evolution");
    await storage.updateEvolutionRun(runId, { status: "failed" });
  } finally {
    activeRuns.delete(runId);
  }
}

async function produceNextGeneration(
  runId: number,
  currentGen: number,
  population: StrategyGenome[],
  config: EvolutionConfig
): Promise<StrategyGenome[]> {
  const nextGen = currentGen + 1;
  const sorted = [...population].sort((a, b) => computeFitness(b) - computeFitness(a));

  const newGenomes: StrategyGenome[] = [];

  for (let i = 0; i < config.elitismCount && i < sorted.length; i++) {
    const elite = sorted[i];
    const created = await storage.createStrategyGenome({
      evolutionRunId: runId,
      generationNumber: nextGen,
      parentIds: [elite.id],
      modules: elite.modules as GenomeModules,
      eloRating: elite.eloRating,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      lineageTag: elite.lineageTag || `elite-${i}`,
      mutationLog: "Elite carry-forward",
    });
    newGenomes.push(created);
  }

  while (newGenomes.length < config.populationSize) {
    if (Math.random() < config.crossoverRate) {
      const parentA = tournamentSelect(population);
      const parentB = tournamentSelect(population);
      let childModules = crossoverModules(
        parentA.modules as GenomeModules,
        parentB.modules as GenomeModules
      );

      let mutationLog = `Crossover of genome ${parentA.id} and ${parentB.id}`;

      if (Math.random() < config.mutationRate) {
        const { mutated, log: mLog } = mutateModules(childModules);
        childModules = mutated;
        mutationLog += `. Mutation: ${mLog}`;
      }

      const created = await storage.createStrategyGenome({
        evolutionRunId: runId,
        generationNumber: nextGen,
        parentIds: [parentA.id, parentB.id],
        modules: childModules,
        eloRating: Math.round((parentA.eloRating + parentB.eloRating) / 2),
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        lineageTag: `cross-g${nextGen}-${newGenomes.length}`,
        mutationLog,
      });
      newGenomes.push(created);
    } else {
      const parent = tournamentSelect(population);
      const { mutated, log: mLog } = mutateModules(parent.modules as GenomeModules);

      const created = await storage.createStrategyGenome({
        evolutionRunId: runId,
        generationNumber: nextGen,
        parentIds: [parent.id],
        modules: mutated,
        eloRating: parent.eloRating,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        lineageTag: `mutant-g${nextGen}-${newGenomes.length}`,
        mutationLog: `Mutation of genome ${parent.id}: ${mLog}`,
      });
      newGenomes.push(created);
    }
  }

  return newGenomes;
}

const MUTATION_VARIANTS: Record<keyof GenomeModules, string[]> = {
  cluePhilosophy: [
    "Shift to using more antonyms and contrasting ideas rather than direct associations.",
    "Emphasize multi-layered clues where each word has both a surface and hidden meaning.",
    "Use temporal and sequential associations—think about what comes before, after, or alongside the keyword.",
    "Focus on structural and spatial associations—think about shape, size, position, or arrangement.",
  ],
  opponentModeling: [
    "Adopt a counter-adaptive stance: assume opponents are modeling you and add an extra layer of deception.",
    "Use probabilistic reasoning—assign likelihoods to opponent keyword guesses and optimize accordingly.",
    "Mirror opponent behavior initially then diverge unpredictably in later rounds.",
    "Ignore opponent modeling entirely and focus on pure communication efficiency with your team.",
  ],
  riskTolerance: [
    "Adopt an all-or-nothing approach: very safe clues OR very risky clues, nothing in between.",
    "Risk tolerance should scale inversely with round number—riskier early, safer late.",
    "Match opponent's apparent risk level—if they play safe, you play safe; if they're aggressive, match them.",
    "Use game theory mixed strategy: randomly choose between safe and risky options with fixed probability.",
  ],
  memoryPolicy: [
    "Use sliding window memory: only consider the last 3 rounds, discard older history entirely.",
    "Maintain a compressed summary of all rounds rather than detailed per-round memory.",
    "Weight recent rounds exponentially more than earlier rounds in decision-making.",
    "Use opponent-focused memory: primarily remember opponent behaviors and outcomes, minimize self-focus.",
  ],
};

function mutateModules(modules: GenomeModules): { mutated: GenomeModules; log: string } {
  const keys: (keyof GenomeModules)[] = ["cluePhilosophy", "opponentModeling", "riskTolerance", "memoryPolicy"];
  const targetKey = keys[Math.floor(Math.random() * keys.length)];
  const variants = MUTATION_VARIANTS[targetKey];
  const newValue = variants[Math.floor(Math.random() * variants.length)];

  return {
    mutated: { ...modules, [targetKey]: newValue },
    log: `${targetKey} mutated`,
  };
}
