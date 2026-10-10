/**
 * Customer emails for BadgeShot orders: order received, portraits ready, and
 * "we hit a problem". Table-based layout with inline styles (email-client
 * safe) in the navy/gold brand treatment. Each has a plain-text alternative.
 * The delivery email is used by both the automated pipeline delivery and the
 * /admin/ops manual delivery route.
 */

import { DELIVERY_PROMISE, ORDER_STEPS, SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

const NAVY = "#0a1628";
const GOLD = "#c9a84c";
const CREAM = "#f7f5f0";
const BODY_TEXT = "#3a4354";

export type DeliveryEmailArgs = {
  finalUrls: string[];
  customerName?: string | null;
  /** Absolute link for the "View and download" button (the order page). */
  downloadAllUrl?: string | null;
};

export type BuiltEmail = { subject: string; html: string; text: string };

export const DELIVERY_EMAIL_SUBJECT = "Your BadgeShot Class A portraits are ready";

/** Escape text for use in HTML content or a double-quoted attribute. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line, no control characters: safe for a greeting in a text email. */
function cleanName(name?: string | null): string {
  return (name ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six"];

function countPhrase(n: number): string {
  const word = COUNT_WORDS[n] ?? String(n);
  return `${word} finished ${n === 1 ? "portrait" : "portraits"}`;
}

function paragraph(html: string, extraStyle = ""): string {
  return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${BODY_TEXT};${extraStyle}">${html}</p>`;
}

function button(href: string, label: string): string {
  return `
          <tr>
            <td align="center" style="padding:10px 32px 18px 32px;">
              <a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
                style="background-color:${GOLD};color:${NAVY};font-weight:bold;font-size:16px;
                text-decoration:none;padding:14px 36px;border-radius:6px;display:inline-block;">
                ${esc(label)}
              </a>
            </td>
          </tr>`;
}

/** The shared navy/gold frame every BadgeShot email is set in. */
function shell(opts: {
  title: string;
  preheader: string;
  /** One or more <tr> rows for the white body area. */
  rows: string;
  /** Optional extra paragraph shown above the support line in the footer. */
  footerNote?: string;
}): string {
  const footerNote = opts.footerNote
    ? `<p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:#6a7284;">${opts.footerNote}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:Georgia,'Times New Roman',serif;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${CREAM};">
    ${esc(opts.preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="max-width:600px;width:100%;background-color:#ffffff;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background-color:${NAVY};padding:28px 32px;text-align:center;">
              <span style="font-size:26px;font-weight:bold;color:${GOLD};letter-spacing:2px;">BADGESHOT</span>
              <br />
              <span style="font-size:12px;color:#b9c2d0;letter-spacing:3px;text-transform:uppercase;">Class A Portraits</span>
            </td>
          </tr>
          ${opts.rows}
          <tr>
            <td style="background-color:${CREAM};padding:20px 32px;border-top:1px solid #e6e1d6;">
              ${footerNote}
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6a7284;">
                ${esc(SITE_NAME)} &middot; Questions? Reply to this email or write to
                <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:#6a7284;">${esc(SUPPORT_EMAIL)}</a>.
                Replies reach a person.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function headingRow(text: string): string {
  return `
          <tr>
            <td style="padding:32px 32px 4px 32px;">
              <h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.3;color:${NAVY};">${esc(text)}</h1>
            </td>
          </tr>`;
}

function textRow(html: string): string {
  return `
          <tr>
            <td style="padding:0 32px 6px 32px;">
              ${html}
            </td>
          </tr>`;
}

const TEXT_FOOTER = `${SITE_NAME}\nQuestions? Reply to this email or write to ${SUPPORT_EMAIL}. Replies reach a person.`;

// ---------------------------------------------------------------------------
// Portraits ready
// ---------------------------------------------------------------------------

function deliveryHeadline(name: string): string {
  return name ? `${name}, your Class A portraits are ready.` : "Your Class A portraits are ready.";
}

export function buildDeliveryEmailHtml(args: DeliveryEmailArgs): string {
  const name = cleanName(args.customerName);
  const urls = args.finalUrls.filter((u) => typeof u === "string" && u.length > 0);
  const count = countPhrase(urls.length);

  const cells = urls.map(
    (url, i) => `
        <td align="center" valign="top" width="50%" style="padding:8px;">
          <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
            <img src="${esc(url)}" alt="Portrait ${i + 1} of ${urls.length}" width="260"
              style="width:100%;max-width:260px;border-radius:8px;border:2px solid ${GOLD};display:block;" />
            <span style="display:block;padding-top:6px;font-size:13px;color:${NAVY};font-weight:bold;">
              Portrait ${i + 1}: open full size
            </span>
          </a>
        </td>`
  );
  const thumbRows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    thumbRows.push(
      `<tr>${cells[i]}${cells[i + 1] ?? `<td width="50%" style="padding:8px;"></td>`}</tr>`
    );
  }

  const intro = args.downloadAllUrl
    ? `Thank you for trusting BadgeShot with your official portrait. Your ${count} ${
        urls.length === 1 ? "is" : "are"
      } below. Use the button to view and download them; print sizes (8 &times; 10, 5 &times; 7 and 4 &times; 5 at 300 dpi) are available on that page.`
    : `Thank you for trusting BadgeShot with your official portrait. Your ${count} ${
        urls.length === 1 ? "is" : "are"
      } below. Select any image to open the full-size file.`;

  const rows = `${headingRow(deliveryHeadline(name))}${textRow(paragraph(intro))}
          <tr>
            <td style="padding:8px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${thumbRows.join("")}
              </table>
            </td>
          </tr>
          <tr><td style="font-size:0;line-height:0;height:14px;">&nbsp;</td></tr>${
            args.downloadAllUrl ? button(args.downloadAllUrl, "View and download") : ""
          }${textRow(
            paragraph(
              "Something not right? Reply to this email and we will regenerate your portraits at no extra cost."
            )
          )}`;

  return shell({
    title: DELIVERY_EMAIL_SUBJECT,
    preheader: `Your ${count} ${urls.length === 1 ? "is" : "are"} ready to view, download and print.`,
    rows,
    footerNote:
      "Proud of how they turned out? A one-line review helps other first responders find us. Reply and tell us what you think. We would only ever share it with your permission.",
  });
}

export function buildDeliveryEmailText(args: DeliveryEmailArgs): string {
  const name = cleanName(args.customerName);
  const urls = args.finalUrls.filter((u) => typeof u === "string" && u.length > 0);
  const count = countPhrase(urls.length);
  const lines: string[] = [
    deliveryHeadline(name),
    "",
    `Thank you for trusting BadgeShot with your official portrait. Your ${count} ${
      urls.length === 1 ? "is" : "are"
    } ready.`,
    "",
  ];
  if (args.downloadAllUrl) {
    lines.push(
      "View and download:",
      args.downloadAllUrl,
      "",
      "Print sizes (8 x 10, 5 x 7 and 4 x 5 at 300 dpi) are available on that page.",
      ""
    );
  }
  urls.forEach((url, i) => lines.push(`Portrait ${i + 1}: ${url}`));
  lines.push(
    "",
    "Something not right? Reply to this email and we will regenerate your portraits at no extra cost.",
    "",
    "Proud of how they turned out? A one-line review helps other first responders find us. Reply and tell us what you think. We would only ever share it with your permission.",
    "",
    TEXT_FOOTER
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Order received
// ---------------------------------------------------------------------------

/** "choosing your best photos, making your portraits and a final quality check" */
function stepsInOneSentence(): string {
  const middle = ORDER_STEPS.slice(1, -1).map((s, i) =>
    i === 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s.toLowerCase()
  );
  if (middle.length <= 1) return middle.join("");
  const last = middle[middle.length - 1];
  const lastWithArticle = /^[aeiou]/.test(last) ? last : `a ${last}`;
  return `${middle.slice(0, -1).join(", ")} and ${lastWithArticle}`;
}

export function buildOrderConfirmationEmail(args: {
  customerName?: string | null;
  orderUrl: string;
}): BuiltEmail {
  const name = cleanName(args.customerName);
  const subject = "We've got your BadgeShot order";
  const headline = name ? `${name}, we've got your order.` : "We've got your order.";
  const next = `Here is what happens next: ${stepsInOneSentence()}. A person checks every portrait against your photos and insignia before anything is sent to you.`;
  const promise = `${DELIVERY_PROMISE}. We will email you the moment your portraits are ready, so there is nothing you need to do in the meantime.`;
  const follow = "You can follow your order's progress at any time.";

  const html = shell({
    title: subject,
    preheader: `Your order has started. ${DELIVERY_PROMISE}.`,
    rows: `${headingRow(headline)}${textRow(
      paragraph("Thank you. Your order has started.") +
        paragraph(esc(next)) +
        paragraph(esc(promise)) +
        paragraph(esc(follow))
    )}${button(args.orderUrl, "View my order")}`,
  });

  const text = [
    headline,
    "",
    "Thank you. Your order has started.",
    "",
    next,
    "",
    promise,
    "",
    follow,
    args.orderUrl,
    "",
    TEXT_FOOTER,
  ].join("\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// We hit a problem
// ---------------------------------------------------------------------------

export function buildOrderProblemEmail(args: { customerName?: string | null }): BuiltEmail {
  const name = cleanName(args.customerName);
  const subject = "An update on your BadgeShot order";
  const headline = name
    ? `${name}, we hit a problem with your order.`
    : "We hit a problem with your order.";
  const p1 =
    "Something went wrong on our side while we were making your portraits. A person has been alerted and is working on it now.";
  const p2 =
    "You do not need to do anything, and you will not be charged again. We will either finish your portraits and send them to you, or refund you.";
  const p3 =
    "If you have a question, or a date you need the portraits by, reply to this email. Replies reach a person.";

  const html = shell({
    title: subject,
    preheader: "A person is on it. You will not be charged again.",
    rows: `${headingRow(headline)}${textRow(paragraph(p1) + paragraph(p2) + paragraph(p3))}
          <tr><td style="font-size:0;line-height:0;height:12px;">&nbsp;</td></tr>`,
  });

  const text = [headline, "", p1, "", p2, "", p3, "", TEXT_FOOTER].join("\n");

  return { subject, html, text };
}
