import { VrpError, ValidationError, InfeasibleSolutionError, AlgorithmConvergenceError } from '../src/errors.js';

describe('Typed Errors', () => {
  test('VrpError is an Error', () => {
    const err = new VrpError('base');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('VrpError');
    expect(err.message).toBe('base');
  });

  test('ValidationError is a VrpError', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(VrpError);
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('bad input');
  });

  test('InfeasibleSolutionError is a VrpError', () => {
    const err = new InfeasibleSolutionError('infeasible');
    expect(err).toBeInstanceOf(VrpError);
    expect(err.name).toBe('InfeasibleSolutionError');
  });

  test('AlgorithmConvergenceError is a VrpError', () => {
    const err = new AlgorithmConvergenceError('no convergence');
    expect(err).toBeInstanceOf(VrpError);
    expect(err.name).toBe('AlgorithmConvergenceError');
  });

  test('errors can be caught by base class', () => {
    try {
      throw new ValidationError('test');
    } catch (e) {
      expect(e).toBeInstanceOf(VrpError);
      expect((e as ValidationError).message).toBe('test');
    }
  });
});
