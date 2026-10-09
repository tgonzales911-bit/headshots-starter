import { Check, X } from "lucide-react";

/**
 * Line diagrams of a phone viewfinder for the "Have these ready" checklist.
 * Each subject has a "do" and a "don't" framing. They are drawings on purpose:
 * no photographs of people or of anyone's insignia are used on this page.
 */

export type DiagramSubject = "face" | "badge" | "patch" | "brass";

const BADGE_PATH =
  "M60 30 C75 30 88 35 93 40 V80 C93 104 77 117 60 125 C43 117 27 104 27 80 V40 C32 35 45 30 60 30 Z";
const PATCH_PATH =
  "M60 26 C84 26 97 44 97 66 V103 C97 114 88 122 60 127 C32 122 23 114 23 103 V66 C23 44 36 26 60 26 Z";

function Badge() {
  return (
    <g>
      <path d={BADGE_PATH} className="fill-current opacity-20" />
      <path d={BADGE_PATH} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="60" cy="74" r="15" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M44 48 H76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M48 100 H72" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M60 65 V83 M51 74 H69" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function Patch() {
  return (
    <g>
      <path d={PATCH_PATH} className="fill-current opacity-20" />
      <path d={PATCH_PATH} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path
        d={PATCH_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray="3 3"
        transform="translate(60 77) scale(0.84) translate(-60 -77)"
      />
      <path d="M41 56 C52 49 68 49 79 56" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="60" cy="84" r="13" fill="none" stroke="currentColor" strokeWidth="2" />
    </g>
  );
}

function BrassPair() {
  return (
    <g>
      {[33, 87].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="75" r="24" className="fill-current opacity-20" />
          <circle cx={cx} cy="75" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <circle cx={cx} cy="75" r="17" fill="none" stroke="currentColor" strokeWidth="1.25" />
          {/* twin bars, as on an officer's collar device */}
          <rect x={cx - 8} y="65" width="5" height="20" rx="1.5" fill="currentColor" />
          <rect x={cx + 3} y="65" width="5" height="20" rx="1.5" fill="currentColor" />
        </g>
      ))}
    </g>
  );
}

function Person() {
  return (
    <g>
      <path d="M20 150 C20 116 38 100 60 100 C82 100 100 116 100 150 Z" className="fill-current opacity-20" />
      <path
        d="M20 150 C20 116 38 100 60 100 C82 100 100 116 100 150"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <circle cx="60" cy="64" r="24" className="fill-current opacity-20" />
      <circle cx="60" cy="64" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </g>
  );
}

/** A four-point flash burst, drawn in the brightest text colour. */
function Glare({ x, y, r }: { x: number; y: number; r: number }) {
  const k = r * 0.2;
  return (
    <path
      d={`M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`}
      className="fill-steel"
    />
  );
}

function Subject({ subject, good, uid }: { subject: DiagramSubject; good: boolean; uid: string }) {
  if (subject === "face") {
    return good ? (
      <Person />
    ) : (
      <g>
        <Person />
        {/* cap and brim */}
        <path d="M37 54 C37 30 83 30 83 54 Z" className="fill-navy-950" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M30 55 H94" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        {/* sunglasses */}
        <rect x="41" y="61" width="17" height="12" rx="4" fill="currentColor" />
        <rect x="62" y="61" width="17" height="12" rx="4" fill="currentColor" />
        <path d="M56 65 H64 M36 64 L41 65 M79 65 L84 64" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    );
  }

  if (subject === "badge") {
    return good ? (
      <Badge />
    ) : (
      <g>
        {/* a busy table top behind a small, tilted badge */}
        <path d="M0 40 H120 M0 70 H120 M0 100 H120 M0 128 H120" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        <g transform="translate(66 84) rotate(-24) skewX(-18) scale(0.44) translate(-60 -77)">
          <Badge />
        </g>
        <Glare x={62} y={76} r={17} />
      </g>
    );
  }

  if (subject === "patch") {
    return good ? (
      <Patch />
    ) : (
      <g transform="translate(92 84) skewY(-20) scale(0.62 0.95) translate(-60 -77)">
        <Patch />
      </g>
    );
  }

  // collar brass
  return good ? (
    <BrassPair />
  ) : (
    <g>
      <path
        d="M-10 30 L60 -10 M-10 60 L110 -10 M-10 90 L130 10 M-10 120 L130 40 M-10 150 L130 70 M20 160 L130 100 M70 160 L130 130"
        stroke="currentColor"
        strokeWidth="5"
        opacity="0.22"
      />
      <g filter={`url(#${uid}-blur)`} transform="translate(60 80) scale(0.34) translate(-60 -75)">
        <BrassPair />
      </g>
    </g>
  );
}

const CAPTIONS: Record<DiagramSubject, { good: string; bad: string }> = {
  face: {
    good: "Face clear, plain light",
    bad: "Hat and sunglasses",
  },
  badge: {
    good: "Fills the frame, straight on",
    bad: "Small, tilted, flash glare",
  },
  patch: {
    good: "Flat, whole border showing",
    bad: "From the side, edge cut off",
  },
  brass: {
    good: "Close and sharp",
    bad: "Tiny, blurred, busy surface",
  },
};

const SUBJECT_NAME: Record<DiagramSubject, string> = {
  face: "a face photo",
  badge: "a badge photo",
  patch: "a shoulder patch photo",
  brass: "a collar brass photo",
};

function Frame({ subject, good }: { subject: DiagramSubject; good: boolean }) {
  const uid = `dg-${subject}-${good ? "do" : "dont"}`;
  const caption = good ? CAPTIONS[subject].good : CAPTIONS[subject].bad;
  return (
    <figure className="m-0 w-full max-w-[150px]">
      <svg
        viewBox="0 0 120 150"
        role="img"
        aria-label={`${good ? "Do" : "Don't"}: ${SUBJECT_NAME[subject]}. ${caption}.`}
        className={`block h-auto w-full rounded-md bg-navy-950 ${good ? "text-gold" : "text-steel-dim"}`}
      >
        <defs>
          <clipPath id={`${uid}-clip`}>
            <rect x="1" y="1" width="118" height="148" rx="7" />
          </clipPath>
          <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <g clipPath={`url(#${uid}-clip)`}>
          <Subject subject={subject} good={good} uid={uid} />
        </g>
        {/* viewfinder edge and corner marks */}
        <rect
          x="1"
          y="1"
          width="118"
          height="148"
          rx="7"
          fill="none"
          strokeWidth="2"
          className={good ? "stroke-gold" : "stroke-navy-500"}
          strokeDasharray={good ? undefined : "5 4"}
        />
        <path
          d="M10 22 V10 H22 M98 10 H110 V22 M110 128 V140 H98 M22 140 H10 V128"
          fill="none"
          strokeWidth="1.5"
          className={good ? "stroke-gold" : "stroke-navy-500"}
        />
      </svg>
      <figcaption className="mt-2 flex items-start gap-1.5 text-sm leading-snug">
        {good ? (
          <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={3} />
        ) : (
          <X aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={3} />
        )}
        <span>
          <span className="font-semibold text-steel">{good ? "Do" : "Don't"}</span>
          <span className="block text-steel-dim">{caption}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** The do / don't pair for one kind of photo. */
export function DoDontPair({ subject }: { subject: DiagramSubject }) {
  return (
    <div className="grid w-full max-w-[320px] grid-cols-2 gap-4">
      <Frame subject={subject} good />
      <Frame subject={subject} good={false} />
    </div>
  );
}
