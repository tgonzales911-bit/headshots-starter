import Image from "next/image";
import { ArrowRight } from "lucide-react";

const PAIRS = [
  {
    label: "Badge",
    photo: { src: "/examples/badge-photo.webp", alt: "The customer's photo of his badge lying on a table" },
    portrait: { src: "/examples/badge-portrait.webp", alt: "The same badge on the chest of the finished portrait" },
  },
  {
    label: "Shoulder patch",
    photo: { src: "/examples/patch-photo.webp", alt: "The customer's photo of his department shoulder patch" },
    portrait: { src: "/examples/patch-portrait.webp", alt: "The same patch on the sleeve of the finished portrait" },
  },
];

/**
 * The difference that matters to this buyer. Generic AI headshot apps draw a
 * plausible badge with nonsense lettering; a firefighter spots that at once.
 * Here the actual photo and the actual portrait sit side by side.
 */
export default function RealInsignia() {
  return (
    <section id="real-insignia" aria-labelledby="insignia-title" className="border-b border-navy-600 bg-navy-950">
      <div className="container py-16 md:py-24">
        <div className="max-w-2xl">
          <p className="text-base font-semibold text-gold">What makes it different</p>
          <h2 id="insignia-title" className="mt-2 font-display text-3xl text-steel md:text-5xl">
            Your badge. Not a guess.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-steel-dim">
            Ordinary AI headshot apps invent a badge: the shape is close, the lettering is gibberish,
            and anyone in the fire service can tell. BadgeShot puts the badge and patch you photographed
            onto the uniform, with your department name, your rank and your numbers, so the portrait
            holds up on a department wall.
          </p>
        </div>

        <ul className="mt-12 grid gap-8 lg:grid-cols-2">
          {PAIRS.map(({ label, photo, portrait }) => (
            <li key={label} className="rounded-lg border border-navy-600 bg-navy-900 p-4 sm:p-6">
              <p className="font-display text-xl text-steel">{label}</p>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
                <figure>
                  <div className="relative aspect-square overflow-hidden rounded-md border border-navy-600">
                    <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 1024px) 20vw, 42vw" className="object-cover" />
                  </div>
                  <figcaption className="mt-2 text-center text-sm text-steel-dim">Your photo</figcaption>
                </figure>
                <ArrowRight aria-hidden="true" className="h-6 w-6 text-gold" />
                <figure>
                  <div className="relative aspect-square overflow-hidden rounded-md border border-gold/60">
                    <Image src={portrait.src} alt={portrait.alt} fill sizes="(min-width: 1024px) 20vw, 42vw" className="object-cover" />
                  </div>
                  <figcaption className="mt-2 text-center text-sm text-gold">In your portrait</figcaption>
                </figure>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-2xl text-base leading-relaxed text-steel-dim">
          Collar brass is matched to your rank and the photo you send. Your face comes from your own
          photos too, not a lookalike, and a person checks every portrait before it reaches you.
        </p>
      </div>
    </section>
  );
}
