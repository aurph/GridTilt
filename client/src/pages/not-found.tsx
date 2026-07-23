import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center py-28">
      <div className="flex flex-col items-center text-center px-6 max-w-md">
        <p className="font-serif font-medium text-[64px] leading-none text-brand mb-4 tnum">404</p>
        <h1 className="font-serif font-medium text-[24px] text-ink mb-2">
          This page is not on the grid.
        </h1>
        <p className="text-[14px] text-ink-secondary leading-relaxed mb-8">
          The buildout moves fast, but this route never existed. Try a section instead.
        </p>
        <Link
          href="/"
          className="border border-ink px-5 py-2.5 text-[13.5px] font-semibold text-ink no-underline transition-colors hover:border-brand-ink hover:text-brand-ink"
          data-testid="link-home"
        >
          Front page
        </Link>
      </div>
    </div>
  );
}
