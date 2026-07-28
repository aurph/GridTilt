/**
 * Compact tool-page header: one strip, data-first, no splash. Replaces the
 * old hero blocks (oversized mono title, paragraph, grid-bg pattern). The
 * page description is not lost - it demotes into an info popover next to
 * the title, same pattern the Power map uses for its threshold note.
 *
 * Anatomy: [title (i)] [inline stats] .............. [right: badges, AsOf]
 *          [controls row: tabs / toggles]                       (optional)
 */
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function PageHeader({
  title,
  about,
  stats,
  right,
  controls,
  testId,
}: {
  title: string;
  /** the demoted description; renders in an info popover */
  about?: ReactNode;
  /** inline key numbers next to the title (keep it to 1-3 mono items) */
  stats?: ReactNode;
  right?: ReactNode;
  controls?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="border-b border-border px-4 sm:px-6 py-3" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1.5">
          <h1 className="text-sm font-semibold text-foreground tracking-tight">{title}</h1>
          {about && (
            <UITooltip>
              <TooltipTrigger asChild>
                <button
                  className="text-muted-foreground/60 hover:text-foreground transition-colors"
                  aria-label={`About ${title}`}
                  data-testid={testId ? `${testId}-about` : undefined}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md p-3">
                <div className="text-xs leading-relaxed">{about}</div>
              </TooltipContent>
            </UITooltip>
          )}
        </span>
        {stats}
        {right && <div className="ml-auto flex flex-wrap items-center gap-3">{right}</div>}
      </div>
      {controls && <div className="mt-2.5 flex flex-wrap items-center gap-3">{controls}</div>}
    </div>
  );
}

/** One inline stat for the header strip: label + mono value. */
export function HeaderStat({ label, value, valueClass = "text-brand-2" }: { label: string; value: string; valueClass?: string }) {
  return (
    <span className="flex items-baseline gap-2 font-mono">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${valueClass}`}>{value}</span>
    </span>
  );
}
