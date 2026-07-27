import { Link } from "wouter";

/** Compact product footer: one row of links, one line of legal. */
export function Colophon() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-14 border-t border-rule" data-testid="colophon">
      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 py-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[12.5px]">
          <span className="font-serif text-[13.5px] text-ink">
            Grid<em className="italic text-brand-ink">Tilt</em>
          </span>
          <Link href="/about" className="text-ink-secondary hover:text-brand-ink no-underline">About and sources</Link>
          <Link href="/compute-frontier/methodology" className="text-ink-secondary hover:text-brand-ink no-underline">Methodology</Link>
          <Link href="/subscribe" className="text-ink-secondary hover:text-brand-ink no-underline">The weekly brief</Link>
          <a href="https://x.com/gridtilt" target="_blank" rel="noopener noreferrer" className="text-ink-secondary hover:text-brand-ink no-underline">@gridtilt</a>
          <span className="flex-1" />
          <span className="text-ink-muted">
            © {year} GridTilt · not investment advice · wrong number?{" "}
            <a href="https://x.com/gridtilt" target="_blank" rel="noopener noreferrer" className="underline decoration-rule-strong underline-offset-2 hover:text-brand-ink">tell me</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
