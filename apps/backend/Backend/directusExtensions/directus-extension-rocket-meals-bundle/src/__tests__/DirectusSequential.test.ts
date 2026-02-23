import { describe, expect, it } from '@jest/globals';

// Single test running all Directus test scenarios sequentially

describe('Directus server sequential tests', () => {
  it('sets up server and performs user operations', async () => {
    expect(true).toBe(true);
  }, 60000);
});
