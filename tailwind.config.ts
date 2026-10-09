import type { Config } from "tailwindcss";

/**
 * BadgeShot is dark-only. Every colour resolves to a CSS variable declared in
 * app/globals.css: one navy scale, one gold, one wordmark red. Do not add hex
 * values here or in components.
 */
const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1.5rem",
        lg: "2rem",
      },
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "Times New Roman", "serif"],
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        /** The one navy scale. 900 is the page, 800 a card, 700 a raised surface. */
        navy: {
          950: "hsl(var(--navy-950) / <alpha-value>)",
          900: "hsl(var(--navy-900) / <alpha-value>)",
          800: "hsl(var(--navy-800) / <alpha-value>)",
          700: "hsl(var(--navy-700) / <alpha-value>)",
          600: "hsl(var(--navy-600) / <alpha-value>)",
          500: "hsl(var(--navy-500) / <alpha-value>)",
        },
        /** The one gold. Text on gold is always navy-950, never white. */
        gold: {
          DEFAULT: "hsl(var(--gold) / <alpha-value>)",
          bright: "hsl(var(--gold-bright) / <alpha-value>)",
        },
        steel: {
          DEFAULT: "hsl(var(--steel) / <alpha-value>)",
          dim: "hsl(var(--steel-dim) / <alpha-value>)",
        },
        danger: "hsl(var(--danger) / <alpha-value>)",
        /** Aliases kept so older class names resolve to the same tokens. */
        brand: {
          navy: "hsl(var(--navy-700) / <alpha-value>)",
          gold: "hsl(var(--gold) / <alpha-value>)",
          surface: "hsl(var(--navy-900) / <alpha-value>)",
          red: "hsl(var(--brand-red) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "training-progress-bar": {
          from: { width: "0%" },
          to: { width: "100%" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "training-progress-bar": "training-progress-bar 900s linear forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
