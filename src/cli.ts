import { readFileSync, writeFileSync, existsSync } from 'fs';

import {
  VrpProblem,
  LocationNode,
  Customer,
  CustomerWithTimeWindows,
  Vehicle,
  VrpRpdSolver,
  ValidationError,
} from './index.js';

const VERSION = '1.0.0';

function parseProblem(data: unknown): VrpProblem {
  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('Problem must be a JSON object');
  }
  if (!('nodes' in data) || !Array.isArray(data.nodes)) {
    throw new ValidationError('Problem must have a "nodes" array');
  }
  if (!('customers' in data) || !Array.isArray(data.customers)) {
    throw new ValidationError('Problem must have a "customers" array');
  }
  if (!('vehicles' in data) || !Array.isArray(data.vehicles)) {
    throw new ValidationError('Problem must have a "vehicles" array');
  }

  const nodesRaw: unknown[] = data.nodes;
  const customersRaw: unknown[] = data.customers;
  const vehiclesRaw: unknown[] = data.vehicles;

  if (nodesRaw.length === 0) throw new ValidationError('Problem must have at least one node');
  if (customersRaw.length === 0) {
    throw new ValidationError('Problem must have at least one customer');
  }
  if (vehiclesRaw.length === 0) {
    throw new ValidationError('Problem must have at least one vehicle');
  }

  const nodes: Record<number, LocationNode> = {};
  for (const nodeRaw of nodesRaw) {
    if (typeof nodeRaw !== 'object' || nodeRaw === null) {
      throw new ValidationError(`Node must be an object: ${JSON.stringify(nodeRaw)}`);
    }
    if (!('id' in nodeRaw) || typeof nodeRaw.id !== 'number') {
      throw new ValidationError(`Node missing numeric id: ${JSON.stringify(nodeRaw)}`);
    }
    if (!('x' in nodeRaw) || typeof nodeRaw.x !== 'number') {
      throw new ValidationError(`Node ${nodeRaw.id} missing numeric x coordinate`);
    }
    if (!('y' in nodeRaw) || typeof nodeRaw.y !== 'number') {
      throw new ValidationError(`Node ${nodeRaw.id} missing numeric y coordinate`);
    }
    const name = 'name' in nodeRaw && typeof nodeRaw.name === 'string' ? nodeRaw.name : undefined;
    nodes[nodeRaw.id] = new LocationNode(nodeRaw.id, nodeRaw.x, nodeRaw.y, name);
  }

  const customers: Customer[] = customersRaw.map(c => {
    if (typeof c !== 'object' || c === null) {
      throw new ValidationError(`Customer must be an object: ${JSON.stringify(c)}`);
    }
    if (!('id' in c) || typeof c.id !== 'number') {
      throw new ValidationError(`Customer missing numeric id: ${JSON.stringify(c)}`);
    }
    if (!('deliveryNodeId' in c) || typeof c.deliveryNodeId !== 'number') {
      throw new ValidationError(`Customer ${c.id} missing numeric deliveryNodeId`);
    }
    if (!('pickupNodeId' in c) || typeof c.pickupNodeId !== 'number') {
      throw new ValidationError(`Customer ${c.id} missing numeric pickupNodeId`);
    }
    if (!('processingTime' in c) || typeof c.processingTime !== 'number') {
      throw new ValidationError(`Customer ${c.id} missing numeric processingTime`);
    }
    if (
      'earliestDeliveryTime' in c && typeof c.earliestDeliveryTime === 'number' &&
      'latestDeliveryTime' in c && typeof c.latestDeliveryTime === 'number' &&
      'earliestPickupTime' in c && typeof c.earliestPickupTime === 'number' &&
      'latestPickupTime' in c && typeof c.latestPickupTime === 'number'
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

  const depotNodeId = 'depotNodeId' in data && typeof data.depotNodeId === 'number'
    ? data.depotNodeId
    : 0;

  const vehicles: Vehicle[] = vehiclesRaw.map(v => {
    if (typeof v !== 'object' || v === null) {
      throw new ValidationError(`Vehicle must be an object: ${JSON.stringify(v)}`);
    }
    if (!('id' in v) || typeof v.id !== 'number') {
      throw new ValidationError(`Vehicle missing numeric id: ${JSON.stringify(v)}`);
    }
    if (!('capacity' in v) || typeof v.capacity !== 'number') {
      throw new ValidationError(`Vehicle ${v.id} missing numeric capacity`);
    }
    const startDepotId = 'startDepotId' in v && typeof v.startDepotId === 'number'
      ? v.startDepotId
      : depotNodeId;
    const endDepotId = 'endDepotId' in v && typeof v.endDepotId === 'number'
      ? v.endDepotId
      : depotNodeId;
    const costPerKm = 'costPerKm' in v && typeof v.costPerKm === 'number' ? v.costPerKm : 1;
    const co2PerKm = 'co2PerKm' in v && typeof v.co2PerKm === 'number' ? v.co2PerKm : 1;
    return new Vehicle(v.id, v.capacity, startDepotId, endDepotId, costPerKm, co2PerKm);
  });

  return new VrpProblem(nodes, customers, vehicles, depotNodeId);
}

function usage(): void {
  console.log(`vrp-solver v${VERSION} — Route optimization for delivery fleets

Usage: vrp-solver [options]

Required:
  --problem <file>          Path to problem JSON file

Output:
  --output <file>           Write solution JSON (default: stdout)

Algorithm:
  --alns-iterations <n>     ALNS iterations (default: 500)
  --population-size <n>     BRKGA population size (default: 30000)
  --max-generations <n>     BRKGA max generations (default: 20000)
  --max-time <ms>           Max solver time, 0 = unlimited (default: 0)
  --target-makespan <n>     Early stopping target (default: 0)
  --parallel                Run ALNS and BRKGA in parallel
  --no-warm-start           Disable ALNS warm-start for BRKGA

Info:
  --progress                Print progress to stderr
  --version                 Print version
  --help                    Show this help message

Examples:
  vrp-solver --problem problem.json --output solution.json
  vrp-solver --problem problem.json --max-time 30000 --progress
`);
}

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg) continue;
    if (arg === '--help' || arg === '-h') {
      args['help'] = true;
    } else if (arg === '--version' || arg === '-v') {
      args['version'] = true;
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

  if (args['version']) {
    console.log(VERSION);
    process.exit(0);
  }

  const problemArg = args['problem'];
  if (!problemArg || typeof problemArg !== 'string') {
    console.error('Error: --problem <file> is required');
    console.error('Run vrp-solver --help for usage information');
    process.exit(1);
  }

  const problemPath: string = problemArg;
  if (!existsSync(problemPath)) {
    console.error(`Error: File not found: ${problemPath}`);
    process.exit(1);
  }

  let problem: VrpProblem;
  try {
    const raw = readFileSync(problemPath, 'utf-8');
    problem = parseProblem(JSON.parse(raw));
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      console.error(`Error: Invalid JSON in ${problemPath}: ${err.message}`);
    } else if (err instanceof ValidationError) {
      console.error(`Error: Invalid problem: ${err.message}`);
    } else {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Error: Could not read ${problemPath}: ${errorMsg}`);
    }
    process.exit(1);
  }

  console.error(
    `Problem: ${problem.customers.length} customers, ${problem.vehicles.length} vehicles`,
  );
  console.error('Starting solver...');

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
              `[${progress.stage}] Gen ${progress.iteration}/${progress.maxIterations} ` +
              `(${pct}%) best=${progress.bestMakespan.toFixed(2)} elapsed=${progress.elapsedMs}ms`,
            );
          }
        : undefined,
  };

  const startTime = Date.now();
  let solution;
  try {
    solution = await solver.solve(options);
  } catch (err: unknown) {
    console.error(`Solver error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const elapsed = Date.now() - startTime;

  console.error(`Solved in ${(elapsed / 1000).toFixed(1)}s`);
  console.error(`Makespan: ${solution.makespan.toFixed(2)}, Feasible: ${solution.isFeasible()}`);

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
    console.log(json);
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
