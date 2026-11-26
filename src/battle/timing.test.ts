import { describe, expect, it } from 'vitest';
import { capSpeeds } from './timing';

describe('capSpeeds', () => {
  it('is empty for no shots', () => expect(capSpeeds([])).toEqual([]));
  it('leaves a list untouched when speeds only fall', () => {
    expect(capSpeeds([800, 600, 400])).toEqual([800, 600, 400]);
  });
  it('caps a faster later shot at the previous one (Frost Bolt -> Fireball style)', () => {
    expect(capSpeeds([400, 800, 600])).toEqual([400, 400, 400]);
  });
  it('chains the cap: a slow shot slows everything after it', () => {
    expect(capSpeeds([700, 300, 900, 500])).toEqual([700, 300, 300, 300]);
  });
  it('a lone shot is unchanged', () => expect(capSpeeds([650])).toEqual([650]));
});
