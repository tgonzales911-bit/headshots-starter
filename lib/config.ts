export const config = {
  stripeEnabled: process.env.NEXT_PUBLIC_STRIPE_IS_ENABLED === "true",
  deploymentUrl: process.env.DEPLOYMENT_URL,
} as const;

function isVercelPreviewUrl(url: string): boolean {
  return (
    url.includes(".vercel.app") &&
    (url.includes("-git-") ||
      url.match(/-[a-f0-9]{8,}\.vercel\.app/i) !== null)
  );
}

export function validateConfig() {
  if (typeof config.stripeEnabled !== "boolean") {
    throw new Error("Invalid NEXT_PUBLIC_STRIPE_IS_ENABLED value");
  }

  if (config.deploymentUrl && isVercelPreviewUrl(config.deploymentUrl)) {
    throw new Error(
      "Invalid DEPLOYMENT_URL: Preview URLs cannot be used for webhooks.\n" +
        "Please use either:\n" +
        "1. Your production domain (e.g., your-app.com)\n" +
        "2. For local development, use ngrok (e.g., your-tunnel.ngrok.io)"
    );
  }
}
