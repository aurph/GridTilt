import { Link } from "wouter";
import { SECTIONS, type Section } from "@/lib/sections";

/**
 * The four section links of the top bar. Its own file (no image import) so
 * the render test can lock the labels, order and addresses.
 */
export function SectionLinks({ active }: { active: Section["id"] | null }) {
  return (
    <nav className="hidden h-14 items-stretch gap-5 sm:flex" aria-label="Sections" data-testid="top-nav-sections">
      {SECTIONS.map((s) => {
        const on = s.id === active;
        return (
          <Link
            key={s.id}
            href={s.href}
            aria-current={on ? "page" : undefined}
            className={`relative flex shrink-0 items-center text-[13px] leading-none no-underline transition-colors ${
              on ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`top-nav-${s.id}`}
          >
            {s.label}
            {on && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-brand" />}
          </Link>
        );
      })}
    </nav>
  );
}
