import {canTraverse,type MapPoint,type Walkability} from './grid-geometry.js';


export const distance = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function inRange(grid: Walkability, a: MapPoint, b: MapPoint, range: number): boolean {
  return distance(a, b) <= range && canTraverse(grid, a, b);
}
