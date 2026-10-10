import Link from "next/link";
import { DELIVERY_PROMISE, ORDER_PRICE_LABEL, SUPPORT_EMAIL } from "@/lib/site";

export default function ClosingCta({ orderHref }: { orderHref: string }) {
  return (
    <section aria-labelledby="closing-title" className="bg-navy-950">
      <div className="container py-14 md:py-20">
        <div className="max-w-2xl">
          <h2 id="closing-title" className="font-display text-3xl text-steel md:text-4xl">
            Photos ready? Start your order.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-steel-dim">
            Sign in with your email, upload your photos and pay once. {DELIVERY_PROMISE}.
          </p>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <Link href={orderHref} className="btn-gold">
              Start my order — {ORDER_PRICE_LABEL}
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="link-gold link-tap justify-center sm:justify-start">
              Ask a question first
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
