import { BrandLockup } from "@/components/homepage/Brand";
import { SUPPORT_EMAIL } from "@/lib/site";

export const WaitingForMagicLink = ({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) => {
  return (
    <div className="w-full max-w-md">
      <BrandLockup />

      <div
        role="status"
        className="mt-8 rounded-lg border border-navy-600 bg-navy-800 p-6 sm:p-8"
      >
        <h1 className="font-display text-3xl text-steel">Check your email</h1>
        <p className="mt-3 text-base leading-relaxed text-steel-dim">
          We sent a sign-in link to{" "}
          <span className="break-all font-semibold text-steel">{email}</span>.
        </p>

        <ul className="mt-5 list-disc space-y-2 pl-5 text-base leading-relaxed text-steel-dim marker:text-gold">
          <li>Open the link on this same device and in this same browser.</li>
          <li>It can take a moment to arrive. Look in spam or junk if you do not see it.</li>
          <li>You can close this tab once you have signed in.</li>
        </ul>

        <button type="button" onClick={onBack} className="btn-outline mt-6 w-full">
          Use a different email or send again
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-steel-dim">
        Nothing arriving? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="link-gold break-all">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </div>
  );
};
