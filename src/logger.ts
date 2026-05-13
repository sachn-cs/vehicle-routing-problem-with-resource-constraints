/** Minimal logger interface for algorithm progress reporting. */
export interface Logger {
  log(message: string): void;
}

/** Default no-op logger to eliminate side effects during library use. */
export const defaultLogger: Logger = {
  log: () => void 0,
};
