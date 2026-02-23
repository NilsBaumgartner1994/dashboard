export type LocationType = {
  latitude: number;
  longitude: number;
};

/**
 * Calculate the great-circle distance between two points on Earth using the Haversine formula.
 * @param selectedLocation Array in the order [longitude, latitude]
 * @param targetLocation Array in the order [longitude, latitude]
 * @returns distance in meters rounded to the nearest integer
 */
export function calculateDistanceInMeter(selectedLocation: [number, number], targetLocation: [number, number]): number {
  if (selectedLocation && targetLocation) {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

    const earthRadiusMeters = 6371000; // Earth's radius in meters
    const lon1 = toRadians(selectedLocation[0]);
    const lat1 = toRadians(selectedLocation[1]);
    const lon2 = toRadians(targetLocation[0]);
    const lat2 = toRadians(targetLocation[1]);

    const deltaLat = lat2 - lat1;
    const deltaLon = lon2 - lon1;

    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = earthRadiusMeters * c; // Distance in meters

    return Math.round(distance);
  }
  return 0;
}
