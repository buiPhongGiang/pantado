import { describe, expect, it } from "vitest";
import { pctS, up } from "../src/ui/num";

describe("percent formatting", () => {
  it("float noise around zero is +0.00%, green", () => {
    expect(pctS(-3.7e-16)).toBe("+0.00%");
    expect(up(-3.7e-16)).toBe("#3DD68C");
    expect(pctS(-0.00004, 2)).toBe("+0.00%");
  });
  it("real moves keep their sign", () => {
    expect(pctS(-0.0123)).toBe("-1.23%");
    expect(up(-0.0123)).toBe("#FF6B6B");
    expect(pctS(0.05, 1)).toBe("+5.0%");
    expect(pctS(null)).toBe("—");
  });
});
