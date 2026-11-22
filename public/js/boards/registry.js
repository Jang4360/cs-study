/**
 * Board registry mapping board.type -> board module.
 * Unsupported types gracefully fall back to the sources board.
 */
import * as requestFlowBoard from './request-flow.js';
import * as sourcesBoard from './sources.js';
import * as terminalBoard from './terminal.js';

const REGISTRY = {
  'request-flow': requestFlowBoard,
  terminal: terminalBoard,
  sources: sourcesBoard,
};

export function getBoardModule(type) {
  return REGISTRY[type] || sourcesBoard;
}
