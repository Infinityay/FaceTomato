/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./node_modules/streamdown/dist/**/*.{js,mjs}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--fo-border))",
        input: "hsl(var(--fo-input))",
        ring: "hsl(var(--fo-accent))",
        background: "hsl(var(--fo-bg))",
        foreground: "hsl(var(--fo-fg))",
        
        "theme-background": "hsl(var(--fo-bg))",
        "theme-foreground": "hsl(var(--fo-fg))",
        "theme-sidebar": "hsl(var(--fo-sidebar))",

        primary: {
          DEFAULT: "hsl(var(--fo-primary))",
          foreground: "hsl(var(--fo-primary-fg))",
        },
        accent: {
          DEFAULT: "hsl(var(--fo-accent))",
          foreground: "hsl(var(--fo-accent-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--fo-sidebar))",
          foreground: "hsl(var(--fo-fg-muted))",
        },
        card: {
          DEFAULT: "hsl(var(--fo-bg))",
          foreground: "hsl(var(--fo-fg))",
        },
        destructive: {
          DEFAULT: "hsl(0 84.2% 60.2%)",
          foreground: "hsl(0 0% 100%)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
