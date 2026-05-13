import { VrpError, ValidationError, InfeasibleSolutionError, AlgorithmConvergenceError } from '../src/errors.js';
import { expect } from 'chai';

describe('Typed Errors', () => {
  it('VrpError is an Error', () => {
    const err = new VrpError('base');
    expect(err).to.be.an.instanceOf(Error);
    expect(err.name).to.equal('VrpError');
    expect(err.message).to.equal('base');
  });

  it('ValidationError is a VrpError', () => {
    const err = new ValidationError('bad input');
    expect(err).to.be.an.instanceOf(VrpError);
    expect(err.name).to.equal('ValidationError');
    expect(err.message).to.equal('bad input');
  });

  it('InfeasibleSolutionError is a VrpError', () => {
    const err = new InfeasibleSolutionError('infeasible');
    expect(err).to.be.an.instanceOf(VrpError);
    expect(err.name).to.equal('InfeasibleSolutionError');
  });

  it('AlgorithmConvergenceError is a VrpError', () => {
    const err = new AlgorithmConvergenceError('no convergence');
    expect(err).to.be.an.instanceOf(VrpError);
    expect(err.name).to.equal('AlgorithmConvergenceError');
  });

  it('errors can be caught by base class', () => {
    try {
      throw new ValidationError('test');
    } catch (e) {
      expect(e).to.be.an.instanceOf(VrpError);
      expect((e as ValidationError).message).to.equal('test');
    }
  });
});
