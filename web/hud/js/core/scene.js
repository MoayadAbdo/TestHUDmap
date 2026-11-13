import { relativeTo } from './ar.js';

/** The route, stops and base around the walker, in metres forward/right, for the ground arrows, pins and mini-map. */
export function buildScene({ world, position, heading, isVisited = () => false, target, path = [] }) {
  const rel = (at) => relativeTo(position.at, heading, at, world.r);
  return {
    route: world.route.map((p) => rel(p.at)),
    stops: world.stops.map((s, i) => ({
      id: s.id,
      name: s.name,
      visited: isVisited(i),
      isTarget: !target.isBase && s.id === target.id,
      ...rel(s.at),
    })),
    base: { ...rel(world.base.at), isTarget: Boolean(target.isBase) },
    marsPerMetre: world.marsPerFrameMetre,
    path: path.map((p) => ({ ...rel(p.at), d: p.d, steep: p.steep })),   // the walking path, every 0.5 m
  };
}
