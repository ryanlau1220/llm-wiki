import { EventEmitter } from "node:events";

export const sseEmitter = new EventEmitter();
// Max listeners limit can be raised if we expect many concurrent tabs open.
sseEmitter.setMaxListeners(100);
