/**
 * Heading level for a feature that can sit inside a section.
 *
 * A section page (Grid, Buildout, Markets) opens with its own statement as
 * the page's h1, then shows one feature below the chip row. That feature
 * keeps its own heading so a deep link still reads right, one level down.
 * On its own route the same feature heading is the h1.
 */
import { createContext, useContext, type ReactNode } from "react";

const HeadingLevel = createContext<1 | 2>(1);

export function HeadingLevelProvider({ level, children }: { level: 1 | 2; children: ReactNode }) {
  return <HeadingLevel.Provider value={level}>{children}</HeadingLevel.Provider>;
}

export function SectionHeading({
  className,
  children,
  testId,
}: {
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const level = useContext(HeadingLevel);
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag className={className} data-testid={testId}>
      {children}
    </Tag>
  );
}
