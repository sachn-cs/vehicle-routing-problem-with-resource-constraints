/**
 * Represents a single vehicle's route.
 * Contains a sequence of operations (delivery or pickup).
 */
export class Route {
  constructor(vehicleId, nodes = []) {
    this.vehicleId = vehicleId;
    this.nodes = nodes; // Array of node IDs
  }

  addNode(nodeId) {
    this.nodes.push(nodeId);
  }
}

/**
 * Represents a full solution to the VRP-RPD problem.
 */
export class Solution {
  constructor(problem, routes) {
    this.problem = problem;
    this.routes = routes; // Array of Route objects
    this.makespan = Infinity;
    this.nodeTimes = {}; // nodeID -> arrivalTime
    this.resourceReadyTimes = {}; // customerID -> readyTime (t_Dc + p_c)
  }

  /**
   * Calculates the arrival times for all nodes and the total makespan.
   * Handles the resource constraints between delivery and pickup.
   */
  calculateSchedule() {
    const nodeTimes = {};
    const resourceReadyTimes = {};
    const vehiclePointers = this.routes.map(() => 0);
    const vehicleLastTimes = this.routes.map(() => 0);
    const vehicleLastNode = this.routes.map(() => this.problem.depotNodeId);
    
    let changed = true;
    let iterations = 0;
    const maxIterations = 1000; // Safety break

    // Initialize
    this.routes.forEach((route, vIdx) => {
      vehicleLastTimes[vIdx] = 0;
    });

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      this.routes.forEach((route, vIdx) => {
        let currentTime = 0;
        let prevNode = this.problem.depotNodeId;

        for (let i = 0; i < route.nodes.length; i++) {
          const nodeId = route.nodes[i];
          const travelTime = this.problem.getDistance(prevNode, nodeId);
          let arrivalTime = currentTime + travelTime;

          // Check if this node is a pickup
          const customer = this.problem.customers.find(c => c.pickupNodeId === nodeId);
          if (customer) {
            const readyTime = resourceReadyTimes[customer.id] || 0;
            if (readyTime > arrivalTime) {
              arrivalTime = readyTime;
            }
          }

          if (nodeTimes[nodeId] !== arrivalTime) {
            nodeTimes[nodeId] = arrivalTime;
            changed = true;

            // If this node is a delivery, update resource ready time
            const deliveryCustomer = this.problem.customers.find(c => c.deliveryNodeId === nodeId);
            if (deliveryCustomer) {
              resourceReadyTimes[deliveryCustomer.id] = arrivalTime + deliveryCustomer.processingTime;
            }
          }

          currentTime = arrivalTime;
          prevNode = nodeId;
        }

        // Return to depot
        const returnTime = currentTime + this.problem.getDistance(prevNode, this.problem.depotNodeId);
        const routeId = `depot_return_${vIdx}`;
        if (nodeTimes[routeId] !== returnTime) {
          nodeTimes[routeId] = returnTime;
          changed = true;
        }
      });
    }

    this.nodeTimes = nodeTimes;
    this.resourceReadyTimes = resourceReadyTimes;
    
    // Makespan is the max return time to depot
    const depotReturns = this.routes.map((_, vIdx) => nodeTimes[`depot_return_${vIdx}`] || 0);
    this.makespan = Math.max(...depotReturns);
    
    return this.makespan;
  }

  isFeasible() {
    return this.checkCapacity() && this.isComplete();
  }

  checkCapacity() {
    for (const route of this.routes) {
      const vehicle = this.problem.vehicles.find(v => v.id === route.vehicleId);
      const k = vehicle?.capacity || Infinity;
      
      // Calculate minimum initial load needed to satisfy all deliveries before pickups
      let minLoadNeeded = 0;
      let currentLoad = 0;
      for (const nodeId of route.nodes) {
        const isDelivery = this.problem.customers.some(c => c.deliveryNodeId === nodeId);
        const isPickup = this.problem.customers.some(c => c.pickupNodeId === nodeId);
        if (isDelivery) currentLoad--;
        if (isPickup) currentLoad++;
        if (currentLoad < minLoadNeeded) minLoadNeeded = currentLoad;
      }
      
      // Initial load must be at least -minLoadNeeded to stay >= 0
      let load = -minLoadNeeded;
      if (load > k) return false; // Initial load exceeds capacity

      for (const nodeId of route.nodes) {
        const isDelivery = this.problem.customers.some(c => c.deliveryNodeId === nodeId);
        const isPickup = this.problem.customers.some(c => c.pickupNodeId === nodeId);
        if (isDelivery) load--;
        if (isPickup) load++;
        if (load < 0 || load > k) return false;
      }
    }
    return true;
  }

  isComplete() {
    const visitedNodes = new Set();
    this.routes.forEach(r => r.nodes.forEach(n => visitedNodes.add(n)));
    
    for (const customer of this.problem.customers) {
      if (!visitedNodes.has(customer.deliveryNodeId)) return false;
      if (!visitedNodes.has(customer.pickupNodeId)) return false;
    }
    return true;
  }
}
