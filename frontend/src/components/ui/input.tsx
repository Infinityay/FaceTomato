import * as React from "react";
import { cn } from "../../lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-all duration-200",
          "placeholder:text-muted-foreground/50",
          "hover:border-accent/40 hover:bg-accent/5",
          "focus:border-accent focus:bg-background focus:outline-none focus:ring-4 focus:ring-accent/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-zinc-800/40 dark:border-zinc-700 dark:hover:bg-zinc-800/60 dark:focus:bg-black/40",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
