import type { Metadata } from "next";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Database } from "@/types/supabase";
import { Login } from "./components/Login";
import { safeNext } from "./next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const next = safeNext(searchParams?.next);

  if (user) {
    redirect(next ?? "/");
  }

  return (
    <div className="container flex justify-center py-10 md:py-16">
      <Login next={next} />
    </div>
  );
}
