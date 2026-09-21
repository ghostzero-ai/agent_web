import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  normalizeClockTime,
  TimeWheelPicker,
} from "@/components/tasks/TimeWheelPicker";

describe("TimeWheelPicker", () => {
  it("normalizes valid values and safely falls back for malformed input", () => {
    expect(normalizeClockTime("09:05")).toBe("09:05");
    expect(normalizeClockTime("24:00")).toBe("20:00");
    expect(normalizeClockTime("9:5")).toBe("20:00");
  });

  it("renders a touch-friendly clock button without opening the dialog", () => {
    const html = renderToStaticMarkup(
      <TimeWheelPicker value="08:30" onChange={vi.fn()} />,
    );

    expect(html).toContain("08:30");
    expect(html).toContain("点击滚动选择");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('role="dialog"');
  });
});
