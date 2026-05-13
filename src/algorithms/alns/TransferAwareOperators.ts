import type { Customer } from '../../core/Problem.js';
import type { TransferHub } from '../../core/ResourceTransfer.js';
import type { SolutionWithTransfers } from '../../core/SolutionWithTransfers.js';

/**
 * Transfer-aware insertion operators for ALNS.
 * These operators consider inter-vehicle transfers when inserting customers.
 */
export const TransferAwareInsertionOperators = {
  /**
   * Greedy insertion with transfer support.
   * Allows customers to be served via intermediate hub transfers.
   */
  greedyInsertionWithTransfers(
    solution: SolutionWithTransfers,
    customers: readonly Customer[],
    hubs: TransferHub[],
  ): SolutionWithTransfers {
    const newSolution = solution.clone();

    // Track transfers to schedule after the full schedule is calculated
    const pendingTransfers: Array<{
      hubId: number;
      fromVehicleId: number;
      toVehicleId: number;
      amount: number;
    }> = [];

    for (const customer of customers) {
      let bestCost = Infinity;
      let bestConfig: {
        deliveryRouteIndex: number;
        pickupRouteIndex: number;
        deliveryPos: number;
        pickupPos: number;
        useTransfer: boolean;
        hubId?: number;
      } | null = null;

      // Try direct assignment (same vehicle for D and P)
      for (let rIdx = 0; rIdx < newSolution.routes.length; rIdx++) {
        const route = newSolution.routes[rIdx];
        if (!route) continue;

        for (let dPos = 0; dPos <= route.nodes.length; dPos++) {
          for (let pPos = dPos; pPos <= route.nodes.length; pPos++) {
            const testRoute = route.clone();
            testRoute.nodes.splice(dPos, 0, customer.deliveryNodeId);
            testRoute.nodes.splice(pPos + (dPos <= pPos ? 1 : 0), 0, customer.pickupNodeId);

            const testSolution = newSolution.clone();
            testSolution.routes[rIdx] = testRoute;
            testSolution.calculateSchedule();

            if (testSolution.makespan < bestCost) {
              bestCost = testSolution.makespan;
              bestConfig = {
                deliveryRouteIndex: rIdx,
                pickupRouteIndex: rIdx,
                deliveryPos: dPos,
                pickupPos: pPos,
                useTransfer: false,
              };
            }
          }
        }
      }

      // Try transfer-based assignment (different vehicles via hub)
      if (hubs.length > 0) {
        for (const hub of hubs) {
          for (let dRouteIdx = 0; dRouteIdx < newSolution.routes.length; dRouteIdx++) {
            for (let pRouteIdx = 0; pRouteIdx < newSolution.routes.length; pRouteIdx++) {
              if (dRouteIdx === pRouteIdx) continue; // Skip same vehicle (already tried)

              const deliveryRoute = newSolution.routes[dRouteIdx];
              const pickupRoute = newSolution.routes[pRouteIdx];
              if (!deliveryRoute || !pickupRoute) continue;

              // Geographic pruning: skip hub if it is unreasonably far
              const directDist = solution.problem.getDistance(customer.deliveryNodeId, customer.pickupNodeId);
              const viaHubDist =
                solution.problem.getDistance(customer.deliveryNodeId, hub.id) +
                solution.problem.getDistance(hub.id, customer.pickupNodeId);
              if (viaHubDist > directDist * 2) continue;

              // Try inserting delivery -> hub in delivery route
              for (let dPos = 0; dPos <= deliveryRoute.nodes.length; dPos++) {
                // Try inserting hub -> pickup in pickup route
                for (let pPos = 0; pPos <= pickupRoute.nodes.length; pPos++) {
                  const testDeliveryRoute = deliveryRoute.clone();
                  const testPickupRoute = pickupRoute.clone();

                  testDeliveryRoute.nodes.splice(dPos, 0, customer.deliveryNodeId, hub.id);
                  testPickupRoute.nodes.splice(pPos, 0, hub.id, customer.pickupNodeId);

                  const { makespan: testMakespan, hubReadyTime } =
                    newSolution.evaluateMakespanWithTwoRoutes(
                      dRouteIdx,
                      testDeliveryRoute,
                      pRouteIdx,
                      testPickupRoute,
                      hub.id,
                    );

                  const transferFeasible = newSolution.canScheduleTransfer(
                    hub.id,
                    deliveryRoute.vehicleId,
                    pickupRoute.vehicleId,
                    1,
                    hubReadyTime,
                  );

                  if (transferFeasible && testMakespan < bestCost) {
                    bestCost = testMakespan;
                    bestConfig = {
                      deliveryRouteIndex: dRouteIdx,
                      pickupRouteIndex: pRouteIdx,
                      deliveryPos: dPos,
                      pickupPos: pPos,
                      useTransfer: true,
                      hubId: hub.id,
                    };
                  }
                }
              }
            }
          }
        }
      }

      // Apply best configuration
      if (bestConfig) {
        if (bestConfig.useTransfer && bestConfig.hubId !== undefined) {
          const deliveryRoute = newSolution.routes[bestConfig.deliveryRouteIndex];
          const pickupRoute = newSolution.routes[bestConfig.pickupRouteIndex];
          if (deliveryRoute && pickupRoute) {
            deliveryRoute.nodes.splice(
              bestConfig.deliveryPos,
              0,
              customer.deliveryNodeId,
              bestConfig.hubId,
            );
            pickupRoute.nodes.splice(
              bestConfig.pickupPos,
              0,
              bestConfig.hubId,
              customer.pickupNodeId,
            );
            pendingTransfers.push({
              hubId: bestConfig.hubId,
              fromVehicleId: deliveryRoute.vehicleId,
              toVehicleId: pickupRoute.vehicleId,
              amount: 1,
            });
          }
        } else {
          const route = newSolution.routes[bestConfig.deliveryRouteIndex];
          if (route) {
            route.nodes.splice(bestConfig.deliveryPos, 0, customer.deliveryNodeId);
            route.nodes.splice(bestConfig.pickupPos + 1, 0, customer.pickupNodeId);
          }
        }
      }
    }

    newSolution.calculateSchedule();

    // Schedule pending transfers using calculated arrival times
    for (const pt of pendingTransfers) {
      const transferTime = newSolution.nodeTimes[pt.hubId] ?? 0;
      newSolution.scheduleTransfer(
        pt.hubId,
        pt.fromVehicleId,
        pt.toVehicleId,
        pt.amount,
        transferTime,
      );
    }

    return newSolution;
  },
};

/**
 * Transfer-aware removal operators for ALNS.
 */
export const TransferAwareRemovalOperators = {
  /**
   * Random removal that preserves transfer constraints.
   */
  randomWithTransfers(
    solution: SolutionWithTransfers,
    k: number,
  ): { solution: SolutionWithTransfers; removed: Customer[] } {
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

    // Remove associated transfers
    const transfersToRemove = newSolution.transfers.filter(t =>
      removed.some(r => {
        // Check if transfer was related to removed customer
        return (
          t.hubNodeId === r.deliveryNodeId || t.hubNodeId === r.pickupNodeId
        );
      }),
    );

    for (const transfer of transfersToRemove) {
      const idx = newSolution.transfers.indexOf(transfer);
      if (idx !== -1) {
        newSolution.transfers.splice(idx, 1);
      }
    }

    return { solution: newSolution, removed };
  },
};
