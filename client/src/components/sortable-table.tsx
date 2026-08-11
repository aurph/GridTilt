/**
 * One sortable column header for every table in the app.
 *
 * Before this, Equities had a hand-rolled sort header and every other table
 * had inert <th> text. Neither carried aria-sort, so a screen reader could
 * not tell which column ordered the table or which way.
 *
 * The trigger is a real <button>: Tab reaches it, Enter and Space activate
 * it, and the app-wide :focus-visible ring applies. No handler on the <th>.
 */
import { ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { ariaSort, type SortDir } from "@/lib/table-sort";

export function SortableTh({
  label,
  active,
  dir,
  onSort,
  align = "left",
  className = "",
  testId,
  title,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
  align?: "left" | "right";
  className?: string;
  testId?: string;
  /** optional hover explanation of the column */
  title?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={ariaSort(active, dir)}
      className={`font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={onSort}
        title={title}
        // The visible label alone reads as a noun; the button needs to say
        // what activating it does, and what the current order is.
        aria-label={`${label}, ${
          active ? `sorted ${dir === "asc" ? "ascending" : "descending"}` : "not sorted"
        }. Activate to sort.`}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-brand" : ""}`}
        data-testid={testId}
      >
        <span>{label}</span>
        <Icon className="h-2.5 w-2.5 shrink-0" style={{ opacity: active ? 1 : 0.35 }} aria-hidden="true" />
      </button>
    </th>
  );
}
