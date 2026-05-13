/** Base error for all VRP-RPD library errors. */
export class VrpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VrpError';
    Object.setPrototypeOf(this, VrpError.prototype);
  }
}

/** Thrown when problem or solver options fail validation. */
export class ValidationError extends VrpError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/** Thrown when a solution violates hard constraints. */
export class InfeasibleSolutionError extends VrpError {
  constructor(message: string) {
    super(message);
    this.name = 'InfeasibleSolutionError';
    Object.setPrototypeOf(this, InfeasibleSolutionError.prototype);
  }
}

/** Thrown when an algorithm fails to converge. */
export class AlgorithmConvergenceError extends VrpError {
  constructor(message: string) {
    super(message);
    this.name = 'AlgorithmConvergenceError';
    Object.setPrototypeOf(this, AlgorithmConvergenceError.prototype);
  }
}
