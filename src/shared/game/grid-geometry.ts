// Source map pixels have a bottom-left origin; no Three.js/DOM dependencies.
export interface Walkability {
  cellSize: number;
  columns: number;
  rows: number;
  cells: readonly string[];
}


export interface MapPoint { x: number; y: number }


export function isWalkable(grid: Walkability, point: MapPoint): boolean {
  const x = Math.floor(point.x / grid.cellSize);
  const y = Math.floor(point.y / grid.cellSize);
  return x >= 0 && y >= 0 && x < grid.columns && y < grid.rows && grid.cells[y]?.[x] === '1';
}


// Source-inspired grid line-of-sight, with exact cell-boundary traversal rather
// than distance sampling. A corner crossing requires both adjacent cells (the
// JX IsCanMove rule); smoothing/movement must use the same collision contract.
export function canTraverse(grid: Walkability, from: MapPoint, to: MapPoint): boolean {
  if (![from.x, from.y, to.x, to.y, grid.cellSize].every(Number.isFinite)
    || grid.cellSize <= 0 || !isWalkable(grid, from) || !isWalkable(grid, to)) return false;
  let x = Math.floor(from.x / grid.cellSize);
  let y = Math.floor(from.y / grid.cellSize);
  const endX = Math.floor(to.x / grid.cellSize);
  const endY = Math.floor(to.y / grid.cellSize);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : grid.cellSize / Math.abs(dx);
  const deltaY = dy === 0 ? Infinity : grid.cellSize / Math.abs(dy);
  let boundaryX = dx === 0 ? Infinity : ((x + (sx > 0 ? 1 : 0)) * grid.cellSize - from.x) / dx;
  let boundaryY = dy === 0 ? Infinity : ((y + (sy > 0 ? 1 : 0)) * grid.cellSize - from.y) / dy;
  const open = (cx: number, cy: number) => cx >= 0 && cy >= 0
    && cx < grid.columns && cy < grid.rows && grid.cells[cy]?.[cx] === '1';
  while (x !== endX || y !== endY) {
    // Do not cross past an endpoint that lies exactly on a negative boundary.
    const tx = x === endX ? Infinity : boundaryX;
    const ty = y === endY ? Infinity : boundaryY;
    if (Math.abs(tx - ty) <= 1e-12) {
      if (!open(x + sx, y) || !open(x, y + sy)) return false;
      x += sx;
      y += sy;
      boundaryX += deltaX;
      boundaryY += deltaY;
    } else if (tx < ty) {
      x += sx;
      boundaryX += deltaX;
    } else {
      y += sy;
      boundaryY += deltaY;
    }
    if (!open(x, y)) return false;
  }
  return true;
}
