import Image from "next/image";
import { clsx } from "clsx";

type BbbMarkProps = {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Accessible label when the mark is meaningful (not decorative). */
  alt?: string;
};

const sizeMap = {
  sm: { className: "h-8 w-8", px: 32 },
  md: { className: "h-10 w-10", px: 40 },
  lg: { className: "h-16 w-16", px: 64 },
  xl: { className: "h-20 w-20", px: 80 },
} as const;

/** Transparent PNG — must stay unoptimized so Next/Image does not flatten alpha. */
const LOGO_SRC = "/brand/bbb-logo.png";

/** Official BBB gear + circuit mark. */
export function BbbMark({
  size = "md",
  className,
  alt = "",
}: BbbMarkProps) {
  const dims = sizeMap[size];
  const decorative = alt === "";

  return (
    <Image
      src={LOGO_SRC}
      alt={alt}
      width={dims.px}
      height={dims.px}
      unoptimized
      priority={size === "lg" || size === "xl"}
      className={clsx(
        "shrink-0 bg-transparent object-contain",
        dims.className,
        className,
      )}
      aria-hidden={decorative || undefined}
    />
  );
}

type BbbWordmarkProps = {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  align?: "left" | "center";
  className?: string;
  /** Secondary line under the mark (default: CPE Sinking Fund). */
  tagline?: string;
};

export function BbbWordmark({
  size = "md",
  showTagline = true,
  align = "left",
  className,
  tagline = "CPE Department Sinking-fund System",
}: BbbWordmarkProps) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2.5",
        align === "center" && "flex-col gap-2 text-center",
        className,
      )}
    >
      <BbbMark size={size} alt="BBB" />
      {showTagline ? (
        <div
          className={clsx(
            "min-w-0",
            align === "center" && "flex flex-col items-center",
          )}
        >
          <p className="type-body-sm font-semibold leading-snug text-[var(--brand)]">
            BBB
          </p>
          <p className="type-caption mt-0.5 leading-snug">{tagline}</p>
        </div>
      ) : null}
    </div>
  );
}
