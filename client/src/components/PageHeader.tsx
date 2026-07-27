/**
 * Tool-page header, reimplemented as an adapter over the editorial
 * primitives so every caller gets the publication grammar: serif page
 * title, dek instead of an info popover, sans stats. Signature preserved
 * from the old strip header; pages migrate to PageTitle/PageShell directly
 * as they convert.
 */
import type { ReactNode } from "react";
import { PageTitle } from "@/components/editorial";

export function PageHeader({
  title,
  about,
  stats,
  right,
  controls,
  testId,
}: {
  title: string;
  /** one framing sentence; renders as the dek under the title */
  about?: ReactNode;
  /** inline key numbers; render right of the title block */
  stats?: ReactNode;
  right?: ReactNode;
  controls?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="px-5 sm:px-8 mx-auto max-w-[1360px]" data-testid={testId}>
      <PageTitle
        title={title}
        dek={about}
        right={
          stats || right ? (
            <>
              {stats}
              {right}
            </>
          ) : undefined
        }
      />
      {controls && <div className="-mt-1 mb-4 flex flex-wrap items-center gap-3">{controls}</div>}
    </div>
  );
}

/** One inline stat for the title block: label + tabular value. */
export function HeaderStat({
  label,
  value,
  valueClass = "text-ink",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[12.5px] text-ink-secondary">{label}</span>
      <span className={`text-[15px] font-semibold tnum ${valueClass}`}>{value}</span>
    </span>
  );
}
