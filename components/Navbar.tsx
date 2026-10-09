import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Link from "next/link";
import { Database } from "@/types/supabase";
import { Shield, Wordmark } from "@/components/homepage/Brand";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export const revalidate = 0;

const navLink =
  "inline-flex min-h-[44px] items-center rounded-md px-2.5 text-sm font-medium text-steel-dim transition-colors hover:text-steel sm:px-3";

/**
 * Server component on purpose: the operator check compares against
 * ADMIN_EMAIL here, so that address is never sent to the browser.
 */
export default async function Navbar() {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmail = process.env.ADMIN_EMAIL;
  const isOperator = Boolean(user?.email && adminEmail && user.email === adminEmail);

  return (
    <header className="sticky top-0 z-[100] w-full border-b border-navy-600 bg-navy-950/95 backdrop-blur supports-[backdrop-filter]:bg-navy-950/85">
      <div className="container flex h-16 items-center justify-between gap-2">
        <Link
          href="/"
          aria-label={`${SITE_NAME} home`}
          className="flex min-h-[44px] items-center gap-2.5"
        >
          <Shield size={36} priority />
          {/* Signed-in phones need the room for the links, so the name yields below 420px. */}
          <Wordmark className={user ? "hidden text-xl min-[420px]:inline" : "text-xl"} />
        </Link>

        {user ? (
          <nav aria-label="Account" className="flex items-center">
            <Link href="/overview" className={navLink}>
              My orders
            </Link>
            {isOperator && (
              <Link href="/admin/ops" className={navLink}>
                Operator
              </Link>
            )}
            <form action="/auth/sign-out" method="post" className="flex">
              <button type="submit" className={navLink}>
                Sign out
              </button>
            </form>
          </nav>
        ) : (
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center rounded-md border border-gold/70 px-4 text-sm font-semibold text-gold-bright transition-colors hover:bg-gold/10"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
