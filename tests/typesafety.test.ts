import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { InsertionOperators } from '../src/algorithms/alns/operators.js';
import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { RouteAnalytics } from '../src/analytics/RouteAnalytics.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';
import { TransferHub } from '../src/core/ResourceTransfer.js';
import { VrpSolution, Route } from '../src/core/Solution.js';
import { ProblemWithTransfers } from '../src/core/SolutionWithTransfers.js';
import { VehicleWithCapabilities, VehicleFleetManager } from '../src/core/VehicleWithCapabilities.js';
import { GISExporter } from '../src/export/GISExporter.js';

// ============================================================
// T1: ResourceType is a closed union
// ============================================================
describe('T1 - ResourceType closed union', () => {
  test('known resource types are accepted by canHandleResource', () => {
    const v = new VehicleWithCapabilities(1, 10, ['standard', 'refrigerated']);

    expect(v.canHandleResource('standard')).toBe(true);
    expect(v.canHandleResource('refrigerated')).toBe(true);
    expect(v.canHandleResource('hazmat')).toBe(false);
    expect(v.canHandleResource('fragile')).toBe(false);
  });

  test('fleet manager filters by literal resource type', () => {
    const v1 = new VehicleWithCapabilities(1, 10, ['refrigerated']);
    const v2 = new VehicleWithCapabilities(2, 10, ['standard']);
    const fleet = new VehicleFleetManager([v1, v2]);

    const refrigeratedVehicles = fleet.getVehiclesForResourceType('refrigerated');
    expect(refrigeratedVehicles.length).toBe(1);
    expect(refrigeratedVehicles[0]?.id).toBe(1);
  });

  test('loadByType accepts literal resource types', () => {
    const v = new VehicleWithCapabilities(1, 10, ['refrigerated']);
    const fleet = new VehicleFleetManager([v]);

    // Start with load 2, then deliver 1 (loadChange = -1)
    fleet.updateVehicleState(1, 1, 'delivery', 10, 2, 'refrigerated');
    fleet.updateVehicleState(1, 2, 'pickup', 20, -1, 'refrigerated');
    const state = fleet.getVehicleState(1);

    expect(state).toBeDefined();
    expect(state?.loadByType.get('refrigerated')).toBe(1);
  });
});

// ============================================================
// T3: nodeTimes string keys accessed without as-unknown-as-number
// ============================================================
describe('T3 - nodeTimes string key access', () => {
  test('RouteAnalytics reads depot_return string keys', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const analytics = new RouteAnalytics(solution, problem);
    const util = analytics.getVehicleUtilization();
    expect(util.length).toBe(1);
    // totalTime should be read from the string key `depot_return_0`
    expect(util[0]?.totalTime).toBeGreaterThanOrEqual(0);
  });

  test('GISExporter reads depot_return string keys for GeoJSON', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const geojson = exporter.toGeoJSON();

    const routeFeature = geojson.features.find(f => f.properties['type'] === 'route');
    expect(routeFeature).toBeDefined();
    expect(typeof routeFeature?.properties['makespan']).toBe('number');
    expect(routeFeature?.properties['makespan']).toBeGreaterThanOrEqual(0);
  });

  test('GISExporter reads depot_return string keys for CSV', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const csv = exporter.toCSV();

    // CSV should include a depot_return row with a valid arrival time
    const lines = csv.split('\n').filter(l => l.includes('depot_return'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const cols = line.split(',');
      const arrivalTime = Number(cols[6]);
      expect(Number.isFinite(arrivalTime)).toBe(true);
      expect(arrivalTime).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================
// T4: ProblemWithTransfers uses top-level Node import
// ============================================================
describe('T4 - ProblemWithTransfers constructor accepts Node records', () => {
  test('constructs with typed node record', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      5: new LocationNode(5, 10, 10, 'Hub'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new VehicleWithCapabilities(0, 10, ['standard'])];
    const hubs = [new TransferHub(5, 10, 10, 'Hub', 2, 1)];

    const problem = new ProblemWithTransfers(nodes, customers, vehicles, 0, hubs);
    expect(problem.nodes[0].name).toBe('Depot');
    expect(problem.isTransferHub(5)).toBe(true);
    expect(problem.isTransferHub(1)).toBe(false);
  });
});

// ============================================================
// T5: Safe array access patterns (no unchecked indexed access crashes)
// ============================================================
describe('T5 - Safe indexed access in algorithms', () => {
  test('ALNS selectOperator handles all-zero weights without crash', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const solver = new ALNS(problem, { maxIterations: 2 });

    // Access protected method via type assertion for testing
    const idx = (solver as unknown as { selectOperator: (weights: number[]) => number }).selectOperator([0, 0, 0]);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThanOrEqual(2);
  });

  test('BRKGA returns complete solution even with tiny population', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const brkga = new BRKGA(problem, { populationSize: 3, maxGenerations: 3 });
    const solution = brkga.solve();

    expect(solution.isComplete()).toBe(true);
    expect(solution.isFeasible()).toBe(true);
  });

  test('regret insertion handles single route without infinite loop', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(
      nodes,
      [new Customer(1, 1, 2, 50)],
      [new Vehicle(1, 10)],
      0,
    );

    const empty = new VrpSolution(problem, [new Route(1, [])]);
    const start = Date.now();
    const solution = InsertionOperators.regret2Insertion(empty, problem.customers);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(solution.isComplete()).toBe(true);
  });
});
