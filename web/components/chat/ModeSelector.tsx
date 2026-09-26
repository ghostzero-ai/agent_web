import {
  coreModeRegistry,
  type CoreModeId,
} from "@/lib/agent/modeRegistry";

type ModeSelectorProps = {
  mode: CoreModeId;
  disabled?: boolean;
  onChange: (mode: CoreModeId) => void;
};

export function ModeSelector({
  mode,
  disabled = false,
  onChange,
}: ModeSelectorProps) {
  const modes = coreModeRegistry.list();
  const activeMode = coreModeRegistry.get(mode);

  return (
    <label className="inline-flex items-center gap-1.5" title={activeMode.purpose}>
      <span className="sr-only">对话模式</span>
      <select
        aria-label="对话模式"
        value={mode}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as CoreModeId)}
        className="max-w-24 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 outline-none transition-colors hover:border-zinc-300 focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600"
      >
        {modes.map((definition) => (
          <option key={definition.id} value={definition.id}>
            {definition.label}
          </option>
        ))}
      </select>
    </label>
  );
}
