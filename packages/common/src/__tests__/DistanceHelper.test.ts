import { calculateDistanceInMeter } from 'repo-depkit-common';

describe('calculateDistanceInMeter', () => {
  it('returns a precise distance for long ranges', () => {
    const berlin: [number, number] = [13.405, 52.52];
    const losAngeles: [number, number] = [-118.2437, 34.0522];

    const distance = calculateDistanceInMeter(berlin, losAngeles);
    const expected = 9309675; // approximate distance in meters
    const tolerance = 1000; // allow 1 km difference

    expect(Math.abs(distance - expected)).toBeLessThanOrEqual(tolerance);
  });
});
