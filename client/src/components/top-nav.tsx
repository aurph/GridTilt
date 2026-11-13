import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, Search } from "lucide-react";
import logoPath from "@assets/logo-nav-80.png";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SectionLinks } from "@/components/section-links";
import { SECTIONS, sectionForPath } from "@/lib/sections";

/**
 * The top bar: wordmark, the four sections, a centered search pill and one
 * primary button, Get the Brief. Nothing else.
 *
 * Every feature lives inside a section as a chip (lib/sections.ts), so the
 * bar never grows. Below 640px the section links leave the header for the
 * floating bar at the bottom of the screen (MobileBar); the wordmark and Get
 * the Brief stay in the header at every width.
 */

function openPalette() {
  window.dispatchEvent(new Event("gt-open-palette"));
}

export function TopNav() {
  const [location] = useLocation();
  const activeSection = sectionForPath(location);
  return (
    <header
      className="sticky top-0 z-50 flex-shrink-0 border-b border-dashed border-border bg-sidebar"
      data-testid="top-nav"
    >
      <div className="grid h-14 grid-cols-[1fr_auto] items-center gap-3 px-4 sm:grid-cols-[1fr_auto_1fr] sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="flex h-10 shrink-0 items-center gap-2 no-underline" data-testid="top-nav-wordmark">
            <img src={logoPath} alt="" className="h-5 w-5 select-none" draggable={false} />
            <span className="text-[15px] font-bold leading-none tracking-tight text-foreground">
              Grid<span className="italic text-brand">Tilt</span>
            </span>
          </Link>
          <SectionLinks active={activeSection} />
        </div>

        <button
          type="button"
          onClick={openPalette}
          className="hidden h-9 w-[220px] items-center gap-2 rounded-full border border-border bg-background/60 px-3.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground sm:flex lg:w-[280px]"
          data-testid="top-nav-search"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-10 leading-none">{"⌘K"}</kbd>
        </button>

        <div className="flex items-center justify-end">
          <Link
            href="/subscribe"
            className="flex h-10 shrink-0 items-center rounded-full bg-[#F07800] px-4 sm:h-9 text-[13px] font-semibold leading-none text-[#101010] no-underline transition-colors hover:bg-[#ff8a14]"
            data-testid="top-nav-brief"
          >
            Get the Brief
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * Phones only: a floating pill at the bottom center with Search and a menu
 * button. The menu opens a sheet listing the four sections, Research and Get
 * the Brief. The page pads its bottom so the pill never covers the last row
 * (App.tsx).
 */
export function MobileBar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const activeSection = sectionForPath(location);
  // Following a link in the sheet closes it.
  useEffect(() => setOpen(false), [location]);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center sm:hidden"
        data-testid="mobile-bar"
      >
        <div className="pointer-events-auto flex h-12 items-center rounded-full border border-border bg-card/95 px-1.5 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={openPalette}
            className="flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium text-foreground"
            data-testid="mobile-bar-search"
          >
            <Search className="h-4 w-4" aria-hidden />
            Search
          </button>
          <span aria-hidden className="h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="flex h-10 w-12 items-center justify-center rounded-full text-foreground"
            data-testid="mobile-bar-menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-border bg-card p-4 pb-8 !duration-150 ease-out motion-reduce:!animate-none sm:hidden"
          data-testid="mobile-menu"
        >
          <SheetTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Sections
          </SheetTitle>
          <SheetDescription className="sr-only">The four sections of GridTilt, Research and the Brief.</SheetDescription>
          <nav aria-label="Sections" className="mt-2 flex flex-col">
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                href={s.href}
                aria-current={s.id === activeSection ? "page" : undefined}
                className={`flex min-h-[48px] items-center border-b border-dashed border-border text-[16px] font-semibold no-underline ${
                  s.id === activeSection ? "text-brand" : "text-foreground"
                }`}
                data-testid={`mobile-menu-${s.id}`}
              >
                {s.label}
              </Link>
            ))}
            <Link
              href="/blog"
              className="flex min-h-[48px] items-center border-b border-dashed border-border text-[16px] font-semibold text-foreground no-underline"
              data-testid="mobile-menu-research"
            >
              Research
            </Link>
          </nav>
          <Link
            href="/subscribe"
            className="mt-4 flex h-11 items-center justify-center rounded-full bg-[#F07800] text-[14px] font-semibold text-[#101010] no-underline"
            data-testid="mobile-menu-brief"
          >
            Get the Brief
          </Link>
        </SheetContent>
      </Sheet>
    </>
  );
}
