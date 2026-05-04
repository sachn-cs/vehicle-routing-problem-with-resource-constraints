import type { Solution } from '../core/Solution.js';
import type { Problem } from '../core/Problem.js';

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString' | 'Point';
    coordinates: [number, number][] | [number, number];
  };
  properties: Record<string, unknown>;
}

export interface GeoJSON {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface KMLPlacemark {
  name: string;
  description: string;
  coordinates: [number, number][] | [number, number];
  style: {
    strokeColor?: string;
    strokeWidth?: number;
    fillColor?: string;
  };
}

/**
 * Exports VRP-RPD solutions to GIS formats (GeoJSON, KML).
 */
export class GISExporter {
  constructor(
    private readonly solution: Solution,
    private readonly problem: Problem,
    private readonly coordinateTransform?: (x: number, y: number) => [number, number],
  ) {}

  /**
   * Exports solution as GeoJSON.
   */
  toGeoJSON(): GeoJSON {
    const features: GeoJSONFeature[] = [];

    // Add depot as a point
    const depot = this.problem.nodes[this.problem.depotNodeId];
    if (depot) {
      const coords = this.transformCoordinates(depot.x, depot.y);
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: coords,
        },
        properties: {
          name: 'Depot',
          type: 'depot',
        },
      });
    }

    // Add customer locations
    for (const customer of this.problem.customers) {
      const deliveryNode = this.problem.nodes[customer.deliveryNodeId];
      const pickupNode = this.problem.nodes[customer.pickupNodeId];

      if (deliveryNode) {
        const coords = this.transformCoordinates(deliveryNode.x, deliveryNode.y);
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords,
          },
          properties: {
            name: `Delivery ${customer.id}`,
            type: 'delivery',
            customerId: customer.id,
            processingTime: customer.processingTime,
          },
        });
      }

      if (pickupNode) {
        const coords = this.transformCoordinates(pickupNode.x, pickupNode.y);
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords,
          },
          properties: {
            name: `Pickup ${customer.id}`,
            type: 'pickup',
            customerId: customer.id,
          },
        });
      }
    }

    // Add routes as LineStrings
    const colors = ['#38bdf8', '#818cf8', '#f472b6', '#fbbf24', '#34d399'];
    for (let i = 0; i < this.solution.routes.length; i++) {
      const route = this.solution.routes[i];
      if (!route) continue;

      const coordinates: [number, number][] = [];

      // Start from depot
      const depotNode = this.problem.nodes[this.problem.depotNodeId];
      if (depotNode) {
        coordinates.push(this.transformCoordinates(depotNode.x, depotNode.y));
      }

      // Add all route nodes
      for (const nodeId of route.nodes) {
        const node = this.problem.nodes[nodeId];
        if (node) {
          coordinates.push(this.transformCoordinates(node.x, node.y));
        }
      }

      // Return to depot
      if (depotNode) {
        coordinates.push(this.transformCoordinates(depotNode.x, depotNode.y));
      }

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates,
        },
        properties: {
          name: `Route ${i + 1}`,
          type: 'route',
          vehicleId: route.vehicleId,
          color: colors[i % colors.length],
          makespan: this.solution.nodeTimes[`depot_return_${i}` as unknown as number] ?? 0,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  /**
   * Exports solution as KML.
   */
  toKML(): string {
    const placemarks: KMLPlacemark[] = [];
    const colors = ['#38bdf8', '#818cf8', '#f472b6', '#fbbf24', '#34d399'];

    // Add routes
    for (let i = 0; i < this.solution.routes.length; i++) {
      const route = this.solution.routes[i];
      if (!route) continue;

      const coordinates: [number, number][] = [];

      const depotNode = this.problem.nodes[this.problem.depotNodeId];
      if (depotNode) {
        coordinates.push(this.transformCoordinates(depotNode.x, depotNode.y));
      }

      for (const nodeId of route.nodes) {
        const node = this.problem.nodes[nodeId];
        if (node) {
          coordinates.push(this.transformCoordinates(node.x, node.y));
        }
      }

      if (depotNode) {
        coordinates.push(this.transformCoordinates(depotNode.x, depotNode.y));
      }

      placemarks.push({
        name: `Route ${i + 1}`,
        description: `Vehicle: ${route.vehicleId}`,
        coordinates,
        style: {
          strokeColor: colors[i % colors.length],
          strokeWidth: 3,
        },
      });
    }

    // Generate KML string
    let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
    kml += '<Document>\n';
    kml += '  <name>VRP-RPD Solution</name>\n';

    for (const pm of placemarks) {
      kml += '  <Placemark>\n';
      kml += `    <name>${pm.name}</name>\n`;
      kml += `    <description>${pm.description}</description>\n`;

      if (pm.style.strokeColor) {
        kml += '    <Style>\n';
        kml += '      <LineStyle>\n';
        kml += `        <color>${this.rgbToKmlColor(pm.style.strokeColor)}</color>\n`;
        kml += `        <width>${pm.style.strokeWidth ?? 1}</width>\n`;
        kml += '      </LineStyle>\n';
        kml += '    </Style>\n';
      }

      const coordsStr = Array.isArray(pm.coordinates[0])
        ? (pm.coordinates as [number, number][]).map(c => `${c[0]},${c[1]},0`).join(' ')
        : `${(pm.coordinates as [number, number])[0]},${(pm.coordinates as [number, number])[1]},0`;

      kml += `    <LineString>\n`;
      kml += '      <coordinates>' + coordsStr + '</coordinates>\n';
      kml += '    </LineString>\n';
      kml += '  </Placemark>\n';
    }

    kml += '</Document>\n';
    kml += '</kml>\n';

    return kml;
  }

  /**
   * Exports solution as CSV for import into other tools.
   */
  toCSV(): string {
    let csv = 'Route,Vehicle,NodeId,NodeType,X,Y,ArrivalTime,Sequence\n';

    for (let i = 0; i < this.solution.routes.length; i++) {
      const route = this.solution.routes[i];
      if (!route) continue;

      const depotNode = this.problem.nodes[this.problem.depotNodeId];
      if (depotNode) {
        csv += `${i},${route.vehicleId},${depotNode.id},depot,${depotNode.x},${depotNode.y},0,0\n`;
      }

      for (let seq = 0; seq < route.nodes.length; seq++) {
        const nodeId = route.nodes[seq]!;
        const node = this.problem.nodes[nodeId];
        if (!node) continue;

        const isDelivery = this.problem.customers.some(c => c.deliveryNodeId === nodeId);
        const nodeType = isDelivery ? 'delivery' : 'pickup';
        const arrivalTime = this.solution.nodeTimes[nodeId] ?? 0;

        csv += `${i},${route.vehicleId},${nodeId},${nodeType},${node.x},${node.y},${arrivalTime},${seq + 1}\n`;
      }

      // Return to depot
      if (depotNode) {
        const returnKey = `depot_return_${i}`;
        const returnTime = this.solution.nodeTimes[returnKey as unknown as number] ?? 0;
        csv += `${i},${route.vehicleId},${depotNode.id},depot_return,${depotNode.x},${depotNode.y},${returnTime},${route.nodes.length + 1}\n`;
      }
    }

    return csv;
  }

  private transformCoordinates(x: number, y: number): [number, number] {
    if (this.coordinateTransform) {
      return this.coordinateTransform(x, y);
    }
    return [x, y];
  }

  private rgbToKmlColor(rgb: string): string {
    // KML uses ABGR format (little-endian)
    const hex = rgb.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // KML format: aabbggrr (alpha is ff for opaque)
    return `ff${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`;
  }
}
