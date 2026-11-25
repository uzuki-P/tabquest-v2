import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("inline-flex flex-col", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative z-0 inline-flex items-center rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] p-0.5",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "rt2-focus relative z-10 min-h-[40px] cursor-pointer rounded-sm px-3.5 text-[14px] font-bold whitespace-nowrap text-[var(--rt-ink)] transition-colors duration-150 hover:text-[var(--rt-accent-ink)] data-[active]:text-[var(--rt-surface)]",
        className
      )}
      {...props}
    />
  )
}

function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(
        "pointer-events-none absolute top-0.5 bottom-0.5 left-0 z-0 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-sm bg-[var(--rt-ink)] transition-[transform,width,translate] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger }
