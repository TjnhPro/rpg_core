import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as api from '../../src/damage/damage-core.js';
import {DEFAULT_DEFENSE_SETTINGS} from '../../src/contracts/defense-settings.js';
// @ts-expect-error Input/observation harness, no historical implementation.
import {observeDamage, damageInput, combat, setting} from '../fixtures/damage-parity-scenarios.mjs';

const golden = JSON.parse(readFileSync(new URL('../fixtures/damage-parity-golden.json', import.meta.url), 'utf8'));
const observed = observeDamage(api, DEFAULT_DEFENSE_SETTINGS);
describe('accepted v2.0.4 Damage oracle', () => {
  it('pins the accepted source blob and the complete scenario inventory', () => {
    expect(golden.revision).toBe('7443ff8e897ce61a4216d5386ec7e72310d352c3');
    for (const [file, hash] of Object.entries(golden.sources)) {
      const source = execFileSync('git', ['show', `${golden.revision}:${file}`]);
      expect(createHash('sha256').update(source).digest('hex')).toBe(hash);
    }
    expect(observed.map((s: {name: string}) => s.name)).toEqual(golden.scenarios.map((s: {name: string}) => s.name));
  });
  for (const [index, scenario] of golden.scenarios.entries()) it(`${index}: ${scenario.name}`, () => {
    expect(observed[index]).toStrictEqual(scenario);
  });
  it('preserves nested object keys, original contributions, last duplicate and item aliases', () => {
    const input = damageInput(), first = combat(), last = {...first}, option = {id: 'x', value: 2};
    input.flatModifiers = [first, last]; input.options = [option]; input.settings.modifiers = [setting({source: 'item'})];
    const result = api.calculateDamage(input);
    expect(Object.keys(result)).toEqual(['entities','event','b0','b1','critical','beforeDefense','defense','finalDamage']);
    expect(Object.keys(result.b0)).toEqual(['base','scaling','flat','flatModifiers','raw']);
    expect(Object.keys(result.b1)).toEqual(['modifiers','criticalBonus','totalBonus']);
    expect(result.b0.flatModifiers).toHaveLength(1);
    expect(result.b0.flatModifiers[0]).toBe(last);
    expect(result.b1.modifiers[0]!.sources[0]).toBe(option);
    expect(result.b1.modifiers[0]!.sources).not.toBe(input.options);
    option.value = 99; last.value = 9;
    expect(result.b1.modifiers[0]!.sources[0]!.value).toBe(99);
    expect(result.b0.flatModifiers[0]!.value).toBe(9);
    expect(result.b0.flat).toBe(5);
  });
  it.each(['scaling', 'flat', 'option', 'critical', 'dodge'])('preserves the thrown object at %s', point => {
    const input = damageInput(), error = {point}, fail = () => {throw error;};
    if (point === 'scaling') Object.defineProperty(input.sources, 'str', {get: fail});
    if (point === 'flat') Object.defineProperty(input.definition, 'flat', {get: fail});
    if (point === 'option') {input.settings.modifiers = [setting({source:'item'})]; input.options = [{id:'x', get value() {return fail();}}];}
    if (point === 'critical') input.roll = fail;
    if (point === 'dodge') {
      input.context.defender = {source:{id:'a'},target:{id:'b'},mechanic:'direct_hit',dodgeChance:.5};
      input.defenseConfig = {revision:1,settings:structuredClone(DEFAULT_DEFENSE_SETTINGS)}; input.dodgeRoll = fail;
    }
    let caught: unknown; try {api.calculateDamage(input);} catch (e) {caught = e;}
    expect(caught).toBe(error);
  });
});
