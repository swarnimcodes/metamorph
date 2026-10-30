import { describe, expect, it } from "vitest";
import deletion from "../../public/account-deletion.html?raw";
import privacy from "../../public/privacy.html?raw";
import { ACCOUNT_DELETION_URL, PRIVACY_URL } from "./links";

// These pages are public and Google Play links to them. Nothing half-written may ship.
describe.each([
  ["privacy.html", privacy],
  ["account-deletion.html", deletion],
])("%s", (_name, html) => {
  it("is a finished page, not a draft", () => {
    expect(html).not.toMatch(/\bDRAFT\b|\[CONFIRM|TODO|lorem ipsum/i);
  });
  it("has a title and works on a phone", () => {
    expect(html).toMatch(/<title>[^<]{5,}<\/title>/);
    expect(html).toContain('name="viewport"');
  });
  it("shows the contact address in plain text, not for Cloudflare to rewrite into '[email protected]'", () => {
    expect(html).toMatch(/<!--email_off-->[\s\S]*swarnim335@gmail\.com[\s\S]*<!--\/email_off-->/);
  });
});

describe("the privacy policy", () => {
  it("names who runs it and how to delete an account", () => {
    expect(privacy).toContain("Swarnim Barapatre");
    expect(privacy).toContain('href="/account-deletion.html"');
  });
  it("matches what the app really asks for: internet access and nothing else sensitive", () => {
    expect(privacy).toMatch(/only for internet access/);
    expect(privacy).toMatch(/does not keep backups/);
    expect(privacy).not.toMatch(/location permission|camera permission/i);
  });
});

describe("the links the app uses", () => {
  it("are absolute https addresses on the site, and point at pages that exist", () => {
    for (const url of [PRIVACY_URL, ACCOUNT_DELETION_URL]) expect(url).toMatch(/^https:\/\/metamorph\.smarniw\.com\/[a-z-]+\.html$/);
    expect(privacy.length).toBeGreaterThan(500);
    expect(deletion.length).toBeGreaterThan(500);
  });
});
