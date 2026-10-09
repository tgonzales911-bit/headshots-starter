/**
 * Outbound email: operator alerts and customer order emails. Every function
 * here is fail-safe: a mail problem is logged and swallowed, never thrown,
 * so it can't break a webhook or strand an order.
 */

import {
  buildOrderConfirmationEmail,
  buildOrderProblemEmail,
} from "@/lib/deliveryEmail";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Resend } from "resend";

function fromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM ?? "orders@badgeshot.com"
  );
}

/** Site origin for links in email; never throws. */
export function siteOrigin(): string {
  const raw = process.env.DEPLOYMENT_URL?.trim() || "badgeshot.vercel.app";
  const withProto =
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  return withProto.replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function send(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[notify] RESEND_API_KEY not set — skipping email", { subject: args.subject });
    return false;
  }
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: fromAddress(),
      reply_to: SUPPORT_EMAIL,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (error) {
      console.error("[notify] send failed", { subject: args.subject, error });
      return false;
    }
    return true;
  } catch (e) {
    console.error("[notify] send threw", { subject: args.subject, e });
    return false;
  }
}

/**
 * Tell the operator something needs a person. Goes to ADMIN_EMAIL. Use for
 * anything that would otherwise leave a paying customer waiting silently.
 */
export async function alertOperator(args: {
  subject: string;
  lines: string[];
  modelId?: number | null;
}): Promise<boolean> {
  const to = process.env.ADMIN_EMAIL?.trim();
  if (!to) {
    console.warn("[notify] ADMIN_EMAIL not set — operator alert not sent", {
      subject: args.subject,
    });
    return false;
  }
  const link = `${siteOrigin()}/admin/ops`;
  const lines = [
    ...args.lines,
    ...(args.modelId ? [`Order #${args.modelId}`] : []),
    `Operator dashboard: ${link}`,
  ];
  return send({
    to,
    subject: `[BadgeShot ops] ${args.subject}`,
    text: lines.join("\n"),
    html: lines.map((l) => `<p style="font:14px/1.5 sans-serif;margin:0 0 8px">${escapeHtml(l)}</p>`).join(""),
  });
}

export async function sendOrderConfirmation(args: {
  to: string;
  customerName?: string | null;
  modelId: number;
}): Promise<boolean> {
  const email = buildOrderConfirmationEmail({
    customerName: args.customerName ?? null,
    orderUrl: `${siteOrigin()}/overview/models/${args.modelId}`,
  });
  return send({ to: args.to, ...email });
}

export async function sendOrderProblem(args: {
  to: string;
  customerName?: string | null;
}): Promise<boolean> {
  const email = buildOrderProblemEmail({ customerName: args.customerName ?? null });
  return send({ to: args.to, ...email });
}
