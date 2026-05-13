import { readFileSync, writeFileSync } from 'fs';

import {
  VrpProblem,
  LocationNode,
  Customer,
  CustomerWithTimeWindows,
  Vehicle,
  VrpRpdSolver,
} from './index.js';

interface ProblemJson {
  nodes: Array<{ id: number; x: number; y: number; name?: string }>;
  customers: Array<{
    id: number;
    deliveryNodeId: number;
    pickupNodeId: number;
    processingTime: number;
    earliestDeliveryTime?: number;
    latestDeliveryTime?: number;
    earliestPickupTime?: number;
    latestPickupTime?: number;
  }>;
  vehicles: Array<{
    id: number;
    capacity: number;
    startDepotId?: number;
    endDepotId?: number;
    costPerKm?: number;
    co2PerKm?: number;
  }>;
  depotNodeId?: number;
}

function parseProblem(data: ProblemJson): VrpProblem {
  const nodes: Record<number, LocationNode> = {};
  for (const n of data.nodes) {
    nodes[n.id] = new LocationNode(n.id, n.x, n.y, n.name ?? '');
  }

  const customers = data.customers.map(c => {
    if (
      c.earliestDeliveryTime !== undefined &&
      c.latestDeliveryTime !== undefined &&
      c.earliestPickupTime !== undefined &&
      c.latestPickupTime !== undefined
    ) {
      return new CustomerWithTimeWindows(
        c.id,
        c.deliveryNodeId,
        c.pickupNodeId,
        c.processingTime,
        c.earliestDeliveryTime,
        c.latestDeliveryTime,
        c.earliestPickupTime,
        c.latestPickupTime,
      );
    }
    return new Customer(c.id, c.deliveryNodeId, c.pickupNodeId, c.processingTime);
  });

  const vehicles = data.vehicles.map(
    v =>
      new Vehicle(
        v.id,
        v.capacity,
        v.startDepotId ?? data.depotNodeId ?? 0,
        v.endDepotId ?? data.depotNodeId ?? 0,
        v.costPerKm ?? 1,
        v.co2PerKm ?? 1,
      ),
  );

  return new VrpProblem(nodes, customers, vehicles, data.depotNodeId ?? 0);
}

function usage(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage: vrp-solver [options]

Options:
  --problem <file>          Path to problem JSON file (required)
  --output <file>             Path to write solution JSON (default: stdout)
  --alns-iterations <n>       ALNS iterations (default: 500)
  --population-size <n>       BRKGA population size (default: 30000)
  --max-generations <n>       BRKGA max generations (default: 20000)
  --max-time <ms>             Max solver time in milliseconds (default: 0 = unlimited)
  --target-makespan <n>       Target makespan for early stopping (default: 0)
  --parallel                  Run ALNS and BRKGA in parallel
  --no-warm-start             Disable ALNS warm-start for BRKGA
  --progress                  Print progress to stderr
  --help                      Show this help message
`);
}

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg) continue;
    if (arg === '--help') {
      args['help'] = true;
    } else if (arg === '--progress') {
      args['progress'] = true;
    } else if (arg === '--parallel') {
      args['parallel'] = true;
    } else if (arg === '--no-warm-start') {
      args['warmStart'] = false;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '');
      const next = process.argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args['help']) {
    usage();
    process.exit(0);
  }

  if (!args['problem'] || typeof args['problem'] !== 'string') {
    console.error('Error: --problem <file> is required');
    usage();
    process.exit(1);
  }

  const problemJson = JSON.parse(readFileSync(args['problem'], 'utf-8')) as ProblemJson;
  const problem = parseProblem(problemJson);

  const solver = new VrpRpdSolver(problem);

  const options: Parameters<typeof solver.solve>[0] = {
    alnsIterations: args['alnsiterations'] ? Number(args['alnsiterations']) : undefined,
    populationSize: args['populationsize'] ? Number(args['populationsize']) : undefined,
    maxGenerations: args['maxgenerations'] ? Number(args['maxgenerations']) : undefined,
    maxTimeMs: args['maxtime'] ? Number(args['maxtime']) : undefined,
    targetMakespan: args['targetmakespan'] ? Number(args['targetmakespan']) : undefined,
    parallel: args['parallel'] === true,
    warmStart: args['warmstart'] !== false,
    onProgress:
      args['progress'] === true
        ? (progress) => {
            const pct = ((progress.iteration / progress.maxIterations) * 100).toFixed(1);
            console.error(
              `[${progress.stage}] Gen ${progress.iteration}/${progress.maxIterations} (${pct}%) best=${progress.bestMakespan.toFixed(2)} elapsed=${progress.elapsedMs}ms`,
            );
          }
        : undefined,
  };

  const startTime = Date.now();
  const solution = await solver.solve(options);
  const elapsed = Date.now() - startTime;

  const output = {
    makespan: solution.makespan,
    totalDistance: solution.totalDistance,
    totalCost: solution.totalCost,
    totalCO2: solution.totalCO2,
    feasible: solution.isFeasible(),
    routes: solution.routes.map(r => ({
      vehicleId: r.vehicleId,
      nodes: r.nodes,
    })),
    nodeTimes: solution.nodeTimes,
    elapsedMs: elapsed,
  };

  const json = JSON.stringify(output, null, 2);

  if (args['output'] && typeof args['output'] === 'string') {
    writeFileSync(args['output'], json);
    console.error(`Solution written to ${args['output']}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(json);
  }
}

main().catch((err: unknown) => {
  console.error('Solver failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
