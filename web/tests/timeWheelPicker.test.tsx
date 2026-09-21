import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  cyclicIndex,
  middleWheelIndex,
  normalizeClockTime,
  TimeWheelPicker,
} from "@/components/tasks/TimeWheelPicker";

describe("TimeWheelPicker", () => {
  it("normalizes valid values and safely falls back for malformed input", () => {
    expect(normalizeClockTime("09:05")).toBe("09:05");
    expect(normalizeClockTime("24:00")).toBe("20:00");
    expect(normalizeClockTime("9:5")).toBe("20:00");
  });

  it("wraps wheel indexes in both directions and recenters them", () => {
    expect(cyclicIndex(24, 24)).toBe(0);
    expect(cyclicIndex(-1, 24)).toBe(23);
    expect(cyclicIndex(61, 60)).toBe(1);
    expect(middleWheelIndex(0, 24)).toBe(48);
    expect(middleWheelIndex(23, 24)).toBe(71);
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
