import type { Worker } from 'worker_threads';

import type { Individual } from './brkga.js';
import type { Chromosome } from './decoder.js';

export interface IslandCheckpointMessage {
  type: 'checkpoint';
  islandId: number;
  generation: number;
  population: Individual[];
}

export interface IslandFinishMessage {
  type: 'finish';
  islandId: number;
  bestIndividual: Individual | null;
}

export type IslandWorkerMessage = IslandCheckpointMessage | IslandFinishMessage;

export interface EvolveCommand {
  type: 'evolve';
  generations: number;
}

export interface InjectCommand {
  type: 'inject';
  migrants: Chromosome[];
}

export interface FinishCommand {
  type: 'finish';
}

export type IslandCommand = EvolveCommand | InjectCommand | FinishCommand;

function isIslandWorkerMessage(msg: unknown): msg is IslandWorkerMessage {
  if (typeof msg !== 'object' || msg === null || !('type' in msg)) return false;
  if (typeof msg.type !== 'string') return false;
  if (msg.type === 'checkpoint') {
    return 'islandId' in msg && 'generation' in msg && 'population' in msg;
  }
  if (msg.type === 'finish') return 'islandId' in msg && 'bestIndividual' in msg;
  return false;
}

/**
 * Sends a command to a worker and awaits its response.
 */
export function sendCommand(worker: Worker, cmd: IslandCommand): Promise<IslandWorkerMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (msg: unknown) => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      if (isIslandWorkerMessage(msg)) {
        resolve(msg);
      } else {
        reject(new Error('Invalid worker message'));
      }
    };
    const onError = (err: Error) => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      reject(err);
    };
    const onExit = (code: number) => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      reject(new Error(`Worker exited with code ${code}`));
    };
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    worker.postMessage(cmd);
  });
}
