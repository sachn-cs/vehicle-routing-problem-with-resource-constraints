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
import { expect } from 'chai';

// ============================================================
// T1: ResourceType is a closed union
// ============================================================
describe('T1 - ResourceType closed union', () => {
  it('known resource types are accepted by canHandleResource', () => {
    const v = new VehicleWithCapabilities(1, 10, ['standard', 'refrigerated']);

    expect(v.canHandleResource('standard')).to.be.true;
    expect(v.canHandleResource('refrigerated')).to.be.true;
    expect(v.canHandleResource('hazmat')).to.be.false;
    expect(v.canHandleResource('fragile')).to.be.false;
  });

  it('fleet manager filters by literal resource type', () => {
    const v1 = new VehicleWithCapabilities(1, 10, ['refrigerated']);
    const v2 = new VehicleWithCapabilities(2, 10, ['standard']);
    const fleet = new VehicleFleetManager([v1, v2]);

    const refrigeratedVehicles = fleet.getVehiclesForResourceType('refrigerated');
    expect(refrigeratedVehicles.length).to.equal(1);
    expect(refrigeratedVehicles[0]?.id).to.equal(1);
  });

  it('loadByType accepts literal resource types', () => {
    const v = new VehicleWithCapabilities(1, 10, ['refrigerated']);
    const fleet = new VehicleFleetManager([v]);

    // Start with load 2, then deliver 1 (loadChange = -1)
    fleet.updateVehicleState(1, 1, 'delivery', 10, 2, 'refrigerated');
    fleet.updateVehicleState(1, 2, 'pickup', 20, -1, 'refrigerated');
    const state = fleet.getVehicleState(1);

    expect(state).to.exist;
    expect(state?.loadByType.get('refrigerated')).to.equal(1);
  });
});

// ============================================================
// T3: nodeTimes string keys accessed without as-unknown-as-number
// ============================================================
describe('T3 - nodeTimes string key access', () => {
  it('RouteAnalytics reads depot_return string keys', () => {
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
    expect(util.length).to.equal(1);
    // totalTime should be read from the string key `depot_return_0`
    expect(util[0]?.totalTime).to.be.at.least(0);
  });

  it('GISExporter reads depot_return string keys for GeoJSON', () => {
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
    expect(routeFeature).to.exist;
    expect(typeof routeFeature?.properties['makespan']).to.equal('number');
    expect(routeFeature?.properties['makespan']).to.be.at.least(0);
  });

  it('GISExporter reads depot_return string keys for CSV', () => {
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
    expect(lines.length).to.be.greaterThan(0);
    for (const line of lines) {
      const cols = line.split(',');
      const arrivalTime = Number(cols[6]);
      expect(Number.isFinite(arrivalTime)).to.be.true;
      expect(arrivalTime).to.be.at.least(0);
    }
  });
});

// ============================================================
// T4: ProblemWithTransfers uses top-level Node import
// ============================================================
describe('T4 - ProblemWithTransfers constructor accepts Node records', () => {
  it('constructs with typed node record', () => {
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
    expect(problem.nodes[0].name).to.equal('Depot');
    expect(problem.isTransferHub(5)).to.be.true;
    expect(problem.isTransferHub(1)).to.be.false;
  });
});

// ============================================================
// T5: Safe array access patterns (no unchecked indexed access crashes)
// ============================================================
describe('T5 - Safe indexed access in algorithms', () => {
  it('ALNS selectOperator handles all-zero weights without crash', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const solver = new ALNS(problem, { maxIterations: 2 });

    // Access protected method via type assertion for testing
    const idx = (solver as unknown as { selectOperator: (weights: number[]) => number }).selectOperator([0, 0, 0]);
    expect(idx).to.be.at.least(0);
    expect(idx).to.be.at.most(2);
  });

  it('BRKGA returns complete solution even with tiny population', () => {
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

    expect(solution.isComplete()).to.be.true;
    expect(solution.isFeasible()).to.be.true;
  });

  it('regret insertion handles single route without infinite loop', () => {
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

    expect(elapsed).to.be.lessThan(2000);
    expect(solution.isComplete()).to.be.true;
  });
});
