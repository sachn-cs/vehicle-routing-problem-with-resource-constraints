import { expect } from 'chai';

import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/problem.js';
import { VrpSolution, Route } from '../src/core/solution.js';
import { GISExporter } from '../src/export/gis-exporter.js';
import { isWorkerData, validateWorkerData } from '../src/worker-validation.js';

describe('Security S1 - KML XML escaping', () => {
  it('escapeXml helper escapes all XML entities', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const solution = new VrpSolution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const escapeXml = (exporter as unknown as { escapeXml: (s: string) => string }).escapeXml.bind(exporter);

    expect(escapeXml('foo < bar')).to.equal('foo &lt; bar');
    expect(escapeXml('foo > bar')).to.equal('foo &gt; bar');
    expect(escapeXml('foo & bar')).to.equal('foo &amp; bar');
    expect(escapeXml('foo " bar')).to.equal('foo &quot; bar');
    expect(escapeXml('<script>alert("xss")</script>')).to.equal(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('KML output does not contain raw angle brackets inside text nodes', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const solution = new VrpSolution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const kml = exporter.toKML();

    // The content between <name> and </name> should not contain unescaped < or >
    const nameMatches = kml.match(/<name>(.*?)<\/name>/g);
    expect(nameMatches).to.exist;
    if (nameMatches) {
      for (const match of nameMatches) {
        const inner = match.replace(/<name>/, '').replace(/<\/name>/, '');
        expect(inner).to.not.include('<');
        expect(inner).to.not.include('>');
      }
    }

    const descMatches = kml.match(/<description>(.*?)<\/description>/g);
    expect(descMatches).to.exist;
    if (descMatches) {
      for (const match of descMatches) {
        const inner = match.replace(/<description>/, '').replace(/<\/description>/, '');
        expect(inner).to.not.include('<');
        expect(inner).to.not.include('>');
      }
    }
  });
});

describe('Security S2 - CSV escaping', () => {
  it('escapeCsv wraps values containing commas in quotes', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const solution = new VrpSolution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const escapeCsv = (exporter as unknown as { escapeCsv: (s: string) => string }).escapeCsv.bind(exporter);

    expect(escapeCsv('hello, world')).to.equal('"hello, world"');
  });

  it('escapeCsv doubles inner quotes', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const solution = new VrpSolution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const escapeCsv = (exporter as unknown as { escapeCsv: (s: string) => string }).escapeCsv.bind(exporter);

    expect(escapeCsv('say "hello"')).to.equal('"say ""hello"""');
  });

  it('escapeCsv handles newlines', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const problem = new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0);
    const solution = new VrpSolution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const escapeCsv = (exporter as unknown as { escapeCsv: (s: string) => string }).escapeCsv.bind(exporter);

    expect(escapeCsv('line1\nline2')).to.equal('"line1\nline2"');
    expect(escapeCsv('line1\rline2')).to.equal('"line1\rline2"');
  });

  it('CSV output remains parseable with special characters', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot, Main'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new VrpProblem(nodes, customers, vehicles, 0);
    const solution = new VrpSolution(problem, [new Route(1, [1, 2])]);
    solution.calculateSchedule();

    const exporter = new GISExporter(solution, problem);
    const csv = exporter.toCSV();

    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const cols = line.split(',');
      // With proper escaping, the depot name should not inflate column count
      expect(cols.length).to.equal(8);
    }
  });
});

describe('Security S3 - Problem constructor validation', () => {
  it('rejects empty nodes', () => {
    expect(() => new VrpProblem({}, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0)).to.throw('nodes cannot be empty');
  });

  it('rejects empty customers', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
    };
    expect(() => new VrpProblem(nodes, [], [new Vehicle(1, 10)], 0)).to.throw('customers cannot be empty');
  });

  it('rejects empty vehicles', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() => new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [], 0)).to.throw('vehicles cannot be empty');
  });

  it('rejects NaN coordinates', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, NaN, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() => new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0)).to.throw('invalid coordinates');
  });

  it('rejects Infinity coordinates', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, Infinity, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() => new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0)).to.throw('invalid coordinates');
  });

  it('rejects negative coordinates', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, -10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() => new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 0)).to.throw('negative coordinates');
  });

  it('rejects duplicate customer IDs', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() =>
      new VrpProblem(
        nodes,
        [new Customer(1, 1, 2, 50), new Customer(1, 1, 2, 50)],
        [new Vehicle(1, 10)],
        0,
      ),
    ).to.throw('Duplicate customer ID');
  });

  it('rejects duplicate vehicle IDs', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() =>
      new VrpProblem(
        nodes,
        [new Customer(1, 1, 2, 50)],
        [new Vehicle(1, 10), new Vehicle(1, 10)],
        0,
      ),
    ).to.throw('Duplicate vehicle ID');
  });

  it('rejects customer referencing non-existent delivery node', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() =>
      new VrpProblem(nodes, [new Customer(1, 999, 2, 50)], [new Vehicle(1, 10)], 0),
    ).to.throw('non-existent delivery node');
  });

  it('rejects customer referencing non-existent pickup node', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() =>
      new VrpProblem(nodes, [new Customer(1, 1, 999, 50)], [new Vehicle(1, 10)], 0),
    ).to.throw('non-existent pickup node');
  });

  it('rejects depot node ID not present in nodes', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() =>
      new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 10)], 999),
    ).to.throw('Depot node 999 does not exist');
  });

  it('rejects negative processing time', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() =>
      new VrpProblem(nodes, [new Customer(1, 1, 2, -1)], [new Vehicle(1, 10)], 0),
    ).to.throw('negative processingTime');
  });

  it('rejects zero or negative capacity', () => {
    const nodes: Record<number, LocationNode> = {
      0: new LocationNode(0, 0, 0, 'Depot'),
      1: new LocationNode(1, 10, 0, 'D1'),
      2: new LocationNode(2, 20, 0, 'P1'),
    };
    expect(() =>
      new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, 0)], 0),
    ).to.throw('positive capacity');
    expect(() =>
      new VrpProblem(nodes, [new Customer(1, 1, 2, 50)], [new Vehicle(1, -5)], 0),
    ).to.throw('positive capacity');
  });
});

describe('Security S4 - Worker data validation', () => {
  it('isWorkerData rejects non-object input', () => {
    expect(isWorkerData(null)).to.be.false;
    expect(isWorkerData(undefined)).to.be.false;
    expect(isWorkerData('string')).to.be.false;
    expect(isWorkerData(42)).to.be.false;
    expect(isWorkerData([])).to.be.false;
  });

  it('isWorkerData rejects missing fields', () => {
    expect(isWorkerData({})).to.be.false;
    expect(isWorkerData({ nodes: {}, customers: [] })).to.be.false;
    expect(isWorkerData({ nodes: {}, customers: [], vehicles: [], depotNodeId: 0 })).to.be.false;
  });

  it('isWorkerData rejects invalid algorithm type', () => {
    expect(
      isWorkerData({
        nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
        customers: [],
        vehicles: [],
        depotNodeId: 0,
        type: 'INVALID',
        options: {},
      }),
    ).to.be.false;
  });

  it('isWorkerData accepts valid ALNS data', () => {
    expect(
      isWorkerData({
        nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
        customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
        vehicles: [{ id: 1, capacity: 10 }],
        depotNodeId: 0,
        type: 'ALNS',
        options: {},
      }),
    ).to.be.true;
  });

  it('validateWorkerData rejects empty nodes', () => {
    const error = validateWorkerData({
      nodes: {},
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.equal('nodes cannot be empty');
  });

  it('validateWorkerData rejects empty customers', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.equal('customers cannot be empty');
  });

  it('validateWorkerData rejects empty vehicles', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.equal('vehicles cannot be empty');
  });

  it('validateWorkerData rejects missing node reference in customer', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 999, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.include('deliveryNodeId 999 not found');
  });

  it('validateWorkerData rejects non-finite node coordinates', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: NaN, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.include('x must be a finite number');
  });

  it('validateWorkerData rejects duplicate customer IDs', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [
        { id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 },
        { id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 },
      ],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.include('duplicate customer ID');
  });

  it('validateWorkerData rejects duplicate vehicle IDs', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }, { id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.include('duplicate vehicle ID');
  });

  it('validateWorkerData rejects invalid vehicle capacity', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 0 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.include('capacity must be > 0');
  });

  it('validateWorkerData rejects missing depot node', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 999,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.include('depotNodeId 999 not found');
  });

  it('validateWorkerData accepts valid data', () => {
    const error = validateWorkerData({
      nodes: { 0: { id: 0, x: 0, y: 0, name: 'Depot' } },
      customers: [{ id: 1, deliveryNodeId: 0, pickupNodeId: 0, processingTime: 0 }],
      vehicles: [{ id: 1, capacity: 10 }],
      depotNodeId: 0,
      type: 'ALNS',
      options: {},
    });
    expect(error).to.be.null;
  });
});
