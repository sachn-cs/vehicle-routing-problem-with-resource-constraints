import { expect } from 'chai';

import { TransferAwareRemovalOperators, TransferAwareInsertionOperators } from '../../src/algorithms/alns/transfer-aware-operators.js';
import { VrpProblem, LocationNode, Customer } from '../../src/core/problem.js';
import { TransferManager, TransferHub, type ResourceTransfer } from '../../src/core/resource-transfer.js';
import { SolutionWithTransfers } from '../../src/core/solution-with-transfers.js';
import { Route } from '../../src/core/solution.js';
import { VehicleWithCapabilities, VehicleFleetManager } from '../../src/core/vehicle-with-capabilities.js';

describe('Transfer-Aware Operators', () => {
  it('randomWithTransfers removes customers without crashing', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 100, 0, 'Hub'),
    };
    const customers = [new Customer(1, 1, 2, 10)];
    const vehicles = [new VehicleWithCapabilities(1, 10), new VehicleWithCapabilities(2, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const hubs = [new TransferHub(3, 100, 0, 'Hub')];
    const solution = new SolutionWithTransfers(problem, routes, hubs,
      vehicles.map(v => new VehicleWithCapabilities(v.id, v.capacity)));
    solution.routes[0]!.nodes.push(1, 2);
    solution.calculateSchedule();

    const { removed } = TransferAwareRemovalOperators.randomWithTransfers(solution, 1);
    expect(removed.length).to.equal(1);
  });

  it('greedyInsertionWithTransfers restores completeness', () => {
    const nodes = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
      3: new LocationNode(3, 100, 0, 'Hub'),
    };
    const customers = [new Customer(1, 1, 2, 10)];
    const vehicles = [new VehicleWithCapabilities(1, 10), new VehicleWithCapabilities(2, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const hubs = [new TransferHub(3, 100, 0, 'Hub')];
    const solution = new SolutionWithTransfers(problem, routes, hubs,
      vehicles.map(v => new VehicleWithCapabilities(v.id, v.capacity)));
    solution.routes[0]!.nodes.push(1, 2);
    solution.calculateSchedule();

    const repaired = TransferAwareInsertionOperators.greedyInsertionWithTransfers(
      solution, [...problem.customers], hubs,
    );
    expect(repaired.isComplete()).to.be.true;
  });
});

describe('VehicleFleetManager', () => {
  it('addVehicle and getVehicle work correctly', () => {
    const manager = new VehicleFleetManager();
    const vehicle = new VehicleWithCapabilities(1, 10);
    manager.addVehicle(vehicle);

    const retrieved = manager.getVehicle(1);
    expect(retrieved).to.not.be.undefined;
    if (retrieved) {
      expect(retrieved.id).to.equal(1);
    }
  });

  it('getVehiclesForResourceType filters correctly', () => {
    const manager = new VehicleFleetManager();
    manager.addVehicle(new VehicleWithCapabilities(1, 10, ['standard']));
    manager.addVehicle(new VehicleWithCapabilities(2, 10, ['refrigerated']));

    const filtered = manager.getVehiclesForResourceType('standard');
    expect(filtered.length).to.equal(1);
  });

  it('updateVehicleState updates load correctly', () => {
    const manager = new VehicleFleetManager();
    manager.addVehicle(new VehicleWithCapabilities(1, 10));
    manager.updateVehicleState(1, 101, 'delivery', 0, 5);
    const state = manager.getVehicleState(1);
    expect(state).to.not.be.undefined;
  });

  it('resetAllStates clears all vehicle states', () => {
    const manager = new VehicleFleetManager();
    manager.addVehicle(new VehicleWithCapabilities(1, 10));
    manager.updateVehicleState(1, 101, 'delivery', 0, 5);
    manager.resetAllStates();

    const state = manager.getVehicleState(1);
    expect(state).to.not.be.undefined;
  });
});

describe('TransferManager', () => {
  it('scheduleTransfer and getTransfersForVehicle work', () => {
    const manager = new TransferManager();
    const hub = new TransferHub(3, 100, 0, 'Hub');
    manager.registerHub(hub);

    const transfer: ResourceTransfer = {
      id: 't1',
      hubNodeId: 3,
      fromVehicleId: 1,
      toVehicleId: 2,
      resourceType: 'standard',
      amount: 5,
      transferTime: 10,
    };
    manager.scheduleTransfer(transfer);

    const transfers = manager.getTransfersForVehicle(1);
    expect(transfers.length).to.equal(1);
    expect(transfers[0]!.id).to.equal('t1');
  });

  it('rejects overlapping transfers at capacity-limited hub', () => {
    const manager = new TransferManager();
    const hub = new TransferHub(3, 100, 0, 'Hub', 1);
    manager.registerHub(hub);

    manager.scheduleTransfer({
      id: 't1',
      hubNodeId: 3,
      fromVehicleId: 1,
      toVehicleId: 2,
      resourceType: 'standard',
      amount: 5,
      transferTime: 10,
    });

    const second = manager.scheduleTransfer({
      id: 't2',
      hubNodeId: 3,
      fromVehicleId: 1,
      toVehicleId: 2,
      resourceType: 'standard',
      amount: 5,
      transferTime: 10,
    });
    expect(second).to.be.false;
  });

  it('allows non-overlapping transfers at same hub', () => {
    const manager = new TransferManager();
    const hub = new TransferHub(3, 100, 0, 'Hub', 1);
    manager.registerHub(hub);

    manager.scheduleTransfer({
      id: 't1',
      hubNodeId: 3,
      fromVehicleId: 1,
      toVehicleId: 2,
      resourceType: 'standard',
      amount: 5,
      transferTime: 10,
    });

    const second = manager.scheduleTransfer({
      id: 't2',
      hubNodeId: 3,
      fromVehicleId: 1,
      toVehicleId: 2,
      resourceType: 'standard',
      amount: 5,
      transferTime: 100,
    });
    expect(second).to.be.true;
  });

  it('getAllHubs returns registered hubs', () => {
    const manager = new TransferManager();
    manager.registerHub(new TransferHub(3, 100, 0, 'Hub1'));
    manager.registerHub(new TransferHub(5, 200, 0, 'Hub2'));
    const hubs = manager.getAllHubs();
    expect(hubs.length).to.equal(2);
  });

  it('clearAll resets all transfers', () => {
    const manager = new TransferManager();
    manager.registerHub(new TransferHub(3, 100, 0, 'Hub'));
    manager.scheduleTransfer({
      id: 't1',
      hubNodeId: 3,
      fromVehicleId: 1,
      toVehicleId: 2,
      resourceType: 'standard',
      amount: 5,
      transferTime: 10,
    });
    manager.clearAll();
    expect(manager.getAllTransfers().length).to.equal(0);
  });
});
