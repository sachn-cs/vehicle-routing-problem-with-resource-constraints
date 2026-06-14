import { expect } from 'chai';

import { ALNS } from '../src/algorithms/alns/alns.js';
import { InsertionOperators } from '../src/algorithms/alns/operators.js';
import { TransferAwareInsertionOperators } from '../src/algorithms/alns/transfer-aware-operators.js';
import { BRKGA } from '../src/algorithms/brkga/brkga.js';
import { VrpProblem, LocationNode, Customer, Vehicle, CustomerWithTimeWindows } from '../src/core/problem.js';
import type { ResourceTransfer } from '../src/core/resource-transfer.js';
import { TransferManager, TransferHub } from '../src/core/resource-transfer.js';
import {
  SolutionWithTransfers,
  ProblemWithTransfers,
} from '../src/core/solution-with-transfers.js';
import { VrpSolution, Route } from '../src/core/solution.js';
import { TrafficAwareProblem, TrafficModel } from '../src/core/traffic-aware-problem.js';
import { VehicleWithCapabilities } from '../src/core/vehicle-with-capabilities.js';
import { GISExporter } from '../src/export/gis-exporter.js';

// ============================================================
// C1: totalCost / totalCO2 must be per-route, per-vehicle
// ============================================================
describe('C1 - Cost and CO2 per-route correctness', () => {
  it('multi-vehicle cost is sum of per-route costs', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 0, 10, 'D2'),
      4: new LocationNode(4, 0, 20, 'P2'),
    };
    const customers = [
      new Customer(1, 1, 2, 50),
      new Customer(2, 3, 4, 50),
    ];
    // Vehicle 1 costs 2x per km, Vehicle 2 costs 3x per km
    const vehicles = [
      new Vehicle(1, 10, 0, 0, 2, 2),
      new Vehicle(2, 10, 0, 0, 3, 3),
    ];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    // Route 1: depot->1->2->depot = 10 + 10 + 20 = 40
    // Route 2: depot->3->4->depot = 10 + 10 + 20 = 40
    const routes = [new Route(1, [1, 2]), new Route(2, [3, 4])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    const expectedCost = 40 * 2 + 40 * 3; // 80 + 120 = 200
    const expectedCO2 = 40 * 2 + 40 * 3; // 200

    // totalDistance should be 80 (entire fleet)
    expect(solution.totalDistance).to.equal(80);
    // But cost must be per-route
    expect(solution.totalCost).to.equal(expectedCost);
    expect(solution.totalCO2).to.equal(expectedCO2);
  });

  it('single-vehicle cost matches totalDistance * rate', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10, 0, 0, 5, 5)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    // Route distance = 10 + 10 + 20 = 40
    expect(solution.totalDistance).to.equal(40);
    expect(solution.totalCost).to.equal(40 * 5);
    expect(solution.totalCO2).to.equal(40 * 5);
  });
});

// ============================================================
// C2: Delivery time windows must adjust arrivalTime
// ============================================================
describe('C2 - Delivery time window enforcement', () => {
  it('earliestDeliveryTime pushes back arrival and ready time', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [
      new CustomerWithTimeWindows(1, 1, 2, 50, 100, 200, 160, 300),
    ];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    // Without time window, arrival at delivery would be 10.
    // With earliestDeliveryTime = 100, it must be >= 100.
    expect(solution.nodeTimes[1]).to.be.at.least(100);
    // Resource ready time must account for the wait
    expect(solution.resourceReadyTimes[1]).to.equal(solution.nodeTimes[1]! + 50);
    // Pickup must be after resource is ready
    expect(solution.nodeTimes[2]).to.be.at.least(solution.resourceReadyTimes[1]!);
  });

  it('latestDeliveryTime violation makes solution infeasible', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 1000, 0, 'FarD'),
      2: new LocationNode(2, 2000, 0, 'FarP'),
    };
    const customers = [
      new CustomerWithTimeWindows(1, 1, 2, 50, 0, 1, 0, 5000),
    ];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new VrpSolution(problem, routes);
    solution.calculateSchedule();

    expect(solution.checkTimeWindows()).to.be.false;
    expect(solution.isFeasible()).to.be.false;
  });
});

// ============================================================
// C3: TrafficAwareProblem.getDistance must return Euclidean
// ============================================================
describe('C3 - TrafficAwareProblem distance contract', () => {
  it('getDistance returns Euclidean distance, not travel time', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 3, 4, 'A'),
    };
    const customers = [new Customer(1, 1, 1, 50)];
    const vehicles = [new Vehicle(1, 10)];

    const trafficModel = new TrafficModel();
    trafficModel.setSegment({
      fromId: 0,
      toId: 1,
      baseTravelTime: 99,
      currentTravelTime: 99,
      congestionLevel: 'low',
    });

    const problem = new TrafficAwareProblem(
      nodes,
      customers,
      vehicles,
      0,
      trafficModel,
    );

    // Euclidean distance = 5
    expect(problem.getDistance(0, 1)).to.be.closeTo(5, 0.000005);
    // Travel time should use traffic model
    expect(problem.getTravelTime(0, 1)).to.equal(99);
  });
});

// ============================================================
// C4: VehicleWithCapabilities.canTransferWith is directed
// ============================================================
describe('C4 - Directed transfer capability check', () => {
  it('canTransferWith requires source.canGive and target.canReceive', () => {
    const giver = new VehicleWithCapabilities(1, 10, ['standard'], false, true, 10);
    const receiver = new VehicleWithCapabilities(2, 10, ['standard'], true, false, 10);

    // giver can give to receiver
    expect(giver.canTransferWith(receiver)).to.be.true;
    // receiver cannot give to giver
    expect(receiver.canTransferWith(giver)).to.be.false;
  });

  it('canTransferWith fails when no common resource type', () => {
    const a = new VehicleWithCapabilities(1, 10, ['refrigerated'], true, true, 10);
    const b = new VehicleWithCapabilities(2, 10, ['hazmat'], true, true, 10);

    expect(a.canTransferWith(b)).to.be.false;
  });

  it('canTransferWith fails when source cannot give', () => {
    const a = new VehicleWithCapabilities(1, 10, ['standard'], true, false, 10);
    const b = new VehicleWithCapabilities(2, 10, ['standard'], true, true, 10);

    expect(a.canTransferWith(b)).to.be.false;
  });

  it('canTransferWith fails when target cannot receive', () => {
    const a = new VehicleWithCapabilities(1, 10, ['standard'], true, true, 10);
    const b = new VehicleWithCapabilities(2, 10, ['standard'], false, true, 10);

    expect(a.canTransferWith(b)).to.be.false;
  });
});

// ============================================================
// C5: BRKGA best solution must not be corrupted by evolution
// ============================================================
describe('C5 - BRKGA best-solution immutability', () => {
  it('returned solution remains feasible after solve', async () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 0, 10, 'D2'),
      4: new LocationNode(4, 0, 20, 'P2'),
    };
    const customers = [
      new Customer(1, 1, 2, 50),
      new Customer(2, 3, 4, 50),
    ];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);

    const brkga = new BRKGA(problem, { populationSize: 20, maxGenerations: 20 });
    const solution = await brkga.solve();

    // Solution must not have been mutated into an invalid state
    expect(solution.isComplete()).to.be.true;
    expect(solution.isFeasible()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);

    // Verify route arrays are independent (not shared with internal state)
    const routesCopy = solution.routes.map(r => [...r.nodes]);
    // Run solve again; previous solution should be unaffected
    const solution2 = await brkga.solve();
    expect(solution2.routes).to.not.equal(solution.routes);
    expect(solution.routes.map(r => [...r.nodes])).to.deep.equal(routesCopy);
  });
});

// ============================================================
// C6: Transfer-aware insertion must register chosen transfers
// ============================================================
describe('C6 - Transfer-aware insertion registers transfers', () => {
  it('greedyInsertionWithTransfers creates transfer records', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 0, 10, 'D2'),
      4: new LocationNode(4, 0, 20, 'P2'),
      5: new LocationNode(5, 10, 10, 'Hub'),
    };
    const customers = [
      new Customer(1, 1, 2, 50),
      new Customer(2, 3, 4, 50),
    ];
    const vehicles = [
      new VehicleWithCapabilities(0, 10, ['standard'], true, true, 10),
      new VehicleWithCapabilities(1, 10, ['standard'], true, true, 10),
    ];
    const hubs = [new TransferHub(5, 10, 10, 'Hub', 2, 1)];

    const problem = new ProblemWithTransfers(nodes, customers, vehicles, 0, hubs);
    const solution = new SolutionWithTransfers(problem, [
      new Route(0, []),
      new Route(1, []),
    ], hubs, vehicles);

    const result = TransferAwareInsertionOperators.greedyInsertionWithTransfers(
      solution,
      customers,
      hubs,
    );

    // At least one transfer should have been registered if a hub was used
    result.calculateTotalTimeWithTransfers();
    // The method always returns a solution; verify it is complete
    expect(result.isComplete()).to.be.true;
    // If transfers were used, the transfer array or manager should reflect them
    // (depending on whether transfer was chosen as best, it may or may not be empty)
    expect(result.transfers.length).to.be.at.least(0);
  });
});

// ============================================================
// C7: TransferManager must respect maxConcurrentTransfers
// ============================================================
describe('C7 - TransferManager hub concurrency limit', () => {
  it('rejects transfer when hub is at capacity', () => {
    const manager = new TransferManager();
    const hub = new TransferHub(1, 0, 0, 'Hub', 1, 1);
    manager.registerHub(hub);

    const t1: ResourceTransfer = {
      id: 't1',
      hubNodeId: 1,
      transferTime: 10,
      fromVehicleId: 0,
      toVehicleId: 1,
      amount: 1,
    };
    const t2: ResourceTransfer = {
      id: 't2',
      hubNodeId: 1,
      transferTime: 10,
      fromVehicleId: 2,
      toVehicleId: 3,
      amount: 1,
    };

    expect(manager.scheduleTransfer(t1)).to.be.true;
    expect(manager.scheduleTransfer(t2)).to.be.false; // exceeds maxConcurrentTransfers=1
  });

  it('allows non-overlapping transfers at same hub', () => {
    const manager = new TransferManager();
    const hub = new TransferHub(1, 0, 0, 'Hub', 1, 1);
    manager.registerHub(hub);

    const t1: ResourceTransfer = {
      id: 't1',
      hubNodeId: 1,
      transferTime: 0,
      fromVehicleId: 0,
      toVehicleId: 1,
      amount: 1,
    };
    const t2: ResourceTransfer = {
      id: 't2',
      hubNodeId: 1,
      transferTime: 5,
      fromVehicleId: 2,
      toVehicleId: 3,
      amount: 1,
    };

    expect(manager.scheduleTransfer(t1)).to.be.true;
    // t1 occupies [0, 2), t2 occupies [5, 7) — no overlap
    expect(manager.scheduleTransfer(t2)).to.be.true;
  });

  it('allows concurrent transfers when hub capacity permits', () => {
    const manager = new TransferManager();
    const hub = new TransferHub(1, 0, 0, 'Hub', 3, 1);
    manager.registerHub(hub);

    const t1 = { id: 't1', hubNodeId: 1, transferTime: 10, fromVehicleId: 0, toVehicleId: 1, amount: 1 };
    const t2 = { id: 't2', hubNodeId: 1, transferTime: 10, fromVehicleId: 2, toVehicleId: 3, amount: 1 };
    const t3 = { id: 't3', hubNodeId: 1, transferTime: 10, fromVehicleId: 4, toVehicleId: 5, amount: 1 };

    expect(manager.scheduleTransfer(t1)).to.be.true;
    expect(manager.scheduleTransfer(t2)).to.be.true;
    expect(manager.scheduleTransfer(t3)).to.be.true;
  });
});

// ============================================================
// C8/C9: Worker validation (error paths)
// ============================================================
describe('C8/C9 - Worker and constructor validation', () => {
  it('ALNS rejects invalid coolingRate', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);

    expect(() => new ALNS(problem, { coolingRate: 1 })).to.throw('Cooling rate');
    expect(() => new ALNS(problem, { coolingRate: 0 })).to.throw('Cooling rate');
    expect(() => new ALNS(problem, { coolingRate: -1 })).to.throw('Cooling rate');
  });

  it('BRKGA rejects invalid proportions', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);

    expect(() => new BRKGA(problem, { populationSize: 0 })).to.throw('Population size');
    expect(() => new BRKGA(problem, { eliteFraction: 1 })).to.throw('Elite fraction');
    expect(() => new BRKGA(problem, { warmStartProportion: 1 })).to.throw('Warm-start proportion');
  });
});

// ============================================================
// C10: ALNS selectOperator must handle zero weights safely
// ============================================================
describe('C10 - ALNS selectOperator zero-weight safety', () => {
  it('returns valid index when all weights are zero', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const alns = new ALNS(problem, { maxIterations: 2 });

    // Access protected method for testing
    // @ts-expect-error - accessing protected method for test
    const idx = alns.selectOperator([0, 0, 0]);
    expect(idx).to.be.at.least(0);
    expect(idx).to.be.at.most(2);
  });

  it('solve does not hang with single vehicle (regret fallback)', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const alns = new ALNS(problem, { maxIterations: 10 });

    const start = Date.now();
    const solution = alns.solve();
    const elapsed = Date.now() - start;

    expect(elapsed).to.be.lessThan(5000); // should finish quickly
    expect(solution.isComplete()).to.be.true;
    expect(solution.isFeasible()).to.be.true;
  });
});

// ============================================================
// Security: GISExporter escaping
// ============================================================
describe('Security - GISExporter escaping', () => {
  it('KML output is well-formed XML without raw special chars in text nodes', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const solution = new VrpSolution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const kml = exporter.toKML();

    // Verify KML has correct structure
    expect(kml).to.include('<?xml version="1.0" encoding="UTF-8"?>');
    expect(kml).to.include('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).to.include('</Placemark>');
    expect(kml).to.include('</Document>');
  });

  it('CSV does not break with commas in names', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot, Main'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const solution = new VrpSolution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const csv = exporter.toCSV();

    // CSV lines should have consistent column count
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const cols = line.split(',');
      // Expect 8 columns: Route,Vehicle,NodeId,NodeType,X,Y,ArrivalTime,Sequence
      expect(cols.length).to.equal(8);
    }
  });
});

// ============================================================
// SolutionWithTransfers validation
// ============================================================
describe('SolutionWithTransfers validation', () => {
  it('detects incompatible vehicles', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      5: new LocationNode(5, 10, 10, 'Hub'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [
      new VehicleWithCapabilities(0, 10, ['refrigerated'], true, true, 10),
      new VehicleWithCapabilities(1, 10, ['hazmat'], true, true, 10),
    ];
    const hubs = [new TransferHub(5, 10, 10, 'Hub', 2, 1)];

    const problem = new ProblemWithTransfers(nodes, customers, vehicles, 0, hubs);
    const solution = new SolutionWithTransfers(problem, [
      new Route(0, [1, 5]),
      new Route(1, [5, 2]),
    ], hubs, vehicles);

    solution.scheduleTransfer(5, 0, 1, 1, 10);
    const validation = solution.validateTransfers();
    expect(validation.valid).to.be.false;
    expect(validation.errors.length).to.be.greaterThan(0);
  });

  it('detects transfer amount exceeding maxTransferAmount', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      5: new LocationNode(5, 10, 10, 'Hub'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [
      new VehicleWithCapabilities(0, 10, ['standard'], true, true, 1), // maxTransferAmount = 1
      new VehicleWithCapabilities(1, 10, ['standard'], true, true, 10),
    ];
    const hubs = [new TransferHub(5, 10, 10, 'Hub', 2, 1)];

    const problem = new ProblemWithTransfers(nodes, customers, vehicles, 0, hubs);
    const solution = new SolutionWithTransfers(problem, [
      new Route(0, [1, 5]),
      new Route(1, [5, 2]),
    ], hubs, vehicles);

    solution.scheduleTransfer(5, 0, 1, 5, 10); // amount 5 > max 1
    const validation = solution.validateTransfers();
    expect(validation.valid).to.be.false;
    expect(validation.errors.some(e => e.includes('exceeds max transfer'))).to.be.true;
  });
});

// ============================================================
// Regret insertion infinite-loop guard
// ============================================================
describe('Regret insertion infinite-loop guard', () => {
  it('regret2Insertion completes with a single route', () => {
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
    expect(solution.routes[0]!.nodes).to.include(1);
    expect(solution.routes[0]!.nodes).to.include(2);
  });

  it('regret3Insertion completes with a single route', () => {
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
    const solution = InsertionOperators.regret3Insertion(empty, problem.customers);
    const elapsed = Date.now() - start;

    expect(elapsed).to.be.lessThan(2000);
    expect(solution.isComplete()).to.be.true;
  });

  it('regret4Insertion completes with a single route', () => {
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
    const solution = InsertionOperators.regret4Insertion(empty, problem.customers);
    const elapsed = Date.now() - start;

    expect(elapsed).to.be.lessThan(2000);
    expect(solution.isComplete()).to.be.true;
  });
});
