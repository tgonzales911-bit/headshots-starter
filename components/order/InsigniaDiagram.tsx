import { Check, X } from "lucide-react";

export type InsigniaKind = "badge" | "patch" | "brass";

const CAPTIONS: Record<InsigniaKind, { good: string; bad: string }> = {
  badge: {
    good: "Fills the frame, shot from directly above, plain paper behind it, lettering sharp.",
    bad: "Small, at an angle, still pinned to the shirt, flash glare over the lettering.",
  },
  patch: {
    good: "Laid flat, square to the camera, edge to edge in the frame.",
    bad: "Still on the sleeve, curving away from the camera, half in shadow.",
  },
  brass: {
    good: "One piece, close up, on plain paper, soft light.",
    bad: "Both pieces far away on the collar, with a bright reflection.",
  },
};

/** The insignia itself, drawn around the centre of a 120 x 90 frame. */
function Item({ kind, bodyClass, lineClass }: { kind: InsigniaKind; bodyClass: string; lineClass: string }) {
  if (kind === "badge") {
    return (
      <g>
        <path d="M60 9 86 18v27c0 17-13 28-26 36-13-8-26-19-26-36V18Z" className={bodyClass} />
        <path d="M46 28h28M44 36h32" className={lineClass} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="60" cy="51" r="7" className={lineClass} strokeWidth="2.5" fill="none" />
        <path d="M50 65h20" className={lineClass} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </g>
    );
  }
  if (kind === "patch") {
    return (
      <g>
        <path d="M36 10h48a6 6 0 0 1 6 6v32c0 17-17 27-30 33-13-6-30-16-30-33V16a6 6 0 0 1 6-6Z" className={bodyClass} />
        <path
          d="M39 16h42a3 3 0 0 1 3 3v29c0 13-13 21-24 26-11-5-24-13-24-26V19a3 3 0 0 1 3-3Z"
          className={lineClass}
          strokeWidth="1.5"
          strokeDasharray="3 3"
          fill="none"
        />
        <path d="M46 28h28M44 37h32" className={lineClass} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="m60 45 7 12H53Z" className={lineClass} strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      </g>
    );
  }
  return (
    <g>
      <circle cx="60" cy="45" r="32" className={bodyClass} />
      <circle cx="60" cy="45" r="26" className={lineClass} strokeWidth="1.5" fill="none" />
      <path d="M42 56 74 30l6 7-32 26Z" className={lineClass} strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <path d="M78 56 46 30l-6 7 32 26Z" className={lineClass} strokeWidth="2.5" strokeLinejoin="round" fill="none" />
    </g>
  );
}

function Glare({ x, y }: { x: number; y: number }) {
  return (
    <path
      transform={`translate(${x} ${y})`}
      d="M0-13 3-3 13 0 3 3 0 13-3 3-13 0-3-3Z"
      className="fill-foreground"
    />
  );
}

function Good({ kind }: { kind: InsigniaKind }) {
  return (
    <svg viewBox="0 0 120 90" className="block h-auto w-full" aria-hidden focusable="false">
      {/* light paper, dark item: plain contrasting background */}
      <rect width="120" height="90" className="fill-foreground" opacity="0.92" />
      <Item kind={kind} bodyClass="fill-background" lineClass="stroke-primary" />
    </svg>
  );
}

function Bad({ kind }: { kind: InsigniaKind }) {
  const small = "translate(60 47) rotate(-22) scale(0.36) translate(-60 -45)";
  return (
    <svg viewBox="0 0 120 90" className="block h-auto w-full" aria-hidden focusable="false">
      {/* dark cloth: the item is lost against it */}
      <rect width="120" height="90" className="fill-muted" />
      <path
        d="M-10 30 50 -10M-10 60 95 -10M5 100 130 15M50 100 130 45M95 100 130 75"
        className="stroke-border"
        strokeWidth="6"
        fill="none"
      />
      {kind === "brass" ? (
        <>
          <g transform="translate(34 50) rotate(-18) scale(0.22) translate(-60 -45)">
            <Item kind={kind} bodyClass="fill-background" lineClass="stroke-muted-foreground" />
          </g>
          <g transform="translate(86 44) rotate(14) scale(0.22) translate(-60 -45)">
            <Item kind={kind} bodyClass="fill-background" lineClass="stroke-muted-foreground" />
          </g>
          <Glare x={88} y={41} />
        </>
      ) : kind === "patch" ? (
        <>
          <g transform="translate(62 46) rotate(12) skewY(-16) scale(0.4 0.5) translate(-60 -45)">
            <Item kind={kind} bodyClass="fill-background" lineClass="stroke-muted-foreground" />
          </g>
          <path d="M62 0h58v90H74Z" className="fill-background" opacity="0.55" />
        </>
      ) : (
        <>
          <g transform={small}>
            <Item kind={kind} bodyClass="fill-background" lineClass="stroke-muted-foreground" />
          </g>
          <Glare x={57} y={40} />
        </>
      )}
    </svg>
  );
}

/** Side-by-side "like this / not like this" sketch for one insignia photo. */
export default function InsigniaDiagram({ kind }: { kind: InsigniaKind }) {
  const c = CAPTIONS[kind];
  return (
    <div className="grid grid-cols-2 gap-3">
      <figure className="m-0">
        <div className="overflow-hidden rounded-md border-2 border-primary">
          <Good kind={kind} />
        </div>
        <figcaption className="mt-2 flex gap-1.5 text-xs leading-snug text-foreground">
          <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={3} />
          <span>
            <span className="font-semibold">Like this. </span>
            {c.good}
          </span>
        </figcaption>
      </figure>
      <figure className="m-0">
        <div className="overflow-hidden rounded-md border-2 border-dashed border-border">
          <Bad kind={kind} />
        </div>
        <figcaption className="mt-2 flex gap-1.5 text-xs leading-snug text-muted-foreground">
          <X aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={3} />
          <span>
            <span className="font-semibold">Not like this. </span>
            {c.bad}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
