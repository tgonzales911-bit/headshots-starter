import { DoDontPair, type DiagramSubject } from "@/components/homepage/PhotoDiagrams";
import { SELFIE_MAX, SELFIE_MIN } from "@/lib/site";

/** The six rules that apply to every insignia photo. */
const INSIGNIA_RULES: { rule: string; why: string }[] = [
  {
    rule: "Fill the frame",
    why: "Move in until the piece takes up most of the picture. Small pieces lose their lettering.",
  },
  {
    rule: "Shoot straight on",
    why: "Hold the phone directly above or directly in front, flat to the piece. An angle distorts its shape.",
  },
  {
    rule: "Plain, contrasting background",
    why: "A dark piece on a light surface, a bright piece on a dark one. No patterns, no wood grain.",
  },
  {
    rule: "Soft, indirect light",
    why: "Next to a window or in open shade. Polished metal glares under a direct lamp or sun.",
  },
  {
    rule: "Tap to focus",
    why: "Tap the piece on your screen and wait for it to sharpen before you take the photo.",
  },
  {
    rule: "No flash",
    why: "Flash leaves a white hot spot that hides engraving and enamel.",
  },
];

type Item = {
  subject: DiagramSubject;
  title: string;
  count: string;
  points: string[];
};

const FACE: Item = {
  subject: "face",
  title: "Photos of your face",
  count: `${SELFIE_MIN} to ${SELFIE_MAX} photos. 15 or more is best.`,
  points: [
    "Phone selfies are fine.",
    "Mix them up: different days, different lighting, different angles.",
    "No hats and no sunglasses.",
    "Just you in the picture, with your face in focus.",
  ],
};

const INSIGNIA: Item[] = [
  {
    subject: "badge",
    title: "Your badge",
    count: "One photo.",
    points: [
      "Lay it flat on a plain, matte surface. A dark T-shirt works well.",
      "Hold the phone directly above it. If you can see the phone reflected in the metal, lift the phone higher and zoom in a little.",
      "Check that the number and lettering are readable in the photo.",
    ],
  },
  {
    subject: "patch",
    title: "Your shoulder patch",
    count: "One photo.",
    points: [
      "Lay the sleeve flat on a table and smooth it out, or use a loose patch.",
      "Get the whole patch in, border included, with a little space around it.",
      "Shoot from directly above so the shape is not stretched.",
    ],
  },
  {
    subject: "brass",
    title: "Your collar brass",
    count: "One photo of one piece, close up.",
    points: [
      "Set one piece the right way up on a plain surface. If your left and right pieces differ, photograph the left one and tell us in your order notes.",
      "It is small, so move in close until it fills most of the frame.",
      "If the phone will not focus that close, back off slightly and zoom in instead.",
    ],
  },
];

function Checkbox() {
  return (
    <span
      aria-hidden="true"
      className="mt-1 inline-block h-5 w-5 shrink-0 rounded-sm border-2 border-gold"
    />
  );
}

function ItemRow({ item }: { item: Item }) {
  return (
    <li className="grid gap-6 border-t border-navy-600 py-8 md:grid-cols-[minmax(0,1fr)_320px] md:gap-10">
      <div>
        <div className="flex items-start gap-3">
          <Checkbox />
          <div>
            <h3 className="font-display text-2xl text-steel">{item.title}</h3>
            <p className="mt-1 font-semibold text-gold">{item.count}</p>
          </div>
        </div>
        <ul className="mt-4 list-disc space-y-2 pl-12 text-base leading-relaxed text-steel-dim marker:text-navy-500">
          {item.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
      <div className="pl-8 md:pl-0">
        <DoDontPair subject={item.subject} />
      </div>
    </li>
  );
}

export default function ReadyChecklist() {
  return (
    <section id="ready" aria-labelledby="ready-title" className="border-b border-navy-600 bg-navy-950">
      <div className="container py-14 md:py-20">
        <div className="max-w-2xl">
          <h2 id="ready-title" className="font-display text-3xl text-steel md:text-4xl">
            Have these ready
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-steel-dim">
            Four kinds of photo, all taken on your phone. The insignia photos decide how accurate
            your badge, patch and brass look in the finished portrait, so take those with
            care.
          </p>
        </div>

        <ul className="mt-8">
          <ItemRow item={FACE} />
        </ul>

        <div className="rounded-lg border border-gold/40 bg-navy-800 p-5 md:p-8">
          <h3 className="font-display text-2xl text-steel">How to photograph your insignia</h3>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-steel-dim">
            These six rules apply to the badge, the patch and the brass alike.
          </p>
          <dl className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {INSIGNIA_RULES.map(({ rule, why }) => (
              <div key={rule} className="border-l-2 border-gold pl-4">
                <dt className="font-semibold text-steel">{rule}</dt>
                <dd className="mt-1 text-base leading-relaxed text-steel-dim">{why}</dd>
              </div>
            ))}
          </dl>
        </div>

        <ul className="mt-8">
          {INSIGNIA.map((item) => (
            <ItemRow key={item.subject} item={item} />
          ))}
          <li className="border-t border-navy-600 py-8">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-1 inline-block h-5 w-5 shrink-0 rounded-sm border-2 border-dashed border-navy-500"
              />
              <div className="max-w-2xl">
                <h3 className="font-display text-2xl text-steel">Your Class A jacket</h3>
                <p className="mt-1 font-semibold text-steel-dim">Optional. One photo.</p>
                <p className="mt-3 text-base leading-relaxed text-steel-dim">
                  The front of the jacket, on a hanger or laid flat. If you skip it, we use a
                  standard navy double-breasted Class A jacket.
                </p>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
