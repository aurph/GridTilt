export const BRIEF_MASTHEAD_SRC = "/media/brief/mh-1-72737b63.webp";

/**
 * The Buildout Brief's masthead. A generated illustration, so the alt text says
 * so. The aspect class holds its space while it loads; on wide screens it crops
 * to a band, keeping the horizon and the one light.
 */
export function BriefMasthead({ className = "" }: { className?: string }) {
  return (
    <img
      src={BRIEF_MASTHEAD_SRC}
      alt="Illustration: a transmission corridor before dawn, with one orange light on the horizon."
      width={1920}
      height={815}
      decoding="async"
      className={`block w-full aspect-[21/9] lg:aspect-[4/1] object-cover object-[center_78%] bg-card ${className}`}
      data-testid="brief-masthead"
    />
  );
}
