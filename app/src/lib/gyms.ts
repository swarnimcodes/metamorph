import type { Gym } from "../api/types";

/** "Kalyani Nagar · Pune": where a gym is, for the second line under its name. */
export const gymPlace = (g: Pick<Gym, "area" | "city">): string => [g.area, g.city].filter(Boolean).join(" · ");

/** The line under a gym's name in lists: chain first, then where it is. */
export const gymLine = (g: Pick<Gym, "chain" | "area" | "city">): string =>
  [g.chain, gymPlace(g)].filter(Boolean).join(" · ");

/**
 * Where "Directions" should open. Coordinates give turn-by-turn from the current location; failing
 * that the stored maps link; failing that a maps search for the gym's name and place.
 */
export function directionsUrl(g: Pick<Gym, "name" | "area" | "city" | "lat" | "lng" | "maps_url">): string {
  if (g.lat !== null && g.lng !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}`;
  }
  if (g.maps_url) return g.maps_url;
  const query = [g.name, g.area, g.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
