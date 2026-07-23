import type { ReactNode } from "react";
import { Search } from "lucide-react";

/** The standard search field that sits at the top of every list panel (inbox,
 *  users, automations…). Sharing it keeps the control identical across pages.
 *  `trailing` renders an optional action (e.g. a "New" button) beside the field. */
export function ListSearch({
  value,
  onChange,
  placeholder,
  trailing,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-border-default border-b-[0.5px] px-3 py-3">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-component px-2.5 py-1.5">
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
