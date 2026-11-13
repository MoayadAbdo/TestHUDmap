// Shared by the astronaut side (live.js) and Ground Control (gc.js).
import { turnServers } from "./turn.js";

export const PEER_PREFIX = "marswalkhud-";
const STUN = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
export const ICE = { iceServers: [...STUN, ...turnServers({ location, history, storage: localStorage })] };
