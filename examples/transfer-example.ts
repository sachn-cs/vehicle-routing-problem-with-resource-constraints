/**
 * Example: Inter-Vehicle Resource Transfer
 *
 * This demonstrates how vehicles can transfer resources at hub nodes
 * to enable more efficient routing.
 */

import {
  Problem,
  Node,
  Customer,
  Solution,
  Route,
  TransferHub,
  TransferManager,
  VehicleWithCapabilities,
  VehicleFleetManager,
  SolutionWithTransfers,
  ProblemWithTransfers,
  RouteAnalytics,
} from '../src/index.js';

// Create nodes
const nodes: Record<number, Node> = {
  0: new Node(0, 0, 0, 'Depot'),
  1: new Node(1, 10, 0, 'D1'),
  2: new Node(2, 20, 0, 'P1'),
  3: new Node(3, 0, 10, 'D2'),
  4: new Node(4, 0, 20, 'P2'),
  5: new Node(5, 10, 10, 'Hub'), // Transfer hub
};

// Create customers
const customers = [
  new Customer(1, 1, 2, 50), // D1 -> P1
  new Customer(2, 3, 4, 50), // D2 -> P2
];

// Create vehicles with transfer capabilities
const vehicles = [
  new VehicleWithCapabilities(0, 5, ['standard'], true, true, 10),
  new VehicleWithCapabilities(1, 5, ['standard'], true, true, 10),
];

// Create transfer hub
const hubs = [
  new TransferHub(5, 10, 10, 'Central Hub', 2, 5), // max 2 concurrent, 5 time units per transfer
];

// Create problem with transfer support
const problem = new ProblemWithTransfers(nodes, customers, vehicles, 0, hubs);

// Create solution with transfers
const solution = new SolutionWithTransfers(problem, [
  new Route(0, [1, 5]), // Vehicle 0: D1 -> Hub
  new Route(1, [5, 4, 3]), // Vehicle 1: Hub -> P2 -> D2
], hubs, vehicles);

// Schedule a transfer at the hub
const transferScheduled = solution.scheduleTransfer(
  5, // hub node
  0, // from vehicle
  1, // to vehicle
  1, // amount
  15, // transfer time
);

console.log('Transfer scheduled:', transferScheduled);

// Calculate schedule
solution.calculateSchedule();

// Validate transfers
const validation = solution.validateTransfers();
console.log('Transfers valid:', validation.valid);
if (!validation.valid) {
  console.log('Errors:', validation.errors);
}

// Get transfer summary
const summary = solution.getTransferSummary();
console.log('Transfer Summary:');
console.log('  Total transfers:', summary.totalTransfers);
console.log('  Total amount:', summary.totalAmountTransferred);
console.log('  Hubs used:', summary.uniqueHubsUsed);
console.log('  Vehicle pairs:', summary.uniqueVehiclePairs);

// Get vehicle resource balances
const balances = solution.getVehicleResourceBalances();
console.log('\nVehicle Resource Balances:');
for (const balance of balances) {
  console.log(`  Vehicle ${balance.vehicleId}: net=${balance.netBalance}, received=[${balance.receivedFrom}], given=[${balance.givenTo}]`);
}

// Check feasibility
console.log('\nSolution feasible:', solution.isFeasible());
console.log('Makespan:', solution.makespan.toFixed(2));
console.log('Total distance:', solution.totalDistance.toFixed(2));

// Route analytics
const analytics = new RouteAnalytics(solution, problem);
const utilization = analytics.getVehicleUtilization();
console.log('\nVehicle Utilization:');
for (const u of utilization) {
  console.log(`  Vehicle ${u.vehicleId}: ${Math.round(u.utilizationRate * 100)}% utilized, ${u.customerCount} customers`);
}

// Fleet manager example
console.log('\n--- Fleet Manager Example ---');
const fleetManager = new VehicleFleetManager(vehicles);

// Update vehicle states
fleetManager.updateVehicleState(0, 1, 'delivery', 10, -1, 'standard');
fleetManager.updateVehicleState(0, 5, 'hub', 15, 0, 'standard');

const state = fleetManager.getVehicleState(0);
console.log('Vehicle 0 state:', state);

const fleetUtilization = fleetManager.getFleetUtilization();
console.log('Fleet utilization:', fleetUtilization);
