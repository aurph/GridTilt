/**
 * /states: the index of published state pages.
 *
 * One row per state the registry publishes (server/data/state-pages.json,
 * served at /api/state-pages), never a list kept here. Each row shows what
 * the registry holds for that state: how many dated decisions, the next
 * public date, and when the rows were last checked against the documents.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { SectionChips } from "@/components/section-chips";
import { Skeleton } from "@/components/ui/skeleton";
import { STATE_GRID } from "@/data/state-grid";
import { sectionById } from "@/lib/sections";
import { longDay, oldestReview, stateIndexRows, type PublishedStatePage, type StateIndexRow } from "@/lib/state-pages";
import { SectionStatement } from "@/pages/section-page";

function nextDateText(row: StateIndexRow): string {
  if (!row.nextDate) return "No public date listed";
  const { date, through } = row.nextDate;
  return through && through !== date ? `${longDay(date)} to ${longDay(through)}` : longDay(date);
}

/** The covered states as a sentence: "Maryland, Texas and Virginia". */
export function namesSentence(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function StatesIndex({ rows }: { rows: StateIndexRow[] }) {
  const reviewed = oldestReview(rows);
  return (
    <>
      <ul className="divide-y divide-dashed divide-border border-y border-dashed border-border" data-testid="states-rows">
        {rows.map((row) => (
          <li key={row.slug}>
            <Link
              href={row.href}
              className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-1 py-4 no-underline sm:grid-cols-[minmax(160px,1.1fr)_minmax(110px,0.7fr)_2fr_auto]"
              data-testid={`states-row-${row.slug}`}
            >
              <span className="flex items-baseline gap-2">
                <span className="text-[17px] font-bold tracking-tight text-foreground group-hover:text-brand">{row.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground/70">{row.code}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-brand sm:order-last" aria-hidden />
              <span className="col-span-2 text-[13px] text-muted-foreground sm:col-span-1" data-testid={`states-decisions-${row.slug}`}>
                {row.decisions === null ? (
                  "Decisions on the page"
                ) : (
                  <>
                    <span className="font-mono text-[15px] font-bold text-foreground tabular-nums">{row.decisions}</span>{" "}
                    dated {row.decisions === 1 ? "decision" : "decisions"}
                  </>
                )}
              </span>
              <span className="col-span-2 text-[13px] leading-snug text-muted-foreground sm:col-span-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Next public date
                </span>
                <span className="text-foreground">{nextDateText(row)}</span>
                {row.nextDate && <span className="block text-muted-foreground">{row.nextDate.what}</span>}
                {row.reviewed && (
                  <span className="mt-1 block text-[12px] text-muted-foreground/70">Last reviewed {longDay(row.reviewed)}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground" data-testid="states-coverage">
        Covered: {namesSentence(rows.map((r) => r.name))}. Each state is reviewed against its documents every 30 days
        {reviewed ? `; last review ${longDay(reviewed)}` : ""}.
      </p>
    </>
  );
}

export default function States() {
  const section = sectionById("states");
  const { data, isLoading, isError, refetch } = useQuery<PublishedStatePage[]>({ queryKey: ["/api/state-pages"] });
  const rows = stateIndexRows(data, STATE_GRID);
  return (
    <div data-testid="states-page">
      <SectionStatement statement={section.statement} dek={section.dek} />
      <div className="mx-auto w-full max-w-[1000px] px-4 pb-12 sm:px-6">
        {rows.length > 0 && (
          <div className="mb-5">
            <SectionChips
              chips={rows.map((r) => ({ id: r.slug, label: r.name, href: r.href }))}
              active=""
              label="Published states"
              testId="states-chips"
            />
          </div>
        )}
        {isLoading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <span className="sr-only">Loading the state pages</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[76px] w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState label="The list of state pages could not be loaded." onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="states-empty">
            No state page is published right now.
          </p>
        ) : (
          <StatesIndex rows={rows} />
        )}
      </div>
    </div>
  );
}
