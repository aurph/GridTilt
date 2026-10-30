import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { STATE_GRID } from "@/data/state-grid";
import { statePageLinks, type PublishedStatePage } from "@/lib/state-pages";

/**
 * One named row, "State pages", listing every published state page as a link.
 *
 * Read from the registry (/api/state-pages), never from a list in the client,
 * so a state appears here the day its page is published and not before. The
 * row renders nothing while loading or when the registry is empty: an empty
 * heading would promise pages that do not exist.
 */

export function StatePagesRow({
  lead,
  className = "",
  testId = "state-pages-row",
}: {
  /** Optional sentence before the links, for surfaces that need the context. */
  lead?: string;
  className?: string;
  testId?: string;
}) {
  const { data } = useQuery<PublishedStatePage[]>({ queryKey: ["/api/state-pages"] });
  const links = statePageLinks(data, STATE_GRID);
  if (links.length === 0) return null;
  return (
    <nav aria-label="State pages" className={className} data-testid={testId}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          State pages
        </span>
        {lead && <span className="text-[13px] text-muted-foreground">{lead}</span>}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2" data-testid={`${testId}-list`}>
        {links.map((s) => (
          <li key={s.slug}>
            <Link
              href={s.href}
              className="inline-flex items-center gap-1.5 rounded border border-border bg-card/70 px-3 py-1.5 text-[13px] font-semibold text-foreground no-underline transition-colors hover:border-brand/60 hover:text-brand"
              data-testid={`state-page-link-${s.slug}`}
            >
              {s.name}
              <span className="font-mono text-[11px] font-normal text-muted-foreground/70">{s.code}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
