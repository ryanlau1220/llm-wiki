import { describe, expect, test } from "bun:test";

import { shouldIgnoreSidebarShortcut } from "./Sidebar";

describe("sidebar keyboard shortcut guard", () => {
  test("does not capture Ctrl+B from editable controls", () => {
    expect(shouldIgnoreSidebarShortcut({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreSidebarShortcut({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(
      true,
    );
    expect(
      shouldIgnoreSidebarShortcut({
        tagName: "DIV",
        isContentEditable: true,
      } as unknown as EventTarget),
    ).toBe(true);
  });

  test("allows the shortcut from non-editable UI", () => {
    expect(shouldIgnoreSidebarShortcut({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(
      false,
    );
  });
});
