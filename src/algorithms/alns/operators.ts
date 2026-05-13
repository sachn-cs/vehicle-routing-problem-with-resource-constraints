import type { Customer, CustomerWithTimeWindows, LocationNode } from '../../core/Problem.js';
import type { VrpSolution } from '../../core/Solution.js';

function removeCustomerFromRoutes(solution: VrpSolution, customer: Customer): boolean {
  let removedAny = false;
  for (const route of solution.routes) {
    const dIndex = route.nodes.indexOf(customer.deliveryNodeId);
    const pIndex = route.nodes.indexOf(customer.pickupNodeId);

    if (dIndex !== -1 && pIndex !== -1) {
      // Remove higher index first to avoid shifting
      if (dIndex > pIndex) {
        route.nodes.splice(dIndex, 1);
        route.nodes.splice(pIndex, 1);
      } else {
        route.nodes.splice(pIndex, 1);
        route.nodes.splice(dIndex, 1);
      }
      removedAny = true;
    } else if (dIndex !== -1) {
      route.nodes.splice(dIndex, 1);
      removedAny = true;
    } else if (pIndex !== -1) {
      route.nodes.splice(pIndex, 1);
    }
  }
  return removedAny;
}

/**
 * Removal operators for ALNS.
 * Paper specifies 6 destroy operators.
 */
export const RemovalOperators = {
  /**
   * Random removal - removes k random customers from the solution.
   */
  random(solution: VrpSolution, k: number): { solution: VrpSolution; removed: Customer[] } {
    const newVrpSolution = solution.clone();
    const removed: Customer[] = [];
    const allCustomers = [...solution.problem.customers];

    for (let i = 0; i < k && allCustomers.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * allCustomers.length);
      const [spliced] = allCustomers.splice(randomIndex, 1);
      if (!spliced) continue;
      const customer = spliced;

      if (removeCustomerFromRoutes(newVrpSolution, customer)) {
        removed.push(customer);
      }
    }

    return { solution: newVrpSolution, removed };
  },

  /**
   * Worst removal (Critical Path) - removes k customers that contribute most to the makespan.
   * Also known as Critical Path Removal in the paper.
   */
  worst(solution: VrpSolution, k: number): { solution: VrpSolution; removed: Customer[] } {
    const newVrpSolution = solution.clone();
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
      const entry = customerCosts[i];
      if (!entry) continue;
      const customer = entry.customer;

      if (removeCustomerFromRoutes(newVrpSolution, customer)) {
        removed.push(customer);
      }
    }

    return { solution: newVrpSolution, removed };
  },

  /**
   * Shaw removal - removes k customers that are related (close in distance and time).
   * Uses a relatedness measure combining spatial and temporal proximity.
   */
  shaw(solution: VrpSolution, k: number): { solution: VrpSolution; removed: Customer[] } {
    const newVrpSolution = solution.clone();
    const removed: Customer[] = [];

    if (solution.problem.customers.length === 0) {
      return { solution: newVrpSolution, removed };
    }

    // Start with a random customer
    const seedIndex = Math.floor(Math.random() * solution.problem.customers.length);
    const seed = solution.problem.customers[seedIndex];
    if (!seed) {
      return { solution: newVrpSolution, removed };
    }

    const removedSet = new Set<number>([seed.id]);
    removed.push(seed);

    removeCustomerFromRoutes(newVrpSolution, seed);

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

      removeCustomerFromRoutes(newVrpSolution, bestCustomer);
    }

    return { solution: newVrpSolution, removed };
  },

  /**
   * Cluster removal - removes k customers that are geographically close.
   */
  cluster(solution: VrpSolution, k: number): { solution: VrpSolution; removed: Customer[] } {
    const newVrpSolution = solution.clone();
    const removed: Customer[] = [];

    // Pick a random seed customer
    const seedIndex = Math.floor(Math.random() * solution.problem.customers.length);
    const seed = solution.problem.customers[seedIndex];
    if (!seed) {
      return { solution: newVrpSolution, removed };
    }
    const seedNode = solution.problem.nodes[seed.deliveryNodeId];

    if (!seedNode) {
      return { solution: newVrpSolution, removed };
    }

    // Sort customers by distance to seed
    const sortedCustomers = [...solution.problem.customers].sort((a, b) => {
      const aNode = solution.problem.nodes[a.deliveryNodeId];
      const bNode = solution.problem.nodes[b.deliveryNodeId];
      if (!aNode || !bNode) return 0;
      const distA = Math.hypot(aNode.x - seedNode.x, aNode.y - seedNode.y);
      const distB = Math.hypot(bNode.x - seedNode.x, bNode.y - seedNode.y);
      return distA - distB;
    });

    // Remove k closest customers
    for (let i = 0; i < k && i < sortedCustomers.length; i++) {
      const customer = sortedCustomers[i];
      if (!customer) continue;

      if (removeCustomerFromRoutes(newVrpSolution, customer)) {
        removed.push(customer);
      }
    }

    return { solution: newVrpSolution, removed };
  },

  /**
   * Proximity removal - removes customers close to each other geographically.
   * Focuses purely on spatial proximity.
   */
  proximity(solution: VrpSolution, k: number): { solution: VrpSolution; removed: Customer[] } {
    const newVrpSolution = solution.clone();
    const removed: Customer[] = [];

    if (solution.problem.customers.length === 0) {
      return { solution: newVrpSolution, removed };
    }

    // Pick random seed
    const seedIndex = Math.floor(Math.random() * solution.problem.customers.length);
    const seed = solution.problem.customers[seedIndex];
    if (!seed) return { solution: newVrpSolution, removed };

    const seedNode = solution.problem.nodes[seed.deliveryNodeId];
    if (!seedNode) return { solution: newVrpSolution, removed };

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

      if (removeCustomerFromRoutes(newVrpSolution, customer)) {
        removed.push(customer);
      }
    }

    return { solution: newVrpSolution, removed };
  },

  /**
   * Temporal removal - removes customers based on time window tightness.
   * Targets customers with the most restrictive timing constraints.
   */
  temporal(solution: VrpSolution, k: number): { solution: VrpSolution; removed: Customer[] } {
    const newVrpSolution = solution.clone();
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
        const twCustomer = customer as CustomerWithTimeWindows;
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
      const entry = tightnessScores[i];
      if (!entry) continue;
      const customer = entry.customer;

      if (removeCustomerFromRoutes(newVrpSolution, customer)) {
        removed.push(customer);
      }
    }

    return { solution: newVrpSolution, removed };
  },
};

/**
 * Calculate relatedness between two customers.
 * Lower value = more related (should be removed together).
 */
function calculateRelatedness(
  c1: Customer,
  c2: Customer,
  nodes: Record<number, LocationNode>,
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
  greedyInsertion(solution: VrpSolution, customers: readonly Customer[]): VrpSolution {
    const newVrpSolution = solution.clone();

    for (const customer of customers) {
      let bestCost = Infinity;
      let bestRouteIndex = 0;
      let bestDeliveryPos = 0;
      let bestPickupPos = 0;

      // Try inserting in each route
      for (let rIdx = 0; rIdx < newVrpSolution.routes.length; rIdx++) {
        const route = newVrpSolution.routes[rIdx];
        if (!route) continue;

        // Try all positions for delivery
        for (let dPos = 0; dPos <= route.nodes.length; dPos++) {
          // Try all positions for pickup (must be after delivery)
          for (let pPos = dPos; pPos <= route.nodes.length; pPos++) {
            const testRoute = route.clone();
            testRoute.nodes.splice(dPos, 0, customer.deliveryNodeId);
            testRoute.nodes.splice(pPos + (dPos <= pPos ? 1 : 0), 0, customer.pickupNodeId);

            const testMakespan = newVrpSolution.evaluateMakespanWithRoute(rIdx, testRoute);
            if (testMakespan < bestCost) {
              bestCost = testMakespan;
              bestRouteIndex = rIdx;
              bestDeliveryPos = dPos;
              bestPickupPos = pPos;
            }
          }
        }
      }

      // Insert at best position
      const bestRoute = newVrpSolution.routes[bestRouteIndex];
      if (bestRoute) {
        bestRoute.nodes.splice(bestDeliveryPos, 0, customer.deliveryNodeId);
        bestRoute.nodes.splice(bestPickupPos + 1, 0, customer.pickupNodeId);
      }
    }

    newVrpSolution.calculateSchedule();
    return newVrpSolution;
  },

  /**
   * Regret-2 insertion - inserts customers based on regret cost.
   * Regret = difference between best and second-best insertion cost.
   */
  regret2Insertion(solution: VrpSolution, customers: readonly Customer[]): VrpSolution {
    return regretInsertion(solution, customers, 2);
  },

  /**
   * Regret-3 insertion - uses difference between best and third-best.
   * Paper specifies this as one of the 4 repair operators.
   */
  regret3Insertion(solution: VrpSolution, customers: readonly Customer[]): VrpSolution {
    return regretInsertion(solution, customers, 3);
  },

  /**
   * Regret-4 insertion - uses difference between best and fourth-best.
   * Paper specifies this as one of the 4 repair operators.
   */
  regret4Insertion(solution: VrpSolution, customers: readonly Customer[]): VrpSolution {
    return regretInsertion(solution, customers, 4);
  },
};

/**
 * General regret-k insertion.
 * @param k - Which best insertion to compare against (2 = second-best, 3 = third-best, etc.)
 */
function regretInsertion(
  solution: VrpSolution,
  customers: readonly Customer[],
  k: number,
): VrpSolution {
  const newVrpSolution = solution.clone();
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
      for (let rIdx = 0; rIdx < newVrpSolution.routes.length; rIdx++) {
        const route = newVrpSolution.routes[rIdx];
        if (!route) continue;

        let bestRouteCost = Infinity;
        let bestDPos = 0;
        let bestPPos = 0;

        for (let dPos = 0; dPos <= route.nodes.length; dPos++) {
          for (let pPos = dPos; pPos <= route.nodes.length; pPos++) {
            const testRoute = route.clone();
            testRoute.nodes.splice(dPos, 0, customer.deliveryNodeId);
            testRoute.nodes.splice(pPos + (dPos <= pPos ? 1 : 0), 0, customer.pickupNodeId);

            const testMakespan = newVrpSolution.evaluateMakespanWithRoute(rIdx, testRoute);
            if (testMakespan < bestRouteCost) {
              bestRouteCost = testMakespan;
              bestDPos = dPos;
              bestPPos = pPos;
            }
          }
        }

        costs.push({ cost: bestRouteCost, routeIndex: rIdx, dPos: bestDPos, pPos: bestPPos });
      }

      costs.sort((a, b) => a.cost - b.cost);

      // Calculate regret (difference between k-th best and best)
      const best = costs[0];
      if (!best) continue;

      if (costs.length >= k) {
        const kth = costs[k - 1];
        if (!kth) continue;
        const regret = kth.cost - best.cost;
        if (regret > bestRegret) {
          bestRegret = regret;
          bestCustomer = customer;
          bestRouteIndex = best.routeIndex;
          bestDeliveryPos = best.dPos;
          bestPickupPos = best.pPos;
        }
      } else if (costs.length >= 2 && k > costs.length) {
        // Fallback to available regret
        const worst = costs[costs.length - 1];
        if (!worst) continue;
        const regret = worst.cost - best.cost;
        if (regret > bestRegret) {
          bestRegret = regret;
          bestCustomer = customer;
          bestRouteIndex = best.routeIndex;
          bestDeliveryPos = best.dPos;
          bestPickupPos = best.pPos;
        }
      } else if (costs.length >= 1) {
        // Only one viable route exists; use it with zero regret
        if (0 >= bestRegret) {
          bestRegret = 0;
          bestCustomer = customer;
          bestRouteIndex = best.routeIndex;
          bestDeliveryPos = best.dPos;
          bestPickupPos = best.pPos;
        }
      }
    }

    if (bestCustomer) {
      const route = newVrpSolution.routes[bestRouteIndex];
      if (route) {
        route.nodes.splice(bestDeliveryPos, 0, bestCustomer.deliveryNodeId);
        route.nodes.splice(bestPickupPos + 1, 0, bestCustomer.pickupNodeId);
      }
      const index = remaining.indexOf(bestCustomer);
      remaining.splice(index, 1);
    } else if (remaining.length > 0) {
      // Safety break to prevent infinite loop
      break;
    }
  }

  newVrpSolution.calculateSchedule();
  return newVrpSolution;
}
