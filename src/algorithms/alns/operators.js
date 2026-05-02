import { Solution, Route } from '../../core/Solution.js';

/**
 * ALNS Operators for VRP-RPD
 */

export const RemovalOperators = {
  /**
   * Randomly removes k customers.
   */
  randomRemoval(solution, k) {
    const customers = [...solution.problem.customers];
    const removed = [];
    for (let i = 0; i < k && customers.length > 0; i++) {
      const idx = Math.floor(Math.random() * customers.length);
      removed.push(customers.splice(idx, 1)[0]);
    }

    const newRoutes = solution.routes.map(route => {
      const filteredNodes = route.nodes.filter(nodeId => {
        return !removed.some(c => c.deliveryNodeId === nodeId || c.pickupNodeId === nodeId);
      });
      return new Route(route.vehicleId, filteredNodes);
    });

    return { solution: new Solution(solution.problem, newRoutes), removed };
  },

  /**
   * Removes customers based on similarity (distance).
   */
  shawRemoval(solution, k) {
    // Simplified Shaw removal: pick one random, then find nearest neighbors
    const customers = [...solution.problem.customers];
    if (customers.length === 0) return { solution, removed: [] };

    const firstIdx = Math.floor(Math.random() * customers.length);
    const pivot = customers.splice(firstIdx, 1)[0];
    const removed = [pivot];

    customers.sort((a, b) => {
      const distA = solution.problem.getDistance(pivot.deliveryNodeId, a.deliveryNodeId);
      const distB = solution.problem.getDistance(pivot.deliveryNodeId, b.deliveryNodeId);
      return distA - distB;
    });

    for (let i = 0; i < k - 1 && customers.length > 0; i++) {
      removed.push(customers.shift());
    }

    const newRoutes = solution.routes.map(route => {
      const filteredNodes = route.nodes.filter(nodeId => {
        return !removed.some(c => c.deliveryNodeId === nodeId || c.pickupNodeId === nodeId);
      });
      return new Route(route.vehicleId, filteredNodes);
    });

    return { solution: new Solution(solution.problem, newRoutes), removed };
  }
};

export const InsertionOperators = {
  /**
   * Greedily inserts removed customers into the best positions.
   */
  greedyInsertion(solution, removedCustomers) {
    let currentSolution = solution;

    for (const customer of removedCustomers) {
      let bestCost = Infinity;
      let bestSolution = null;

      // Try all combinations of vehicle and position for Delivery and Pickup
      // To keep it simple for now, we'll iterate through all routes and positions
      for (let vD = 0; vD < currentSolution.routes.length; vD++) {
        for (let posD = 0; posD <= currentSolution.routes[vD].nodes.length; posD++) {
          
          // Try all vehicles for Pickup
          for (let vP = 0; vP < currentSolution.routes.length; vP++) {
            // If same vehicle, posP must be >= posD + 1 if we want to ensure order in the same route
            // though the schedule calculation handles it, it's better for efficiency
            const startPosP = (vD === vP) ? posD : 0;
            
            for (let posP = startPosP; posP <= currentSolution.routes[vP].nodes.length; posP++) {
              const tempSolution = cloneAndInsert(currentSolution, customer, vD, posD, vP, posP);
              
              if (tempSolution.checkCapacity()) {
                const cost = tempSolution.calculateSchedule();
                if (cost < bestCost) {
                  bestCost = cost;
                  bestSolution = tempSolution;
                }
              }
            }
          }
        }
      }

      if (bestSolution) {
        currentSolution = bestSolution;
      }
    }

    return currentSolution;
  }
};

function cloneAndInsert(solution, customer, vD, posD, vP, posP) {
    const newRoutes = solution.routes.map(r => new Route(r.vehicleId, [...r.nodes]));
    
    // Insert Delivery
    newRoutes[vD].nodes.splice(posD, 0, customer.deliveryNodeId);
    
    // Insert Pickup (if same vehicle, index might have shifted)
    const actualPosP = (vD === vP && posP >= posD) ? posP + 1 : posP;
    newRoutes[vP].nodes.splice(actualPosP, 0, customer.pickupNodeId);

    return new Solution(solution.problem, newRoutes);
}

