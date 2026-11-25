import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva } from "class-variance-authority"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "rt2-focus inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded font-bold whitespace-nowrap transition-all select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "rt2-btn-primary",
        outline: "rt2-btn-secondary",
        danger: "rt2-btn-danger",
        ghost:
          "border-2 border-transparent bg-transparent text-foreground hover:bg-muted",
      },
      size: {
        default: "min-h-[42px] px-4 text-[14px]",
        sm: "min-h-[36px] px-3 text-[13px]",
        lg: "min-h-[46px] px-5 text-[15px]",
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
