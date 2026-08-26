/** A labelled on/off toggle track, for a binary setting that isn't a choice between named options. */
export function Switch({
  checked,
  onChange,
  label,
  sublabel,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}) {
  return (
    <label className={disabled ? "switch-row switch-row-disabled" : "switch-row"}>
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        {sublabel && <span className="switch-sublabel">{sublabel}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={checked ? "switch-track switch-on" : "switch-track"}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
      </button>
    </label>
  );
}
