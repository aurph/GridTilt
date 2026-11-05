export const BRIEF_MASTHEAD_SRC = "/media/brief/mh-1-72737b63.webp";

/**
 * The Buildout Brief's masthead, at the head of the signup card. A generated
 * illustration, so the alt text says so. The aspect class holds its space while it
 * loads, and the crop keeps the horizon and the one light.
 */
export function BriefMasthead({ className = "" }: { className?: string }) {
  return (
    <img
      src={BRIEF_MASTHEAD_SRC}
      alt="Illustration: a transmission corridor before dawn, with one orange light on the horizon."
      width={1920}
      height={815}
      decoding="async"
      className={`block w-full aspect-[4/1] object-cover object-[center_82%] bg-card ${className}`}
      data-testid="brief-masthead"
    />
  );
}
