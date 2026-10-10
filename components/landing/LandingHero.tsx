import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock, RotateCcw } from "lucide-react";
import { ORDER_PRICE_LABEL, PORTRAITS_PER_ORDER } from "@/lib/site";

/**
 * First screen: the promise, the price, and the proof side by side. The proof
 * is one real order: the phone photo that went in and the portrait that came
 * out, so a visitor sees the product before reading about it.
 */
export default function LandingHero({ orderHref }: { orderHref: string }) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-navy-600">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 top-0 h-[36rem] w-[36rem] rounded-full bg-gold/10 blur-3xl"
      />
      <div className="container relative grid gap-12 pb-16 pt-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-center md:gap-14 md:pb-24 md:pt-14">
        <div className="max-w-2xl">
          <div aria-hidden="true" className="braid braid-draw w-24" />
          <p className="mt-6 text-base font-semibold text-gold">Class A portraits for the fire service</p>

          <h1
            id="hero-title"
            className="mt-3 font-display text-[clamp(2.6rem,10vw,4.75rem)] leading-[1.05] text-steel"
          >
            <span className="block">Your Rank.</span>
            <span className="block">Your Uniform.</span>
            <span className="block text-gold-bright">Your Portrait.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-steel-dim md:text-xl">
            Send a few phone photos of your face, badge and shoulder patch. Get {PORTRAITS_PER_ORDER}{" "}
            dress-uniform portraits wearing your <em className="not-italic text-steel">real</em> insignia,
            no studio, no appointment, no borrowed jacket.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={orderHref} className="btn-gold">
              Start my order — {ORDER_PRICE_LABEL}
            </Link>
            <a href="#real-insignia" className="link-gold link-tap justify-center sm:justify-start">
              See your badge, not a guess
            </a>
          </div>

          <ul className="mt-8 grid gap-3 text-sm text-steel-dim sm:grid-cols-3 sm:gap-4">
            <li className="flex items-center gap-2">
              <BadgeCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-gold" />
              Your real badge and patch
            </li>
            <li className="flex items-center gap-2">
              <Clock aria-hidden="true" className="h-5 w-5 shrink-0 text-gold" />
              Hand-checked in 24 hours
            </li>
            <li className="flex items-center gap-2">
              <RotateCcw aria-hidden="true" className="h-5 w-5 shrink-0 text-gold" />
              Not right? We redo it free
            </li>
          </ul>
        </div>

        {/* The proof: phone photo in, portrait out. */}
        <figure className="relative mx-auto w-full max-w-md md:max-w-none">
          <div className="relative ml-auto aspect-[1200/1607] w-[86%] overflow-hidden rounded-lg border border-gold/60 bg-navy-800 shadow-2xl shadow-black/50">
            <Image
              src="/examples/portrait-1.webp"
              alt="Finished BadgeShot portrait: an assistant chief in Class A dress uniform with his own department badge and shoulder patch, in front of an American flag"
              fill
              priority
              sizes="(min-width: 768px) 42vw, 86vw"
              className="object-cover"
            />
            <span className="absolute bottom-3 right-3 rounded bg-navy-950/85 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-gold-bright">
              Delivered
            </span>
          </div>

          <div className="absolute bottom-8 left-0 w-[38%] -rotate-3 rounded-md border border-navy-500 bg-navy-900 p-1.5 shadow-xl shadow-black/60">
            <div className="relative aspect-square overflow-hidden rounded-sm">
              <Image
                src="/examples/selfie.webp"
                alt="The phone photo the customer sent: the same man in a blue T-shirt against a plain wall"
                fill
                sizes="(min-width: 768px) 16vw, 34vw"
                className="object-cover"
              />
            </div>
            <p className="px-1 pb-0.5 pt-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-steel-dim">
              Phone photo
            </p>
            <ArrowRight
              aria-hidden="true"
              className="absolute -right-4 top-[38%] h-8 w-8 rotate-3 rounded-full bg-gold p-1.5 text-navy-950 shadow-lg"
            />
          </div>

          <figcaption className="mt-4 text-right text-sm text-steel-dim">
            A real order, shown with permission.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
