import {expect, it} from 'vitest';
import {numericalBoundaryConsumers} from '../fixtures/kernel-gameplay-boundary-consumer.js';

it('runs three numerical policies without gameplay contracts or engines', () => {
  expect(numericalBoundaryConsumers()).toEqual([
    {label: 'Text RPG', raw: 50, final: 37.5, after: 62.5, callerId: 'Text RPG'},
    {label: 'Võ Lâm', raw: 100, final: 80, after: 20, callerId: 'Võ Lâm'},
    {label: 'ARPG', raw: 30, final: 30, after: 70, callerId: 'ARPG'},
  ]);
});
