import Link from "next/link";
import { Shield, Wordmark } from "@/components/homepage/Brand";
import { DELIVERY_PROMISE, MARKETING_URL, ORDER_PRICE_LABEL, SITE_TAGLINE } from "@/lib/site";

export default function Hero() {
  return (
    <section aria-labelledby="hero-title" className="border-b border-navy-600">
      <div className="container grid gap-10 pb-14 pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-16 md:pb-20 md:pt-6">
        <div className="max-w-2xl">
          <a href={MARKETING_URL} className="link-tap text-sm text-steel-dim underline-offset-4 hover:text-steel hover:underline">
            ← badgeshot.com
          </a>

          <div aria-hidden="true" className="braid braid-draw mt-6 w-24" />

          <p className="mt-6 text-base font-semibold text-gold">Fire service Class A portraits</p>

          <h1
            id="hero-title"
            className="mt-3 font-display text-[clamp(2.5rem,10.5vw,4.5rem)] leading-[1.08] text-steel"
          >
            <span className="block">Your Rank.</span>
            <span className="block">Your Uniform.</span>
            <span className="block">Your Portrait.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-steel-dim">
            This is where your order starts. Your real badge, shoulder patch and collar brass go on
            the uniform, placed from photos you take yourself.
          </p>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <Link href="/login" className="btn-gold">
              Start my order — {ORDER_PRICE_LABEL}
            </Link>
            <a href="#how" className="link-gold link-tap justify-center sm:justify-start">
              How it works
            </a>
          </div>

          <p className="mt-5 text-sm text-steel-dim">{DELIVERY_PROMISE}.</p>
        </div>

        {/* Desktop only: the header already carries the shield on a phone. */}
        <div className="hidden flex-col items-center gap-4 pr-4 text-center md:flex lg:pr-12">
          <Shield size={260} priority />
          <div>
            <Wordmark className="text-3xl" />
            <p className="mt-1 text-sm text-gold">{SITE_TAGLINE}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
