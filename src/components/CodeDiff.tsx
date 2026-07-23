import { FileCode } from "lucide-react";
import type { CodeDiffLine } from "../data/types";

const CHANGE_BG: Record<NonNullable<CodeDiffLine["change"]>, string> = {
  add: "var(--grass-a3)",
  del: "var(--tomato-a3)",
};
const GUTTER: Record<NonNullable<CodeDiffLine["change"]>, string> = {
  add: "var(--grass-9)",
  del: "var(--tomato-9)",
};

/** Inline code diff card (as shown under the "Finding" activity event). */
export function CodeDiff({ file, lines }: { file: string; lines: CodeDiffLine[] }) {
  return (
    <div className="overflow-hidden rounded-lg border-border-default border-[0.5px]">
      <div className="flex items-center gap-2 border-border-default border-b-[0.5px] bg-component px-3 py-2">
        <FileCode size={14} strokeWidth={1.8} className="shrink-0 text-secondary-foreground" />
        <span className="font-departure-mono text-[0.72rem] text-secondary-foreground">{file}</span>
        <button
          type="button"
          className="focusable ml-auto rounded-md px-2 py-0.5 text-body-sm text-tertiary-foreground transition-colors hover:bg-transparent-hover hover:text-primary-foreground"
        >
          Open
        </button>
      </div>
      <pre className="scrollbar-none overflow-x-auto py-2 font-departure-mono text-[0.72rem] leading-5">
        {lines.map((line) => (
          <div
            key={line.n}
            className="flex"
            style={{ background: line.change ? CHANGE_BG[line.change] : "transparent" }}
          >
            <span
              className="w-9 shrink-0 select-none pr-2 text-right"
              style={{ color: line.change ? GUTTER[line.change] : "var(--color-tertiary-foreground)" }}
            >
              {line.n}
            </span>
            <code className="pr-4 text-primary-foreground" style={{ whiteSpace: "pre" }}>
              {line.text || " "}
            </code>
          </div>
        ))}
      </pre>
    </div>
  );
}
