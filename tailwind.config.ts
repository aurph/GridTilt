import type { Config } from "tailwindcss";

/**
 * Alpha-capable token color for Tailwind 3: keeps index.css :root as the
 * single source of truth while letting slash-opacity modifiers compile.
 * With no modifier <alpha-value> becomes 1 (100% = the raw token); with
 * bg-brand/10 it becomes 0.1 (10% mix into transparent).
 */
function tokenColor(cssVar: string): string {
  return `color-mix(in srgb, var(${cssVar}) calc(<alpha-value> * 100%), transparent)`;
}

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: ".5625rem",
        md: ".375rem",
        sm: ".1875rem",
      },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)",
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
        // GridTilt custom colors
        navy: "#0D1B2A",
        electric: "#1E90FF",
        amber: "#F0A500",
        "green-low": "#22c55e",
        "yellow-mid": "#eab308",
        "red-high": "#ef4444",
        // GridTilt data tokens (Lake 1) - values live in index.css :root.
        // color-mix wrapper makes slash-opacity modifiers (bg-brand/10) work
        // with var()-based colors under Tailwind 3; plain var() silently
        // drops the alpha and emits no CSS at all.
        surface: {
          sunken: tokenColor("--surface-sunken"),
          DEFAULT: tokenColor("--surface-base"),
          base: tokenColor("--surface-base"),
          raised: tokenColor("--surface-raised"),
          overlay: tokenColor("--surface-overlay"),
        },
        brand: {
          DEFAULT: tokenColor("--brand"),
          "2": tokenColor("--brand-2"),
        },
        ink: {
          DEFAULT: tokenColor("--ink"),
          secondary: tokenColor("--ink-secondary"),
          muted: tokenColor("--ink-muted"),
          faint: tokenColor("--ink-faint"),
        },
        positive: {
          DEFAULT: tokenColor("--positive"),
          deep: tokenColor("--positive-deep"),
        },
        negative: {
          DEFAULT: tokenColor("--negative"),
          deep: tokenColor("--negative-deep"),
        },
        warning: tokenColor("--warning"),
        critical: tokenColor("--critical"),
        info: tokenColor("--info"),
        estimate: tokenColor("--estimate"),
        series: {
          "1": tokenColor("--series-1"),
          "2": tokenColor("--series-2"),
          "3": tokenColor("--series-3"),
          "4": tokenColor("--series-4"),
          "5": tokenColor("--series-5"),
          "6": tokenColor("--series-6"),
          "7": tokenColor("--series-7"),
          "8": tokenColor("--series-8"),
          "9": tokenColor("--series-9"),
          "10": tokenColor("--series-10"),
        },
      },
      borderColor: {
        subtle: "var(--border-subtle)",
        strong: "var(--border-strong)",
      },
      fontSize: {
        // Data type scale - replaces the ad-hoc text-[NNpx] values.
        // 12/14/16px stay on the default xs/sm/base steps.
        "8": ["0.5rem", { lineHeight: "0.75rem" }],
        "9": ["0.5625rem", { lineHeight: "0.75rem" }],
        "10": ["0.625rem", { lineHeight: "0.875rem" }],
        "11": ["0.6875rem", { lineHeight: "1rem" }],
        "13": ["0.8125rem", { lineHeight: "1.25rem" }],
        "15": ["0.9375rem", { lineHeight: "1.375rem" }],
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        serif: ["var(--font-serif)"],
        mono: ["JetBrains Mono", "monospace"],
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
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
