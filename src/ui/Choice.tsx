/**
 * A segmented control. One row, one obvious current value.
 *
 * Shared by Settings and the in-game pause menu so the two never drift into
 * looking like different controls for the same setting.
 */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label?: (v: T) => string;
  /** Options that can't be picked yet. They still render, greyed out. */
  disabled?: (v: T) => boolean;
}) {
  return (
    <div className="choice">
      {options.map((o) => {
        const isDisabled = disabled?.(o) ?? false;
        return (
          <button
            key={o}
            className={
              o === value ? "choice-option active" : "choice-option"
            }
            aria-pressed={o === value}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              onChange(o);
            }}
          >
            {label ? label(o) : o}
          </button>
        );
      })}
    </div>
  );
}
