import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground border-border",
        // Status badges with glow effect
        success: "bg-success/20 text-success border-success/30 backdrop-blur-sm",
        warning: "bg-warning/20 text-warning border-warning/30 backdrop-blur-sm",
        error: "bg-destructive/20 text-destructive border-destructive/30 backdrop-blur-sm",
        info: "bg-primary/20 text-primary border-primary/30 backdrop-blur-sm",
        pending: "bg-secondary/20 text-secondary border-secondary/30 backdrop-blur-sm",
        muted: "bg-muted/50 text-muted-foreground border-muted backdrop-blur-sm",
        // Glass variants
        glass: "bg-card/30 backdrop-blur-lg border-border/50 text-foreground",
        "glass-primary": "bg-primary/10 backdrop-blur-lg border-primary/30 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
