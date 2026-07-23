import type { ReactNode } from "react";

export type Column<T> = {
  /** Stable key for the column. */
  key: string;
  header: string;
  /** Fixed column width (px or CSS length); omit to flex. */
  width?: number | string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

/** A lightweight, token-styled data table: a mono uppercase header rule over
 *  hairline-separated rows. Generic over any row with a stable `id`. Used across
 *  the Manage tables (and reusable for Administration). */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty = "Nothing to show yet.",
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="px-2 py-10 text-center text-body-sm text-tertiary-foreground">{empty}</p>;
  }
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-border-default border-b-[0.5px]">
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              className="px-3 py-2 font-departure-mono text-[0.65rem] font-normal uppercase tracking-wide text-tertiary-foreground"
              style={{ width: c.width, textAlign: c.align ?? "left" }}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-border-default border-b-[0.5px] transition-colors hover:bg-transparent-hover">
            {columns.map((c) => (
              <td
                key={c.key}
                className="px-3 py-2.5 text-body-sm text-primary-foreground"
                style={{ width: c.width, textAlign: c.align ?? "left" }}
              >
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
