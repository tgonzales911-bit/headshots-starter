"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/homepage/Brand";
import { SUPPORT_EMAIL } from "@/lib/site";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the detail in the browser console for support; never show it on the page.
    console.error(error);
  }, [error]);

  return (
    <div className="container flex justify-center py-12 md:py-20">
      <div className="w-full max-w-md text-center">
        <BrandLockup />
        <h1 className="mt-8 font-display text-3xl text-steel">This page did not load</h1>
        <p className="mt-3 text-base leading-relaxed text-steel-dim">
          Something went wrong on our side. An order that is already paid for keeps running, and
          your photos are not lost.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={() => reset()} className="btn-gold">
            Try again
          </button>
          <Link href="/overview" className="btn-outline">
            My orders
          </Link>
        </div>
        <p className="mt-8 text-sm leading-relaxed text-steel-dim">
          If it keeps happening, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="link-gold break-all">
            {SUPPORT_EMAIL}
          </a>
          {error.digest ? (
            <>
              {" "}
              and include this reference: <span className="font-semibold text-steel">{error.digest}</span>
            </>
          ) : null}
          .
        </p>
      </div>
    </div>
  );
}
