import PurchaseToContinueButton from "@/components/overview/PurchaseToContinueButton";
import TrainModelZone from "@/components/TrainModelZone";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Database } from "@/types/supabase";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Link from "next/link";
import { FaArrowLeft } from "react-icons/fa";

export const dynamic = "force-dynamic";

export default async function TrainModelPage() {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const stripeOn = process.env.NEXT_PUBLIC_STRIPE_IS_ENABLED === "true";
  let hasCredits = true;
  if (stripeOn && user) {
    const { data: creditRow } = await supabase
      .from("credits")
      .select("credits")
      .eq("user_id", user.id)
      .maybeSingle();
    console.log("[train-page] credits debug", {
      stripeEnabled: process.env.NEXT_PUBLIC_STRIPE_IS_ENABLED,
      creditRow: creditRow,
      hasCredits: hasCredits,
    });
    hasCredits = (creditRow?.credits ?? 0) > 0;
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        id="train-model-container"
        className="flex flex-1 flex-col gap-2 px-2"
      >
        <Link href="/overview" className="text-sm w-fit">
          <Button variant={"outline"}>
            <FaArrowLeft className="mr-2" />
            Go Back
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Train Model</CardTitle>
            <CardDescription>
              Choose a name, type, and upload some photos to get started.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {stripeOn && !hasCredits ? (
              <PurchaseToContinueButton />
            ) : (
              <TrainModelZone />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
