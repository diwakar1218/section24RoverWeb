import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

export const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
export const googleMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID";
let configured = false;
const authListeners = new Set<() => void>();
let authInstalled = false;

export function observeMapAuthorizationFailure(listener: () => void) {
  authListeners.add(listener);
  if (!authInstalled) {
    const host = window as Window & { gm_authFailure?: () => void };
    const previous = host.gm_authFailure;
    host.gm_authFailure = () => {
      for (const notify of authListeners) notify();
      previous?.();
    };
    authInstalled = true;
  }
  return () => { authListeners.delete(listener); };
}

export async function loadGoogleMaps() {
  if (!googleMapsKey) throw new Error("Google Maps API key is not configured.");
  if (!configured) {
    setOptions({ key: googleMapsKey, v: "quarterly", region: "IN" });
    configured = true;
  }
  const [maps, markers] = await Promise.all([importLibrary("maps"), importLibrary("marker")]);
  return { maps, markers };
}
export async function loadGoogleGeocoder() {
  await loadGoogleMaps();
  const library=await importLibrary("geocoding") as google.maps.GeocodingLibrary;
  return new library.Geocoder();
}
