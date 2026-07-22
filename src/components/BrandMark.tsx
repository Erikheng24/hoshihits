import type { Branding } from "@/lib/branding";

/** Logo + wordmark. Falls back to the built-in gold star when no logo is uploaded. */
export function BrandMark({
  brand,
  size = 32,
  showText = true,
  className = "",
}: {
  brand: Branding;
  size?: number;
  showText?: boolean;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      {brand.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logo}
          alt=""
          style={{ width: size, height: size }}
          className="rounded-lg object-cover shrink-0 border border-edge"
        />
      ) : (
        <svg viewBox="0 0 96 96" style={{ width: size, height: size }} className="shrink-0" aria-hidden="true">
          <rect x="4" y="4" width="88" height="88" rx="20" fill="none" stroke="#D4AF37" strokeOpacity="0.5" strokeWidth="5" />
          <path d="M48 16l7.8 20.4L76 44l-20.2 7.6L48 72l-7.8-20.4L20 44l20.2-7.6z" fill="#D4AF37" />
        </svg>
      )}
      {showText && (
        <span className="min-w-0">
          {/* Long shop names wrap rather than truncate; tighten tracking as they grow. */}
          <span
            className={`block font-display text-gold-grad leading-tight ${
              brand.name.length > 16 ? "text-[12.5px] tracking-[0.06em]" : "text-[15px] tracking-[0.14em]"
            }`}
          >
            {brand.name.toUpperCase()}
          </span>
          <span className="block text-[10px] text-fog tracking-[0.16em] uppercase mt-1 truncate">{brand.tagline}</span>
        </span>
      )}
    </span>
  );
}
