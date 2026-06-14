import { expect } from 'chai';

import { RouteAnalytics } from '../src/analytics/route-analytics.js';
import { SolutionComparator } from '../src/analytics/solution-comparator.js';
import { VrpSolution, Route } from '../src/core/solution.js';

import { createBasicProblem, createTwoVehicleProblem } from './helpers.js';

describe('RouteAnalytics', () => {
  it('getVehicleUtilization returns values between 0 and 1', () => {
    const problem = createTwoVehicleProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      const route = solution.routes[c.id - 1];
      if (route) {
        route.nodes.push(c.deliveryNodeId, c.pickupNodeId);
      }
    }
    solution.calculateSchedule();

    const analytics = new RouteAnalytics(solution, problem);
    const utilization = analytics.getVehicleUtilization();
    for (const u of utilization) {
      expect(u.utilizationRate).to.be.at.least(0);
      expect(u.utilizationRate).to.be.at.most(1);
    }
  });

  it('getWaitTimes returns non-negative values', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const analytics = new RouteAnalytics(solution, problem);
    const waitTimes = analytics.getWaitTimes();
    for (const w of waitTimes) {
      expect(w.waitTime).to.be.at.least(0);
    }
  });

  it('getLoadOverTime returns entries for each route', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const analytics = new RouteAnalytics(solution, problem);
    const loadData = analytics.getLoadOverTime(0);
    expect(loadData.length).to.be.greaterThan(0);
  });

  it('compareRoutes returns efficiency array', () => {
    const problem = createTwoVehicleProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      const route = solution.routes[c.id - 1];
      if (route) {
        route.nodes.push(c.deliveryNodeId, c.pickupNodeId);
      }
    }
    solution.calculateSchedule();

    const analytics = new RouteAnalytics(solution, problem);
    const comparisons = analytics.compareRoutes();
    expect(comparisons.length).to.equal(solution.routes.length);
  });

  it('getSummary returns all fields', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const analytics = new RouteAnalytics(solution, problem);
    const summary = analytics.getSummary();
    expect(summary).to.have.property('totalDistance');
    expect(summary).to.have.property('totalCost');
    expect(summary).to.have.property('totalCO2');
    expect(summary.makespan).to.be.greaterThan(0);
  });
});

describe('SolutionComparator', () => {
  it('getMetrics returns all metric fields', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const comparator = new SolutionComparator([solution], problem);
    const metrics = comparator.getMetrics(0);
    expect(metrics).to.not.be.undefined;
    expect(metrics).to.have.property('makespan');
    expect(metrics).to.have.property('totalDistance');
    expect(metrics).to.have.property('totalCost');
    expect(metrics).to.have.property('totalCO2');
    expect(metrics).to.have.property('avgVehicleUtilization');
    expect(metrics).to.have.property('totalWaitTime');
    expect(metrics).to.have.property('feasibilityScore');
  });

  it('getAllComparisons returns comparisons for all solutions', () => {
    const problem = createBasicProblem();
    const routes1 = problem.vehicles.map(v => new Route(v.id, []));
    const s1 = new VrpSolution(problem, routes1);
    for (const c of problem.customers) {
      s1.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    s1.calculateSchedule();

    const routes2 = problem.vehicles.map(v => new Route(v.id, []));
    const s2 = new VrpSolution(problem, routes2);
    for (const c of problem.customers) {
      s2.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    s2.calculateSchedule();

    const comparator = new SolutionComparator([s1, s2], problem);
    const comparisons = comparator.getAllComparisons();
    expect(Object.keys(comparisons).length).to.be.greaterThan(0);
  });

  it('findParetoFront returns non-dominated solutions', () => {
    const problem = createBasicProblem();
    const routes1 = problem.vehicles.map(v => new Route(v.id, []));
    const s1 = new VrpSolution(problem, routes1);
    for (const c of problem.customers) {
      s1.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    s1.calculateSchedule();

    const comparator = new SolutionComparator([s1], problem);
    const pareto = comparator.findParetoFront();
    expect(pareto.solutions.length).to.be.greaterThan(0);
  });

  it('generateReport returns non-empty string', () => {
    const problem = createBasicProblem();
    const routes = problem.vehicles.map(v => new Route(v.id, []));
    const solution = new VrpSolution(problem, routes);
    for (const c of problem.customers) {
      solution.routes[0]!.nodes.push(c.deliveryNodeId, c.pickupNodeId);
    }
    solution.calculateSchedule();

    const comparator = new SolutionComparator([solution], problem);
    const report = comparator.generateReport();
    expect(report.length).to.be.greaterThan(0);
  });
});
