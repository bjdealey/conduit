import type { ReactNode } from "react";
import { Search } from "lucide-react";

/** The standard search field that sits at the top of every list panel (inbox,
 *  users, automations…). Sharing it keeps the control identical across pages, so
 *  the field stays in the same place when a page switches between list and
 *  board/grid layouts. `trailing` renders an optional action (e.g. a "New"
 *  button) beside the field; `constrained` caps the field width and left-aligns it
 *  for full-width board/grid headers (where a full-bleed field would look off). */
export function ListSearch({
  value,
  onChange,
  placeholder,
  trailing,
  constrained,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  trailing?: ReactNode;
  constrained?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-border-default border-b-[0.5px] px-3 py-3">
      <label
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-component px-2.5 py-1.5"
        style={constrained ? { maxWidth: "20rem" } : undefined}
      >
        <Search size={15} strokeWidth={1.8} className="shrink-0 text-tertiary-foreground" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-body-sm text-primary-foreground outline-none placeholder:text-tertiary-foreground"
        />
      </label>
      {trailing}
    </div>
  );
}
