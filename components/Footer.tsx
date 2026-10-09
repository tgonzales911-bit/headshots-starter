import Link from "next/link";
import { Shield, Wordmark } from "@/components/homepage/Brand";
import { MARKETING_URL, SITE_NAME, SITE_TAGLINE, SUPPORT_EMAIL } from "@/lib/site";

const footerLink =
  "inline-flex min-h-[44px] items-center text-sm text-steel-dim underline-offset-4 transition-colors hover:text-steel hover:underline";

export default function Footer() {
  return (
    <footer className="border-t border-navy-600 bg-navy-950">
      <div className="container py-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-3">
            <Shield size={44} />
            <div>
              <Wordmark className="text-xl" />
              <p className="text-sm text-gold">{SITE_TAGLINE}</p>
            </div>
          </div>

          <nav aria-label="Footer">
            <ul className="grid grid-cols-2 gap-x-8 sm:flex sm:gap-x-8">
              <li>
                <Link href="/#how" className={footerLink}>
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/#faq" className={footerLink}>
                  FAQ
                </Link>
              </li>
              <li>
                <a href={MARKETING_URL} className={footerLink}>
                  badgeshot.com
                </a>
              </li>
              <li>
                <a href={`mailto:${SUPPORT_EMAIL}`} className={footerLink}>
                  Contact
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-8 border-t border-navy-600 pt-6 text-sm text-steel-dim">
          <p>AI-generated portraits, checked by a person before delivery.</p>
          <p className="mt-1">
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
