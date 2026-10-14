
// Source map pixels have a bottom-left origin; no Three.js/DOM dependencies.
export interface Walkability {
  cellSize: number;
  columns: number;
  rows: number;
  cells: readonly string[];
}



export interface MapPoint { x: number; y: number }
