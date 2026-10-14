import {expect, it} from 'vitest';
import {canTraverse, isWalkable, type Walkability} from '../../src/spatial/grid-geometry.js';
import {distance, inRange} from '../../src/spatial/range.js';

const grid = (cells = ['111', '111', '111']): Walkability => ({cellSize: 10, columns: 3, rows: 3, cells});

it('blocks diagonal corner cutting when either adjacent cell is closed', () => {
  const from = {x: 5, y: 5}, to = {x: 15, y: 15};
  expect(canTraverse(grid(), from, to)).toBe(true);
  expect(canTraverse(grid(['101', '111', '111']), from, to)).toBe(false);
  expect(canTraverse(grid(['111', '011', '111']), from, to)).toBe(false);
});

it('stops at exact negative-direction boundaries without entering the cell behind the endpoint', () => {
  const g = grid(['011', '111', '111']);
  expect(canTraverse(g, {x: 25, y: 5}, {x: 10, y: 5})).toBe(true);
  expect(canTraverse(g, {x: 25, y: 5}, {x: 9.99, y: 5})).toBe(false);
  expect(isWalkable(g, {x: 30, y: 5})).toBe(false);
  expect(isWalkable(g, {x: -.01, y: 5})).toBe(false);
});

it('requires walkable endpoints even for zero distance, and rejects invalid traversal coordinates/cell size', () => {
  const p = {x: 5, y: 5};
  expect(canTraverse(grid(), p, p)).toBe(true);
  expect(canTraverse(grid(['011', '111', '111']), p, p)).toBe(false);
  expect(canTraverse(grid(), p, {x: NaN, y: 5})).toBe(false);
  expect(canTraverse({...grid(), cellSize: 0}, p, p)).toBe(false);
});

it('includes the exact range boundary but requires unobstructed traversal', () => {
  const from = {x: 5, y: 5}, to = {x: 25, y: 5};
  expect(distance(from, to)).toBe(20);
  expect(inRange(grid(), from, to, 20)).toBe(true);
  expect(inRange(grid(), from, to, 19.99)).toBe(false);
  expect(inRange(grid(['101', '111', '111']), from, to, 20)).toBe(false);
});
