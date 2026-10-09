"use client";

import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { BrandLockup } from "@/components/homepage/Brand";
import { Input } from "@/components/ui/input";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Database } from "@/types/supabase";
import { WaitingForMagicLink } from "./WaitingForMagicLink";

type Inputs = {
  email: string;
};

// "+" is a valid character in the local part (name+tag@example.com).
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

type AuthFailure = { status?: number; code?: string; message?: string };

/** Turn a Supabase auth error into a sentence the customer can act on. */
function describeSignInError(error: AuthFailure): string {
  const message = (error.message ?? "").toLowerCase();
  if (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("security purposes")
  ) {
    return "Too many sign-in links were requested for this address. Wait a little while, then try again. A link we already sent may still work, so check your inbox and spam folder.";
  }
  if (error.code === "email_address_invalid" || error.code === "validation_failed") {
    return "That email address was not accepted. Check it for typos and try again.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "We could not reach the sign-in service. Check your connection and try again.";
  }
  return `We could not send the sign-in link. Try again, and if it keeps happening email ${SUPPORT_EMAIL}.`;
}

export const Login = ({ next }: { next: string | null }) => {
  const supabase = createClientComponentClient<Database>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const email = data.email.trim();
    setIsSubmitting(true);
    setSendError(null);

    // Send people back to this same site, and on to the page they asked for.
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callback.toString() },
      });
      if (error) {
        setSendError(describeSignInError(error));
        return;
      }
      setSentTo(email);
    } catch (err) {
      setSendError(describeSignInError(err instanceof Error ? { message: err.message } : {}));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sentTo) {
    return <WaitingForMagicLink email={sentTo} onBack={() => setSentTo(null)} />;
  }

  const fieldError = errors.email
    ? errors.email.message || "Enter your email address to sign in."
    : null;

  return (
    <div className="w-full max-w-md">
      <BrandLockup />

      <div className="mt-8 rounded-lg border border-navy-600 bg-navy-800 p-6 sm:p-8">
        <h1 className="font-display text-3xl text-steel">Sign in to start your order</h1>
        <p className="mt-3 text-base leading-relaxed text-steel-dim">
          We&rsquo;ll email you a sign-in link. No password.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="login-email" className="text-base font-semibold text-steel">
              Email address
            </label>
            <Input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com"
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "login-email-error login-email-hint" : "login-email-hint"}
              className="h-12 border-navy-500 bg-navy-950 text-base text-steel placeholder:text-steel-dim/70"
              {...register("email", {
                required: "Enter your email address to sign in.",
                setValueAs: (value: string) => (typeof value === "string" ? value.trim() : value),
                validate: {
                  emailIsValid: (value: string) =>
                    EMAIL_PATTERN.test(value) ||
                    "That does not look like an email address. Check it and try again.",
                  // Loaded on demand: the domain list is ~700 kB and was being
                  // shipped with the sign-in page to every visitor.
                  emailIsntDisposable: async (value: string) => {
                    try {
                      const { default: disposableDomains } = await import(
                        "disposable-email-domains"
                      );
                      return (
                        !disposableDomains.includes((value.split("@")[1] ?? "").toLowerCase()) ||
                        "Use a permanent email address. Your portraits are delivered to it."
                      );
                    } catch {
                      return true;
                    }
                  },
                },
              })}
            />
            {fieldError && (
              <p id="login-email-error" role="alert" className="text-sm text-danger">
                {fieldError}
              </p>
            )}
            <p id="login-email-hint" className="text-sm leading-relaxed text-steel-dim">
              Open the link on this same device and in this same browser. It will not work from
              another one.
            </p>
          </div>

          {sendError && (
            <p role="alert" className="rounded-md border border-danger/60 bg-navy-950 p-3 text-sm leading-relaxed text-danger">
              {sendError}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className="btn-gold w-full">
            {isSubmitting ? "Sending the link…" : "Email me a sign-in link"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-steel-dim">
        Trouble signing in? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="link-gold break-all">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </div>
  );
};
