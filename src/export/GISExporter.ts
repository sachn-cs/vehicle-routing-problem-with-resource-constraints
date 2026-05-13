import type { VrpProblem } from '../core/Problem.js';
import type { VrpSolution } from '../core/Solution.js';

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
  /**
   * @param solution - Solution to export
   * @param problem - Problem instance the solution solves
   * @param coordinateTransform - Optional function to convert problem coordinates
   */
  constructor(
    private readonly solution: VrpSolution,
    private readonly problem: VrpProblem,
    private readonly coordinateTransform?: (x: number, y: number) => [number, number],
  ) {}

  /**
   * @returns GeoJSON FeatureCollection representing the solution
   */
  toGeoJSON(): GeoJSON {
    const features: GeoJSONFeature[] = [];

    // Add depot as a point
    const depotCoords = this.getDepotCoords();
    if (depotCoords) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: depotCoords,
        },
        properties: {
          name: 'Depot',
          type: 'depot',
        },
      });
    }

    // Add customer locations
    for (const customer of this.problem.customers) {
      const deliveryCoords = this.getNodeCoords(customer.deliveryNodeId);
      if (deliveryCoords) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: deliveryCoords,
          },
          properties: {
            name: `Delivery ${customer.id}`,
            type: 'delivery',
            customerId: customer.id,
            processingTime: customer.processingTime,
          },
        });
      }

      const pickupCoords = this.getNodeCoords(customer.pickupNodeId);
      if (pickupCoords) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: pickupCoords,
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
      if (depotCoords) coordinates.push(depotCoords);

      for (const nodeId of route.nodes) {
        const nodeCoords = this.getNodeCoords(nodeId);
        if (nodeCoords) coordinates.push(nodeCoords);
      }

      if (depotCoords) coordinates.push(depotCoords);

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
          makespan: this.solution.nodeTimes[`depot_return_${i}`] ?? 0,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  /**
   * @returns KML document string representing the solution
   */
  toKML(): string {
    const placemarks: KMLPlacemark[] = [];
    const colors = ['#38bdf8', '#818cf8', '#f472b6', '#fbbf24', '#34d399'];

    // Add routes
    for (let i = 0; i < this.solution.routes.length; i++) {
      const route = this.solution.routes[i];
      if (!route) continue;

      const coordinates: [number, number][] = [];
      const depotCoords = this.getDepotCoords();
      if (depotCoords) coordinates.push(depotCoords);

      for (const nodeId of route.nodes) {
        const nodeCoords = this.getNodeCoords(nodeId);
        if (nodeCoords) coordinates.push(nodeCoords);
      }

      if (depotCoords) coordinates.push(depotCoords);

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
      kml += `    <name>${this.escapeXml(pm.name)}</name>\n`;
      kml += `    <description>${this.escapeXml(pm.description)}</description>\n`;

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
   * @returns CSV string with route, node, and timing data
   */
  toCSV(): string {
    let csv = 'Route,Vehicle,NodeId,NodeType,X,Y,ArrivalTime,Sequence\n';

    for (let i = 0; i < this.solution.routes.length; i++) {
      const route = this.solution.routes[i];
      if (!route) continue;

      const depotNode = this.getDepotNode();
      if (depotNode) {
        csv += [
          i,
          route.vehicleId,
          depotNode.id,
          'depot',
          depotNode.x,
          depotNode.y,
          0,
          0,
        ].map(v => this.escapeCsv(v)).join(',') + '\n';
      }

      for (let seq = 0; seq < route.nodes.length; seq++) {
        const nodeId = route.nodes[seq]!;
        const node = this.problem.nodes[nodeId];
        if (!node) continue;

        const isDelivery = this.problem.customers.some(c => c.deliveryNodeId === nodeId);
        const nodeType = isDelivery ? 'delivery' : 'pickup';
        const arrivalTime = this.solution.nodeTimes[nodeId] ?? 0;

        csv += [
          i,
          route.vehicleId,
          nodeId,
          nodeType,
          node.x,
          node.y,
          arrivalTime,
          seq + 1,
        ].map(v => this.escapeCsv(v)).join(',') + '\n';
      }

      // Return to depot
      if (depotNode) {
        const returnKey = `depot_return_${i}`;
        const returnTime = this.solution.nodeTimes[returnKey] ?? 0;
        csv += [
          i,
          route.vehicleId,
          depotNode.id,
          'depot_return',
          depotNode.x,
          depotNode.y,
          returnTime,
          route.nodes.length + 1,
        ].map(v => this.escapeCsv(v)).join(',') + '\n';
      }
    }

    return csv;
  }

  private getDepotNode() {
    return this.problem.nodes[this.problem.depotNodeId];
  }

  private getDepotCoords(): [number, number] | null {
    const depot = this.getDepotNode();
    if (!depot) return null;
    return this.transformCoordinates(depot.x, depot.y);
  }

  private getNodeCoords(nodeId: number): [number, number] | null {
    const node = this.problem.nodes[nodeId];
    if (!node) return null;
    return this.transformCoordinates(node.x, node.y);
  }

  private transformCoordinates(x: number, y: number): [number, number] {
    if (this.coordinateTransform) {
      return this.coordinateTransform(x, y);
    }
    return [x, y];
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeCsv(value: string | number): string {
    const str = String(value);
    if (/[,"\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
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
