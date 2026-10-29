import { describe, expect, it } from "vitest";
import { directionsUrl, gymLine, gymPlace } from "./gyms";

const base = { name: "Cult Kalyani Nagar", area: "Kalyani Nagar", city: "Pune", lat: null, lng: null, maps_url: null };

describe("gym text", () => {
  it("joins what is known and skips what is not", () => {
    expect(gymPlace(base)).toBe("Kalyani Nagar · Pune");
    expect(gymPlace({ area: null, city: "Pune" })).toBe("Pune");
    expect(gymLine({ chain: "Cult", area: "Kalyani Nagar", city: "Pune" })).toBe("Cult · Kalyani Nagar · Pune");
    expect(gymLine({ chain: null, area: null, city: null })).toBe("");
  });
});

describe("directionsUrl", () => {
  it("prefers coordinates", () => {
    expect(directionsUrl({ ...base, lat: 18.5492421, lng: 73.9060673, maps_url: "https://maps.app.goo.gl/x" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=18.5492421,73.9060673",
    );
  });
  it("falls back to the stored link", () => {
    expect(directionsUrl({ ...base, maps_url: "https://maps.app.goo.gl/x" })).toBe("https://maps.app.goo.gl/x");
  });
  it("falls back to a search for the name and place", () => {
    expect(directionsUrl(base)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Cult%20Kalyani%20Nagar%2C%20Kalyani%20Nagar%2C%20Pune",
    );
  });
  it("does not treat a coordinate of 0 as missing", () => {
    expect(directionsUrl({ ...base, lat: 0, lng: 0 })).toContain("destination=0,0");
  });
});
