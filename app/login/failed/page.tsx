import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/homepage/Brand";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign-in link did not work",
};

export default function LoginFailedPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  // "AuthApiError" is what the callback reports when the link could not be
  // exchanged: opened somewhere else, already used, or expired.
  const linkProblem = searchParams?.err === "AuthApiError";

  return (
    <div className="container flex justify-center py-10 md:py-16">
      <div className="w-full max-w-md">
        <BrandLockup />

        <div className="mt-8 rounded-lg border border-navy-600 bg-navy-800 p-6 sm:p-8">
          <h1 className="font-display text-3xl text-steel">That sign-in link did not work</h1>

          {linkProblem ? (
            <p className="mt-3 text-base leading-relaxed text-steel-dim">
              The link has to be opened on the same device and in the same browser you requested
              it from. It also stops working once it has been used or after it expires.
            </p>
          ) : (
            <p className="mt-3 text-base leading-relaxed text-steel-dim">
              Something went wrong on our side while signing you in. Your order and photos are not
              affected.
            </p>
          )}

          <h2 className="mt-6 text-base font-semibold text-steel">What to do</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-base leading-relaxed text-steel-dim marker:text-gold">
            <li>Request a new link from the device you want to use.</li>
            <li>Open the email on that same device and tap the link.</li>
            <li>
              If your mail app opens links in its own built-in browser, copy the link and paste it
              into the browser you requested it from.
            </li>
          </ol>

          <Link href="/login" className="btn-gold mt-6 w-full">
            Send a new link
          </Link>
        </div>

        <p className="mt-6 text-center text-sm text-steel-dim">
          Still stuck? Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="link-gold break-all">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
