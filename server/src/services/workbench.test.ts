import { describe, expect, it } from "vitest";
import { normalizeWorkbenchRelativePath } from "./workbench.js";

describe("normalizeWorkbenchRelativePath", () => {
  it("normalizes safe workspace-relative paths", () => {
    expect(normalizeWorkbenchRelativePath(undefined)).toBe("");
    expect(normalizeWorkbenchRelativePath("/src/./components/../App.tsx")).toBe("src/App.tsx");
  });

  it.each(["..", "../secret", "src/../../secret", "C:\\secret", "safe\0secret"])(
    "rejects path escape %s",
    (candidate) => {
      expect(() => normalizeWorkbenchRelativePath(candidate)).toThrow();
    },
  );
});
