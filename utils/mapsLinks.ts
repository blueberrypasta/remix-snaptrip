export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return false;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function formatCoordinate(val: number): string {
  return Number(val.toFixed(6)).toString();
}

export function buildDirectionsUrl(lat: number, lng: number): string | null {
  if (!isValidCoordinate(lat, lng)) {
    return null;
  }
  const formattedLat = formatCoordinate(lat);
  const formattedLng = formatCoordinate(lng);

  const params = new URLSearchParams({
    api: '1',
    destination: `${formattedLat},${formattedLng}`,
    travelmode: 'walking',
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildStreetViewUrl(lat: number, lng: number): string | null {
  if (!isValidCoordinate(lat, lng)) {
    return null;
  }
  const formattedLat = formatCoordinate(lat);
  const formattedLng = formatCoordinate(lng);

  const params = new URLSearchParams({
    api: '1',
    map_action: 'pano',
    viewpoint: `${formattedLat},${formattedLng}`,
  });

  return `https://www.google.com/maps/@?${params.toString()}`;
}
