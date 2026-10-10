import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import ClosingCta from "@/components/homepage/ClosingCta";
import ExamplesGallery from "@/components/homepage/ExamplesGallery";
import Faq from "@/components/homepage/Faq";
import PriceCard from "@/components/homepage/PriceCard";
import HowItWorks from "@/components/landing/HowItWorks";
import LandingHero from "@/components/landing/LandingHero";
import RealInsignia from "@/components/landing/RealInsignia";
import UseCases from "@/components/landing/UseCases";
import { orderStartHref } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Landing page. Shown to everyone, signed in or not; the header carries
 * "My orders" for returning customers. Every order button goes straight to
 * the order form (through sign-in when needed).
 */
export default async function Index() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const orderHref = orderStartHref(Boolean(user));

  return (
    <>
      <LandingHero orderHref={orderHref} />
      <RealInsignia />
      <ExamplesGallery />
      <HowItWorks />
      <UseCases />
      <PriceCard orderHref={orderHref} />
      <Faq />
      <ClosingCta orderHref={orderHref} />
    </>
  );
}
