import type { Metadata } from "next";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Link from "next/link";
import OrderSteps from "@/components/homepage/OrderSteps";
import ReadyChecklist from "@/components/homepage/ReadyChecklist";
import { ORDER_PRICE_LABEL, orderStartHref } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Photo guide — BadgeShot",
  description: "What to photograph for your BadgeShot portrait, and how to get each photo right.",
};

export default async function PhotoGuidePage() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orderHref = orderStartHref(Boolean(user));

  return (
    <>
      <section className="border-b border-navy-600">
        <div className="container py-12 md:py-16">
          <Link href="/" className="link-tap text-sm text-steel-dim underline-offset-4 hover:text-steel hover:underline">
            ← Back
          </Link>
          <div aria-hidden="true" className="braid mt-6 w-24" />
          <h1 className="mt-6 font-display text-4xl text-steel md:text-5xl">Photo guide</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-dim">
            Good photos in, great portraits out. This takes about ten minutes with a phone.
          </p>
        </div>
      </section>
      <ReadyChecklist />
      <OrderSteps />
      <section className="bg-navy-950">
        <div className="container py-14">
          <Link href={orderHref} className="btn-gold">
            Start my order — {ORDER_PRICE_LABEL}
          </Link>
        </div>
      </section>
    </>
  );
}
