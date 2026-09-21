"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type UIEvent,
} from "react";

const ROW_HEIGHT = 48;
const VISIBLE_ROWS = 5;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function normalizeClockTime(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? `${match[1]}:${match[2]}` : "20:00";
}

type WheelColumnProps = {
  label: string;
  values: readonly number[];
  selected: number;
  onSelect(value: number): void;
};

function WheelColumn({ label, values, selected, onSelect }: WheelColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: selected * ROW_HEIGHT,
      behavior: "auto",
    });
  }, [selected]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const settle = (event: UIEvent<HTMLDivElement>) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    const target = event.currentTarget;
    settleTimer.current = setTimeout(() => {
      const index = Math.max(
        0,
        Math.min(values.length - 1, Math.round(target.scrollTop / ROW_HEIGHT)),
      );
      target.scrollTo({ top: index * ROW_HEIGHT, behavior: "smooth" });
      onSelect(values[index]);
    }, 80);
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="relative mx-auto max-w-28 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-12 -translate-y-1/2 rounded-xl border-y border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-950/50"
          aria-hidden="true"
        />
        <div
          className="task-time-wheel relative z-20 overflow-y-auto overscroll-contain"
          style={{
            height: ROW_HEIGHT * VISIBLE_ROWS,
            paddingBlock: ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2),
            scrollSnapType: "y mandatory",
          }}
          ref={scrollRef}
          role="listbox"
          aria-label={label}
          tabIndex={0}
          onScroll={settle}
          onKeyDown={(event) => {
            const currentIndex = values.indexOf(selected);
            const nextIndex =
              event.key === "ArrowDown"
                ? Math.min(values.length - 1, currentIndex + 1)
                : event.key === "ArrowUp"
                  ? Math.max(0, currentIndex - 1)
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? values.length - 1
                      : null;
            if (nextIndex === null) return;
            event.preventDefault();
            onSelect(values[nextIndex]);
          }}
        >
          {values.map((value) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={selected === value}
              className={`flex h-12 w-full snap-center items-center justify-center text-2xl tabular-nums transition-all ${
                selected === value
                  ? "font-semibold text-zinc-950 dark:text-zinc-50"
                  : "text-zinc-400 dark:text-zinc-600"
              }`}
              onClick={() => {
                onSelect(value);
                scrollRef.current?.scrollTo({
                  top: value * ROW_HEIGHT,
                  behavior: "smooth",
                });
              }}
            >
              {pad(value)}
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-20 bg-gradient-to-b from-white via-white/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-20 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-zinc-950 dark:via-zinc-950/80" />
      </div>
      <p className="mt-2 text-center text-xs font-medium text-zinc-500">{label}</p>
    </div>
  );
}

type TimeWheelPickerProps = {
  value: string;
  onChange(value: string): void;
  label?: string;
};

export function TimeWheelPicker({
  value,
  onChange,
  label = "提醒时间",
}: TimeWheelPickerProps) {
  const normalized = normalizeClockTime(value);
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(Number(normalized.slice(0, 2)));
  const [draftMinute, setDraftMinute] = useState(Number(normalized.slice(3, 5)));
  const dialogTitleId = useId();

  const openPicker = () => {
    const current = normalizeClockTime(value);
    setDraftHour(Number(current.slice(0, 2)));
    setDraftMinute(Number(current.slice(3, 5)));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div>
      <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
        className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-zinc-300 bg-white px-4 py-3 text-left outline-none transition hover:border-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-blue-500 dark:focus:ring-blue-950"
      >
        <span className="text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
          {normalized}
        </span>
        <span className="text-xs text-zinc-500">点击滚动选择</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="w-full rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:max-w-sm sm:rounded-3xl dark:bg-zinc-950"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-zinc-500"
              >
                取消
              </button>
              <h2 id={dialogTitleId} className="font-semibold text-zinc-950 dark:text-zinc-50">
                选择提醒时间
              </h2>
              <button
                type="button"
                onClick={() => {
                  onChange(`${pad(draftHour)}:${pad(draftMinute)}`);
                  setOpen(false);
                }}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-blue-600 dark:text-blue-400"
              >
                确定
              </button>
            </div>

            <div className="relative mt-3 flex items-center gap-3 px-6">
              <WheelColumn
                label="时"
                values={HOURS}
                selected={draftHour}
                onSelect={setDraftHour}
              />
              <span className="relative z-40 -mt-7 text-2xl font-semibold text-zinc-400">:</span>
              <WheelColumn
                label="分"
                values={MINUTES}
                selected={draftMinute}
                onSelect={setDraftMinute}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
