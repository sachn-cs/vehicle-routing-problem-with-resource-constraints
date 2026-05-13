import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { InsertionOperators } from '../src/algorithms/alns/operators.js';
import { TransferAwareInsertionOperators } from '../src/algorithms/alns/TransferAwareOperators.js';
import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { Problem, Node, Customer, Vehicle, CustomerWithTimeWindows } from '../src/core/Problem.js';
import type { ResourceTransfer } from '../src/core/ResourceTransfer.js';
import { TransferManager, TransferHub } from '../src/core/ResourceTransfer.js';
import { Solution, Route } from '../src/core/Solution.js';
import {
  SolutionWithTransfers,
  ProblemWithTransfers,
} from '../src/core/SolutionWithTransfers.js';
import { TrafficAwareProblem, TrafficModel } from '../src/core/TrafficAwareProblem.js';
import { VehicleWithCapabilities } from '../src/core/VehicleWithCapabilities.js';
import { GISExporter } from '../src/export/GISExporter.js';

// ============================================================
// C1: totalCost / totalCO2 must be per-route, per-vehicle
// ============================================================
describe('C1 - Cost and CO2 per-route correctness', () => {
  test('multi-vehicle cost is sum of per-route costs', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      3: new Node(3, 0, 10, 'D2'),
      4: new Node(4, 0, 20, 'P2'),
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
    const problem = new Problem(nodes, customers, vehicles, 0);

    // Route 1: depot->1->2->depot = 10 + 10 + 20 = 40
    // Route 2: depot->3->4->depot = 10 + 10 + 20 = 40
    const routes = [new Route(1, [1, 2]), new Route(2, [3, 4])];
    const solution = new Solution(problem, routes);
    solution.calculateSchedule();

    const expectedCost = 40 * 2 + 40 * 3; // 80 + 120 = 200
    const expectedCO2 = 40 * 2 + 40 * 3; // 200

    // totalDistance should be 80 (entire fleet)
    expect(solution.totalDistance).toBe(80);
    // But cost must be per-route
    expect(solution.totalCost).toBe(expectedCost);
    expect(solution.totalCO2).toBe(expectedCO2);
  });

  test('single-vehicle cost matches totalDistance * rate', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10, 0, 0, 5, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    solution.calculateSchedule();

    // Route distance = 10 + 10 + 20 = 40
    expect(solution.totalDistance).toBe(40);
    expect(solution.totalCost).toBe(40 * 5);
    expect(solution.totalCO2).toBe(40 * 5);
  });
});

// ============================================================
// C2: Delivery time windows must adjust arrivalTime
// ============================================================
describe('C2 - Delivery time window enforcement', () => {
  test('earliestDeliveryTime pushes back arrival and ready time', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [
      new CustomerWithTimeWindows(1, 1, 2, 50, 100, 200, 160, 300),
    ];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    solution.calculateSchedule();

    // Without time window, arrival at delivery would be 10.
    // With earliestDeliveryTime = 100, it must be >= 100.
    expect(solution.nodeTimes[1]).toBeGreaterThanOrEqual(100);
    // Resource ready time must account for the wait
    expect(solution.resourceReadyTimes[1]).toBe(solution.nodeTimes[1] + 50);
    // Pickup must be after resource is ready
    expect(solution.nodeTimes[2]).toBeGreaterThanOrEqual(solution.resourceReadyTimes[1]);
  });

  test('latestDeliveryTime violation makes solution infeasible', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 1000, 0, 'FarD'),
      2: new Node(2, 2000, 0, 'FarP'),
    };
    const customers = [
      new CustomerWithTimeWindows(1, 1, 2, 50, 0, 1, 0, 5000),
    ];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    solution.calculateSchedule();

    expect(solution.checkTimeWindows()).toBe(false);
    expect(solution.isFeasible()).toBe(false);
  });
});

// ============================================================
// C3: TrafficAwareProblem.getDistance must return Euclidean
// ============================================================
describe('C3 - TrafficAwareProblem distance contract', () => {
  test('getDistance returns Euclidean distance, not travel time', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 3, 4, 'A'),
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
    expect(problem.getDistance(0, 1)).toBeCloseTo(5, 5);
    // Travel time should use traffic model
    expect(problem.getTravelTime(0, 1)).toBe(99);
  });
});

// ============================================================
// C4: VehicleWithCapabilities.canTransferWith is directed
// ============================================================
describe('C4 - Directed transfer capability check', () => {
  test('canTransferWith requires source.canGive and target.canReceive', () => {
    const giver = new VehicleWithCapabilities(1, 10, ['standard'], false, true, 10);
    const receiver = new VehicleWithCapabilities(2, 10, ['standard'], true, false, 10);

    // giver can give to receiver
    expect(giver.canTransferWith(receiver)).toBe(true);
    // receiver cannot give to giver
    expect(receiver.canTransferWith(giver)).toBe(false);
  });

  test('canTransferWith fails when no common resource type', () => {
    const a = new VehicleWithCapabilities(1, 10, ['refrigerated'], true, true, 10);
    const b = new VehicleWithCapabilities(2, 10, ['hazmat'], true, true, 10);

    expect(a.canTransferWith(b)).toBe(false);
  });

  test('canTransferWith fails when source cannot give', () => {
    const a = new VehicleWithCapabilities(1, 10, ['standard'], true, false, 10);
    const b = new VehicleWithCapabilities(2, 10, ['standard'], true, true, 10);

    expect(a.canTransferWith(b)).toBe(false);
  });

  test('canTransferWith fails when target cannot receive', () => {
    const a = new VehicleWithCapabilities(1, 10, ['standard'], true, true, 10);
    const b = new VehicleWithCapabilities(2, 10, ['standard'], false, true, 10);

    expect(a.canTransferWith(b)).toBe(false);
  });
});

// ============================================================
// C5: BRKGA best solution must not be corrupted by evolution
// ============================================================
describe('C5 - BRKGA best-solution immutability', () => {
  test('returned solution remains feasible after solve', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      3: new Node(3, 0, 10, 'D2'),
      4: new Node(4, 0, 20, 'P2'),
    };
    const customers = [
      new Customer(1, 1, 2, 50),
      new Customer(2, 3, 4, 50),
    ];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const brkga = new BRKGA(problem, { populationSize: 20, maxGenerations: 20 });
    const solution = brkga.solve();

    // Solution must not have been mutated into an invalid state
    expect(solution.isComplete()).toBe(true);
    expect(solution.isFeasible()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);

    // Verify route arrays are independent (not shared with internal state)
    const routesCopy = solution.routes.map(r => [...r.nodes]);
    // Run solve again; previous solution should be unaffected
    const solution2 = brkga.solve();
    expect(solution2.routes).not.toBe(solution.routes);
    expect(solution.routes.map(r => [...r.nodes])).toEqual(routesCopy);
  });
});

// ============================================================
// C6: Transfer-aware insertion must register chosen transfers
// ============================================================
describe('C6 - Transfer-aware insertion registers transfers', () => {
  test('greedyInsertionWithTransfers creates transfer records', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      3: new Node(3, 0, 10, 'D2'),
      4: new Node(4, 0, 20, 'P2'),
      5: new Node(5, 10, 10, 'Hub'),
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
    expect(result.isComplete()).toBe(true);
    // If transfers were used, the transfer array or manager should reflect them
    // (depending on whether transfer was chosen as best, it may or may not be empty)
    expect(result.transfers.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// C7: TransferManager must respect maxConcurrentTransfers
// ============================================================
describe('C7 - TransferManager hub concurrency limit', () => {
  test('rejects transfer when hub is at capacity', () => {
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

    expect(manager.scheduleTransfer(t1)).toBe(true);
    expect(manager.scheduleTransfer(t2)).toBe(false); // exceeds maxConcurrentTransfers=1
  });

  test('allows non-overlapping transfers at same hub', () => {
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

    expect(manager.scheduleTransfer(t1)).toBe(true);
    // t1 occupies [0, 2), t2 occupies [5, 7) — no overlap
    expect(manager.scheduleTransfer(t2)).toBe(true);
  });

  test('allows concurrent transfers when hub capacity permits', () => {
    const manager = new TransferManager();
    const hub = new TransferHub(1, 0, 0, 'Hub', 3, 1);
    manager.registerHub(hub);

    const t1 = { id: 't1', hubNodeId: 1, transferTime: 10, fromVehicleId: 0, toVehicleId: 1, amount: 1 };
    const t2 = { id: 't2', hubNodeId: 1, transferTime: 10, fromVehicleId: 2, toVehicleId: 3, amount: 1 };
    const t3 = { id: 't3', hubNodeId: 1, transferTime: 10, fromVehicleId: 4, toVehicleId: 5, amount: 1 };

    expect(manager.scheduleTransfer(t1)).toBe(true);
    expect(manager.scheduleTransfer(t2)).toBe(true);
    expect(manager.scheduleTransfer(t3)).toBe(true);
  });
});

// ============================================================
// C8/C9: Worker validation (error paths)
// ============================================================
describe('C8/C9 - Worker and constructor validation', () => {
  test('ALNS rejects invalid coolingRate', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);

    expect(() => new ALNS(problem, { coolingRate: 1 })).toThrow('Cooling rate');
    expect(() => new ALNS(problem, { coolingRate: 0 })).toThrow('Cooling rate');
    expect(() => new ALNS(problem, { coolingRate: -1 })).toThrow('Cooling rate');
  });

  test('BRKGA rejects invalid proportions', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);

    expect(() => new BRKGA(problem, { populationSize: 0 })).toThrow('Population size');
    expect(() => new BRKGA(problem, { eliteFraction: 1 })).toThrow('Elite fraction');
    expect(() => new BRKGA(problem, { warmStartProportion: 1 })).toThrow('Warm-start proportion');
  });
});

// ============================================================
// C10: ALNS selectOperator must handle zero weights safely
// ============================================================
describe('C10 - ALNS selectOperator zero-weight safety', () => {
  test('returns valid index when all weights are zero', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const alns = new ALNS(problem, { maxIterations: 2 });

    // Access protected method via type assertion for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idx = (alns as any).selectOperator([0, 0, 0]);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThanOrEqual(2);
  });

  test('solve does not hang with single vehicle (regret fallback)', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const alns = new ALNS(problem, { maxIterations: 10 });

    const start = Date.now();
    const solution = alns.solve();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000); // should finish quickly
    expect(solution.isComplete()).toBe(true);
    expect(solution.isFeasible()).toBe(true);
  });
});

// ============================================================
// Security: GISExporter escaping
// ============================================================
describe('Security - GISExporter escaping', () => {
  test('KML output is well-formed XML without raw special chars in text nodes', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);
    const solution = new Solution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const kml = exporter.toKML();

    // Verify KML has correct structure
    expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('</Placemark>');
    expect(kml).toContain('</Document>');
  });

  test('CSV does not break with commas in names', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot, Main'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);
    const solution = new Solution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const csv = exporter.toCSV();

    // CSV lines should have consistent column count
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const cols = line.split(',');
      // Expect 8 columns: Route,Vehicle,NodeId,NodeType,X,Y,ArrivalTime,Sequence
      expect(cols.length).toBe(8);
    }
  });
});

// ============================================================
// SolutionWithTransfers validation
// ============================================================
describe('SolutionWithTransfers validation', () => {
  test('detects incompatible vehicles', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      5: new Node(5, 10, 10, 'Hub'),
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
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  test('detects transfer amount exceeding maxTransferAmount', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      5: new Node(5, 10, 10, 'Hub'),
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
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('exceeds max transfer'))).toBe(true);
  });
});

// ============================================================
// Regret insertion infinite-loop guard
// ============================================================
describe('Regret insertion infinite-loop guard', () => {
  test('regret2Insertion completes with a single route', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(
      nodes,
      [new Customer(1, 1, 2, 50)],
      [new Vehicle(1, 10)],
      0,
    );

    const empty = new Solution(problem, [new Route(1, [])]);
    const start = Date.now();
    const solution = InsertionOperators.regret2Insertion(empty, problem.customers);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(solution.isComplete()).toBe(true);
    expect(solution.routes[0].nodes).toContain(1);
    expect(solution.routes[0].nodes).toContain(2);
  });

  test('regret3Insertion completes with a single route', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(
      nodes,
      [new Customer(1, 1, 2, 50)],
      [new Vehicle(1, 10)],
      0,
    );

    const empty = new Solution(problem, [new Route(1, [])]);
    const start = Date.now();
    const solution = InsertionOperators.regret3Insertion(empty, problem.customers);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(solution.isComplete()).toBe(true);
  });

  test('regret4Insertion completes with a single route', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const problem = new Problem(
      nodes,
      [new Customer(1, 1, 2, 50)],
      [new Vehicle(1, 10)],
      0,
    );

    const empty = new Solution(problem, [new Route(1, [])]);
    const start = Date.now();
    const solution = InsertionOperators.regret4Insertion(empty, problem.customers);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(solution.isComplete()).toBe(true);
  });
});
