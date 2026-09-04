import { describe, expect, it } from "vitest";
import { resolveCivilizationChatHref } from "./civilization-chat-links";

describe("resolveCivilizationChatHref", () => {
  it("turns loopback Paperclip task links into site-relative links", () => {
    expect(resolveCivilizationChatHref("http://127.0.0.1:3100/OFFAAA/issues/OFFAAA-8#document-deploy"))
      .toBe("/OFFAAA/issues/OFFAAA-8#document-deploy");
  });

  it("keeps genuine external and non-Paperclip loopback URLs unchanged", () => {
    expect(resolveCivilizationChatHref("https://github.com/paperclipai/paperclip/issues/1"))
      .toBe("https://github.com/paperclipai/paperclip/issues/1");
    expect(resolveCivilizationChatHref("http://127.0.0.1:5173/preview"))
      .toBe("http://127.0.0.1:5173/preview");
  });
});
