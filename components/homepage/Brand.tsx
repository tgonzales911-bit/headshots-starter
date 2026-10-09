import Image from "next/image";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/** "Badge" in steel, "Shot" in the wordmark red. Read aloud as one word. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display tracking-wide ${className}`} aria-label={SITE_NAME}>
      <span aria-hidden="true" className="text-steel">
        Badge
      </span>
      <span aria-hidden="true" className="text-brand-red">
        Shot
      </span>
    </span>
  );
}

/** The shield. Decorative by default because the wordmark beside it carries the name. */
export function Shield({
  size = 36,
  alt = "",
  priority = false,
  className = "",
}: {
  size?: number;
  alt?: string;
  priority?: boolean;
  className?: string;
}) {
  const src =
    size <= 48 ? "/brand/shield-96.png" : size <= 96 ? "/brand/shield-192.png" : "/brand/shield-512.png";
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 ${className}`}
    />
  );
}

/** Shield, wordmark and tagline stacked, for sign-in and status pages. */
export function BrandLockup() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Shield size={72} />
      <div>
        <Wordmark className="text-2xl" />
        <p className="mt-1 text-sm text-gold">{SITE_TAGLINE}</p>
      </div>
    </div>
  );
}
