import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ClosingCta from "@/components/homepage/ClosingCta";
import ExamplesGallery from "@/components/homepage/ExamplesGallery";
import Faq from "@/components/homepage/Faq";
import Hero from "@/components/homepage/Hero";
import OrderSteps from "@/components/homepage/OrderSteps";
import PriceCard from "@/components/homepage/PriceCard";
import ReadyChecklist from "@/components/homepage/ReadyChecklist";

export const dynamic = "force-dynamic";

/**
 * Order start page. Customers arrive here from the "Get Your BadgeShot"
 * buttons on badgeshot.com, already decided: confirm they are in the right
 * place, tell them what to have ready, and get them signed in.
 */
export default async function Index() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return redirect("/overview");
  }

  return (
    <>
      <Hero />
      <ReadyChecklist />
      <OrderSteps />
      <PriceCard />
      <ExamplesGallery />
      <Faq />
      <ClosingCta />
    </>
  );
}
