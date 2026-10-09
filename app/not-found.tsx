import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/homepage/Brand";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="container flex justify-center py-12 md:py-20">
      <div className="w-full max-w-md text-center">
        <BrandLockup />
        <h1 className="mt-8 font-display text-3xl text-steel">We can&rsquo;t find that page</h1>
        <p className="mt-3 text-base leading-relaxed text-steel-dim">
          The address may be mistyped, or the page may have moved. Your orders are safe.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/" className="btn-gold">
            Go to the start page
          </Link>
          <Link href="/overview" className="btn-outline">
            My orders
          </Link>
        </div>
      </div>
    </div>
  );
}
