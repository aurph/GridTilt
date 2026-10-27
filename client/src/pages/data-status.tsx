import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/Freshness";
import { PageHeader, HeaderStat } from "@/components/PageHeader";
import { BRAND, INK, SEMANTIC } from "@/lib/tokens";

// Payload of /api/data-status (server/data-status.ts).
type PublicStatus = "current" | "due" | "behind" | "review_due" | "curated" | "paused";
interface PublicDataset {
  id: string;
  label: string;
  lastUpdated: string | null;
  lastReviewed: string | null;
  cadenceDays: number | null;
  reviewDue: string | null;
  status: PublicStatus;
  statusLabel: string;
  note: string | null;
}
interface PublicDataStatus {
  generatedAt: string;
  datasets: PublicDataset[];
  counts: Record<PublicStatus, number>;
}

// Status reads from shape and weight first; color only reinforces it.
const STATUS_STYLE: Record<PublicStatus, { color: string; filled: boolean }> = {
  current: { color: SEMANTIC.positive, filled: true },
  curated: { color: INK.muted, filled: false },
  due: { color: BRAND.secondary, filled: true },
  review_due: { color: BRAND.secondary, filled: false },
  behind: { color: BRAND.primary, filled: true },
  paused: { color: INK.muted, filled: true },
};

export default function DataStatus() {
  const { data, isLoading, isError, refetch } = useQuery<PublicDataStatus>({ queryKey: ["/api/data-status"] });
  const total = data?.datasets.length ?? 0;
  const current = data ? data.counts.current + data.counts.curated : 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="data-status-page">
      <PageHeader
        title="Data status"
        testId="data-status-header"
        about={
          <>
            Each dataset's newest data date, the last time it was reviewed against its sources, and how
            often it is expected to change. Behind schedule means the update that keeps it current has not
            run for over twice its interval.
          </>
        }
        stats={
          data ? (
            <>
              <HeaderStat label="current" value={`${current} of ${total}`} />
              {data.counts.behind > 0 && <HeaderStat label="behind" value={String(data.counts.behind)} valueClass="text-foreground" />}
            </>
          ) : null
        }
        right={data ? <span className="font-mono text-[11px] text-muted-foreground">checked {data.generatedAt.slice(0, 16).replace("T", " ")} UTC</span> : null}
      />
      <div className="px-4 sm:px-6 py-4 max-w-[1200px] mx-auto w-full">
        {isError ? (
          <ErrorState label="The data status failed to load." onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <Card className="border-card-border p-4 space-y-3" data-testid="data-status-loading">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </Card>
        ) : (
          <Card className="border-card-border overflow-x-auto" data-testid="data-status-table">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="bg-surface-base border-b border-border text-left text-[11px] text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Dataset</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Last updated</th>
                  <th className="px-2 py-2 font-medium">Last reviewed</th>
                  <th className="px-4 py-2 font-medium text-right">Expected</th>
                </tr>
              </thead>
              <tbody>
                {data.datasets.map((d) => (
                  <tr key={d.id} className="border-b border-border/30 last:border-b-0 align-top" data-testid={`data-status-row-${d.id}`}>
                    <td className="px-4 py-2.5 text-foreground">
                      {d.label}
                      {d.note && <div className="text-[11px] text-muted-foreground mt-0.5">{d.note}</div>}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <StatusMark status={d.status} />
                      <span className="ml-1.5" data-testid={`data-status-status-${d.id}`}>
                        {d.statusLabel}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[12px] text-muted-foreground whitespace-nowrap">{d.lastUpdated ?? "not stamped"}</td>
                    <td className="px-2 py-2.5 font-mono text-[12px] text-muted-foreground whitespace-nowrap">
                      {d.lastReviewed ?? "none yet"}
                      {d.reviewDue && <div className="text-[11px]">due {d.reviewDue}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12px] text-muted-foreground whitespace-nowrap">
                      {d.cadenceDays === null ? "as needed" : d.cadenceDays === 1 ? "daily" : `every ${d.cadenceDays} days`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatusMark({ status }: { status: PublicStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" className="inline-block align-middle">
      <circle cx="5" cy="5" r="4" fill={s.filled ? s.color : "none"} stroke={s.color} strokeWidth="1.5" />
    </svg>
  );
}
