import { Link } from "wouter";

/**
 * Site colophon: mission, index of references, and provenance policy.
 * Replaces the old footer chrome; double rule on top closes the page.
 */
export function Colophon() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t-2 border-rule-strong" data-testid="colophon">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8 py-10">
        <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-[42ch]">
            <p className="font-serif text-[17px] leading-snug text-ink">
              Grid<em className="italic text-brand-ink">Tilt</em>
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
              Tracking the AI infrastructure buildout.
            </p>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-ink mb-2.5">Reference</p>
            <ul className="space-y-1.5 text-[13px]">
              <li><Link href="/compute-frontier/methodology" className="text-ink-secondary hover:text-brand-ink no-underline">Methodology</Link></li>
              <li><Link href="/blog" className="text-ink-secondary hover:text-brand-ink no-underline">Analysis archive</Link></li>
              <li><Link href="/compute-frontier" className="text-ink-secondary hover:text-brand-ink no-underline">Cluster registry</Link></li>
              <li><Link href="/power-map?tab=queue" className="text-ink-secondary hover:text-brand-ink no-underline">Interconnection queue</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-ink mb-2.5">Follow</p>
            <ul className="space-y-1.5 text-[13px]">
              <li><Link href="/subscribe" className="text-ink-secondary hover:text-brand-ink no-underline">The Buildout Brief</Link></li>
              <li>
                <a
                  href="https://x.com/gridtilt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-secondary hover:text-brand-ink no-underline"
                >
                  @gridtilt
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-rule flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[12px] text-ink-muted">
            © {year} GridTilt. Code MIT; curated datasets © GridTilt.
          </p>
          <p className="text-[12px] text-ink-muted">
            Market data may be delayed. Nothing here is investment advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
