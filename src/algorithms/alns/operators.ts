import type { Solution } from '../../core/Solution.js';
import type { Customer, Node } from '../../core/Problem.js';

/**
 * Removal operators for ALNS.
 * Paper specifies 6 destroy operators.
 */
export const RemovalOperators = {
  /**
   * Random removal - removes k random customers from the solution.
   */
  random(solution: Solution, k: number): { solution: Solution; removed: Customer[] } {
    const newSolution = solution.clone();
    const removed: Customer[] = [];
    const allCustomers = [...solution.problem.customers];

    for (let i = 0; i < k && allCustomers.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * allCustomers.length);
      const customer = allCustomers.splice(randomIndex, 1)[0]!;

      for (const route of newSolution.routes) {
        const dIndex = route.nodes.indexOf(customer.deliveryNodeId);
        const pIndex = route.nodes.indexOf(customer.pickupNodeId);

        if (dIndex !== -1) {
          route.nodes.splice(dIndex, 1);
          removed.push(customer);
        }
        if (pIndex !== -1) {
          route.nodes.splice(pIndex, 1);
        }
      }
    }

    return { solution: newSolution, removed };
  },

  /**
   * Worst removal (Critical Path) - removes k customers that contribute most to the makespan.
   * Also known as Critical Path Removal in the paper.
   */
  worst(solution: Solution, k: number): { solution: Solution; removed: Customer[] } {
    const newSolution = solution.clone();
    const removed: Customer[] = [];

    const customerCosts: Array<{ customer: Customer; cost: number }> = [];

    for (const customer of solution.problem.customers) {
      const deliveryTime = solution.nodeTimes[customer.deliveryNodeId] ?? 0;
      const pickupTime = solution.nodeTimes[customer.pickupNodeId] ?? 0;
      const cost = pickupTime - deliveryTime;
      customerCosts.push({ customer, cost });
    }

    customerCosts.sort((a, b) => b.cost - a.cost);

    for (let i = 0; i < k && i < customerCosts.length; i++) {
      const customer = customerCosts[i]!.customer;

      for (const route of newSolution.routes) {
        const dIndex = route.nodes.indexOf(customer.deliveryNodeId);
        const pIndex = route.nodes.indexOf(customer.pickupNodeId);

        if (dIndex !== -1) {
          route.nodes.splice(dIndex, 1);
          removed.push(customer);
        }
        if (pIndex !== -1) {
          route.nodes.splice(pIndex, 1);
        }
      }
    }

    return { solution: newSolution, removed };
  },

  /**
   * Shaw removal - removes k customers that are related (close in distance and time).
   * Uses a relatedness measure combining spatial and temporal proximity.
   */
  shaw(solution: Solution, k: number): { solution: Solution; removed: Customer[] } {
    const newSolution = solution.clone();
    const removed: Customer[] = [];

    if (solution.problem.customers.length === 0) {
      return { solution: newSolution, removed };
    }

    // Start with a random customer
    const seedIndex = Math.floor(Math.random() * solution.problem.customers.length);
    const seed = solution.problem.customers[seedIndex];
    if (!seed) {
      return { solution: newSolution, removed };
    }

    const removedSet = new Set<number>([seed.id]);
    removed.push(seed);

    // Remove from routes
    for (const route of newSolution.routes) {
      const dIndex = route.nodes.indexOf(seed.deliveryNodeId);
      const pIndex = route.nodes.indexOf(seed.pickupNodeId);
      if (dIndex !== -1) route.nodes.splice(dIndex, 1);
      if (pIndex !== -1) route.nodes.splice(pIndex, 1);
    }

    // Find related customers to remove
    while (removed.length < k) {
      let bestCustomer: Customer | null = null;
      let bestRelatedness = Infinity;

      for (const customer of solution.problem.customers) {
        if (removedSet.has(customer.id)) continue;

        const relatedness = calculateRelatedness(
          seed,
          customer,
          solution.problem.nodes,
          solution.nodeTimes,
        );

        if (relatedness < bestRelatedness) {
          bestRelatedness = relatedness;
          bestCustomer = customer;
        }
      }

      if (!bestCustomer) break;

      removedSet.add(bestCustomer.id);
      removed.push(bestCustomer);

      // Remove from routes
      for (const route of newSolution.routes) {
        const dIndex = route.nodes.indexOf(bestCustomer.deliveryNodeId);
        const pIndex = route.nodes.indexOf(bestCustomer.pickupNodeId);
        if (dIndex !== -1) route.nodes.splice(dIndex, 1);
        if (pIndex !== -1) route.nodes.splice(pIndex, 1);
      }
    }

    return { solution: newSolution, removed };
  },

  /**
   * Cluster removal - removes k customers that are geographically close.
   */
  cluster(solution: Solution, k: number): { solution: Solution; removed: Customer[] } {
    const newSolution = solution.clone();
    const removed: Customer[] = [];

    // Pick a random seed customer
    const seedIndex = Math.floor(Math.random() * solution.problem.customers.length);
    const seed = solution.problem.customers[seedIndex];
    if (!seed) {
      return { solution: newSolution, removed };
    }
    const seedNode = solution.problem.nodes[seed.deliveryNodeId];

    if (!seedNode) {
      return { solution: newSolution, removed };
    }

    // Sort customers by distance to seed
    const sortedCustomers = [...solution.problem.customers].sort((a, b) => {
      const aNode = solution.problem.nodes[a.deliveryNodeId];
      const bNode = solution.problem.nodes[b.deliveryNodeId];
      if (!aNode || !bNode || !seedNode) return 0;
      const distA = Math.hypot(aNode.x - seedNode.x, aNode.y - seedNode.y);
      const distB = Math.hypot(bNode.x - seedNode.x, bNode.y - seedNode.y);
      return distA - distB;
    });

    // Remove k closest customers
    for (let i = 0; i < k && i < sortedCustomers.length; i++) {
      const customer = sortedCustomers[i];
      if (!customer) continue;

      for (const route of newSolution.routes) {
        const dIndex = route.nodes.indexOf(customer.deliveryNodeId);
        const pIndex = route.nodes.indexOf(customer.pickupNodeId);

        if (dIndex !== -1) {
          route.nodes.splice(dIndex, 1);
          removed.push(customer);
        }
        if (pIndex !== -1) {
          route.nodes.splice(pIndex, 1);
        }
      }
    }

    return { solution: newSolution, removed };
  },

  /**
   * Proximity removal - removes customers close to each other geographically.
   * Focuses purely on spatial proximity.
   */
  proximity(solution: Solution, k: number): { solution: Solution; removed: Customer[] } {
    const newSolution = solution.clone();
    const removed: Customer[] = [];

    if (solution.problem.customers.length === 0) {
      return { solution: newSolution, removed };
    }

    // Pick random seed
    const seedIndex = Math.floor(Math.random() * solution.problem.customers.length);
    const seed = solution.problem.customers[seedIndex];
    if (!seed) return { solution: newSolution, removed };

    const seedNode = solution.problem.nodes[seed.deliveryNodeId];
    if (!seedNode) return { solution: newSolution, removed };

    // Sort by pure distance
    const sortedCustomers = [...solution.problem.customers].sort((a, b) => {
      const aNode = solution.problem.nodes[a.deliveryNodeId];
      const bNode = solution.problem.nodes[b.deliveryNodeId];
      if (!aNode || !bNode) return 0;
      return Math.hypot(aNode.x - seedNode.x, aNode.y - seedNode.y) -
        Math.hypot(bNode.x - seedNode.x, bNode.y - seedNode.y);
    });

    for (let i = 0; i < k && i < sortedCustomers.length; i++) {
      const customer = sortedCustomers[i];
      if (!customer) continue;

      for (const route of newSolution.routes) {
        const dIndex = route.nodes.indexOf(customer.deliveryNodeId);
        const pIndex = route.nodes.indexOf(customer.pickupNodeId);

        if (dIndex !== -1) {
          route.nodes.splice(dIndex, 1);
          removed.push(customer);
        }
        if (pIndex !== -1) {
          route.nodes.splice(pIndex, 1);
        }
      }
    }

    return { solution: newSolution, removed };
  },

  /**
   * Temporal removal - removes customers based on time window tightness.
   * Targets customers with the most restrictive timing constraints.
   */
  temporal(solution: Solution, k: number): { solution: Solution; removed: Customer[] } {
    const newSolution = solution.clone();
    const removed: Customer[] = [];

    // Calculate time tightness for each customer
    const tightnessScores: Array<{ customer: Customer; score: number }> = [];

    for (const customer of solution.problem.customers) {
      const deliveryTime = solution.nodeTimes[customer.deliveryNodeId] ?? 0;
      const pickupTime = solution.nodeTimes[customer.pickupNodeId] ?? 0;

      // Higher score = more critical (longer wait or tighter constraint)
      let score = 0;

      // Check if time window constrained
      if ('earliestDeliveryTime' in customer) {
        const twCustomer = customer as import('../../core/Problem.js').CustomerWithTimeWindows;
        const deliverySlack = Math.max(0, twCustomer.earliestDeliveryTime - deliveryTime);
        const pickupSlack = Math.max(0, twCustomer.earliestPickupTime - pickupTime);
        score = deliverySlack + pickupSlack;
      }

      // Add waiting time component
      const waitTime = pickupTime - deliveryTime - customer.processingTime;
      score += Math.max(0, waitTime);

      tightnessScores.push({ customer, score });
    }

    // Sort by tightness (highest first)
    tightnessScores.sort((a, b) => b.score - a.score);

    // Remove k most critical customers
    for (let i = 0; i < k && i < tightnessScores.length; i++) {
      const customer = tightnessScores[i]!.customer;

      for (const route of newSolution.routes) {
        const dIndex = route.nodes.indexOf(customer.deliveryNodeId);
        const pIndex = route.nodes.indexOf(customer.pickupNodeId);

        if (dIndex !== -1) {
          route.nodes.splice(dIndex, 1);
          removed.push(customer);
        }
        if (pIndex !== -1) {
          route.nodes.splice(pIndex, 1);
        }
      }
    }

    return { solution: newSolution, removed };
  },
};

/**
 * Calculate relatedness between two customers.
 * Lower value = more related (should be removed together).
 */
function calculateRelatedness(
  c1: Customer,
  c2: Customer,
  nodes: Record<number, Node>,
  nodeTimes: Record<number, number>,
): number {
  const d1 = nodes[c1.deliveryNodeId];
  const d2 = nodes[c2.deliveryNodeId];

  if (!d1 || !d2) return Infinity;

  // Spatial component
  const dist = Math.hypot(d1.x - d2.x, d1.y - d2.y);

  // Temporal component
  const t1 = nodeTimes[c1.deliveryNodeId] ?? 0;
  const t2 = nodeTimes[c2.deliveryNodeId] ?? 0;
  const timeDiff = Math.abs(t1 - t2);

  // Combined relatedness (weighted sum)
  return dist + timeDiff;
}

/**
 * Insertion operators for ALNS.
 * Paper specifies 4 repair operators.
 */
export const InsertionOperators = {
  /**
   * Greedy insertion - inserts customers at the best position.
   */
  greedyInsertion(solution: Solution, customers: readonly Customer[]): Solution {
    const newSolution = solution.clone();

    for (const customer of customers) {
      let bestCost = Infinity;
      let bestRouteIndex = 0;
      let bestDeliveryPos = 0;
      let bestPickupPos = 0;

      // Try inserting in each route
      for (let rIdx = 0; rIdx < newSolution.routes.length; rIdx++) {
        const route = newSolution.routes[rIdx];
        if (!route) continue;

        // Try all positions for delivery
        for (let dPos = 0; dPos <= route.nodes.length; dPos++) {
          // Try all positions for pickup (must be after delivery)
          for (let pPos = dPos; pPos <= route.nodes.length; pPos++) {
            const testRoute = route.clone();
            testRoute.nodes.splice(dPos, 0, customer.deliveryNodeId);
            testRoute.nodes.splice(pPos + (dPos <= pPos ? 1 : 0), 0, customer.pickupNodeId);

            const testSolution = newSolution.clone();
            testSolution.routes[rIdx] = testRoute;
            testSolution.calculateSchedule();

            if (testSolution.makespan < bestCost) {
              bestCost = testSolution.makespan;
              bestRouteIndex = rIdx;
              bestDeliveryPos = dPos;
              bestPickupPos = pPos;
            }
          }
        }
      }

      // Insert at best position
      const bestRoute = newSolution.routes[bestRouteIndex];
      if (bestRoute) {
        bestRoute.nodes.splice(bestDeliveryPos, 0, customer.deliveryNodeId);
        bestRoute.nodes.splice(bestPickupPos + 1, 0, customer.pickupNodeId);
      }
    }

    newSolution.calculateSchedule();
    return newSolution;
  },

  /**
   * Regret-2 insertion - inserts customers based on regret cost.
   * Regret = difference between best and second-best insertion cost.
   */
  regret2Insertion(solution: Solution, customers: readonly Customer[]): Solution {
    return regretInsertion(solution, customers, 2);
  },

  /**
   * Regret-3 insertion - uses difference between best and third-best.
   * Paper specifies this as one of the 4 repair operators.
   */
  regret3Insertion(solution: Solution, customers: readonly Customer[]): Solution {
    return regretInsertion(solution, customers, 3);
  },

  /**
   * Regret-4 insertion - uses difference between best and fourth-best.
   * Paper specifies this as one of the 4 repair operators.
   */
  regret4Insertion(solution: Solution, customers: readonly Customer[]): Solution {
    return regretInsertion(solution, customers, 4);
  },
};

/**
 * General regret-k insertion.
 * @param k - Which best insertion to compare against (2 = second-best, 3 = third-best, etc.)
 */
function regretInsertion(
  solution: Solution,
  customers: readonly Customer[],
  k: number,
): Solution {
  const newSolution = solution.clone();
  const remaining = [...customers];

  while (remaining.length > 0) {
    let bestRegret = -Infinity;
    let bestCustomer: Customer | null = null;
    let bestRouteIndex = 0;
    let bestDeliveryPos = 0;
    let bestPickupPos = 0;

    for (const customer of remaining) {
      const costs: Array<{ cost: number; routeIndex: number; dPos: number; pPos: number }> = [];

      // Find best positions in each route
      for (let rIdx = 0; rIdx < newSolution.routes.length; rIdx++) {
        const route = newSolution.routes[rIdx];
        if (!route) continue;

        let bestRouteCost = Infinity;
        let bestDPos = 0;
        let bestPPos = 0;

        for (let dPos = 0; dPos <= route.nodes.length; dPos++) {
          for (let pPos = dPos; pPos <= route.nodes.length; pPos++) {
            const testRoute = route.clone();
            testRoute.nodes.splice(dPos, 0, customer.deliveryNodeId);
            testRoute.nodes.splice(pPos + (dPos <= pPos ? 1 : 0), 0, customer.pickupNodeId);

            const testSolution = newSolution.clone();
            testSolution.routes[rIdx] = testRoute;
            testSolution.calculateSchedule();

            if (testSolution.makespan < bestRouteCost) {
              bestRouteCost = testSolution.makespan;
              bestDPos = dPos;
              bestPPos = pPos;
            }
          }
        }

        costs.push({ cost: bestRouteCost, routeIndex: rIdx, dPos: bestDPos, pPos: bestPPos });
      }

      costs.sort((a, b) => a.cost - b.cost);

      // Calculate regret (difference between k-th best and best)
      if (costs.length >= k) {
        const regret = costs[k - 1]!.cost - costs[0]!.cost;
        if (regret > bestRegret) {
          bestRegret = regret;
          bestCustomer = customer;
          bestRouteIndex = costs[0]!.routeIndex;
          bestDeliveryPos = costs[0]!.dPos;
          bestPickupPos = costs[0]!.pPos;
        }
      } else if (costs.length >= 2 && k > costs.length) {
        // Fallback to available regret
        const regret = costs[costs.length - 1]!.cost - costs[0]!.cost;
        if (regret > bestRegret) {
          bestRegret = regret;
          bestCustomer = customer;
          bestRouteIndex = costs[0]!.routeIndex;
          bestDeliveryPos = costs[0]!.dPos;
          bestPickupPos = costs[0]!.pPos;
        }
      }
    }

    if (bestCustomer) {
      const route = newSolution.routes[bestRouteIndex];
      if (route) {
        route.nodes.splice(bestDeliveryPos, 0, bestCustomer.deliveryNodeId);
        route.nodes.splice(bestPickupPos + 1, 0, bestCustomer.pickupNodeId);
      }
      const index = remaining.indexOf(bestCustomer);
      remaining.splice(index, 1);
    }
  }

  newSolution.calculateSchedule();
  return newSolution;
}
