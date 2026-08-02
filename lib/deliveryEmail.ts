/**
 * Branded delivery email for finished BadgeShot orders.
 * Table-based layout with inline styles (email-client-safe), navy/gold brand
 * treatment matching the site. Used by both the automated pipeline delivery
 * and the /admin/ops manual delivery route.
 */

const NAVY = "#0a1628";
const GOLD = "#d9a441";
const CREAM = "#f7f5f0";

export type DeliveryEmailArgs = {
  finalUrls: string[];
  customerName?: string | null;
  /** Absolute link for the "Download All" button (model overview page). */
  downloadAllUrl?: string | null;
};

export const DELIVERY_EMAIL_SUBJECT = "Your BadgeShot Class A portraits are ready";

export function buildDeliveryEmailHtml(args: DeliveryEmailArgs): string {
  const name = args.customerName?.trim();
  const greeting = name ? `${name}, your` : "Your";

  const thumbCells = args.finalUrls
    .map(
      (url, i) => `
        <td align="center" valign="top" width="50%" style="padding:8px;">
          <a href="${url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
            <img src="${url}" alt="Portrait ${i + 1}" width="260"
              style="width:100%;max-width:260px;border-radius:8px;border:2px solid ${GOLD};display:block;" />
            <span style="display:block;padding-top:6px;font-size:13px;color:${NAVY};font-weight:bold;">
              Portrait ${i + 1} — tap for full resolution
            </span>
          </a>
        </td>`
    )
    .map((cell, i, arr) => {
      if (i % 2 === 0) {
        const next = arr[i + 1] ?? `<td width="50%" style="padding:8px;"></td>`;
        return `<tr>${cell}${next}</tr>`;
      }
      return "";
    })
    .filter(Boolean)
    .join("");

  const downloadButton = args.downloadAllUrl
    ? `
      <tr>
        <td align="center" style="padding:24px 0 8px 0;">
          <a href="${args.downloadAllUrl}" target="_blank" rel="noopener noreferrer"
            style="background-color:${GOLD};color:${NAVY};font-weight:bold;font-size:16px;
            text-decoration:none;padding:14px 36px;border-radius:6px;display:inline-block;">
            View &amp; Download All
          </a>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:Georgia,'Times New Roman',serif;">
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
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <h1 style="margin:0 0 12px 0;font-size:22px;color:${NAVY};">
                ${greeting} Class A portraits are ready.
              </h1>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#3a4354;">
                Thank you for trusting BadgeShot with your official portrait.
                Your four finished headshots are below — click any image to open
                the full-resolution file, ready for print or department records.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${thumbCells}
              </table>
            </td>
          </tr>
          ${downloadButton}
          <tr>
            <td style="padding:16px 32px 28px 32px;">
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#3a4354;">
                Questions or need an adjustment? Just reply to this email and
                we'll take care of you.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:${CREAM};padding:20px 32px;border-top:1px solid #e6e1d6;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#6a7284;">
                Proud of how they turned out? A one-line review or testimonial
                helps other firefighters find us — just hit reply and tell us
                what you think. We may feature it (with your permission).
              </p>
              <p style="margin:12px 0 0 0;font-size:12px;color:#9aa2b1;">
                BadgeShot &middot; badgeshot.com &middot; questions? just reply to this email
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
