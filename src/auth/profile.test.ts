import { describe, expect, it } from "vitest";
import { classifyPremium, type SpotifyProfile } from "@/auth/profile";

const profile = (product: string): SpotifyProfile => ({
  id: "user-1",
  display_name: "Test User",
  product,
  country: "FR",
});

describe("classifyPremium", () => {
  it("accepts premium", () => {
    expect(classifyPremium(profile("premium"))).toBe("premium");
  });

  // The SDK refuses to start for all of these, and there is no free fallback.
  it.each(["free", "open", ""])("rejects %s", (product) => {
    expect(classifyPremium(profile(product))).toBe("not-premium");
  });

  it("rejects unrecognised values rather than assuming they work", () => {
    expect(classifyPremium(profile("something_new"))).toBe("not-premium");
  });
});
