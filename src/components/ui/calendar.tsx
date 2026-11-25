import { CaretDown, CaretLeft, CaretRight } from "@phosphor-icons/react"
import * as React from "react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import type { DayButton, Locale } from "react-day-picker"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "outline",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      modifiers={{
        weekend: { dayOfWeek: [0, 6] },
        ...props.modifiers,
      }}
      modifiersClassNames={{
        weekend: "text-red-700 dark:text-red-400",
        ...props.modifiersClassNames,
      }}
      className={cn(
        "group/calendar bg-popover p-2 font-arcade-mono [--cell-radius:var(--radius-sm)] [--cell-size:2.25rem]",
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-3 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-3", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant, size: "icon" }),
          "size-(--cell-size) select-none aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant, size: "icon" }),
          "size-(--cell-size) select-none aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          "text-[14px] font-bold select-none",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex gap-1", defaultClassNames.weekdays),
        weekday: cn(
          "w-(--cell-size) text-center text-[12px] font-bold text-muted-foreground select-none nth-[6]:text-red-700 nth-[7]:text-red-700 dark:nth-[6]:text-red-400 dark:nth-[7]:text-red-400",
          defaultClassNames.weekday
        ),
        week: cn("mt-1 flex w-full gap-1", defaultClassNames.week),
        day: cn(
          "group/day relative size-(--cell-size) p-0 text-center select-none",
          defaultClassNames.day
        ),
        today: cn(
          "rounded-(--cell-radius) ring-1 ring-inset ring-[var(--rt-accent)]",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground opacity-45",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-40",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className: rootClassName, rootRef, ...rootProps }) => (
          <div
            data-slot="calendar"
            ref={rootRef}
            className={cn(rootClassName)}
            {...rootProps}
          />
        ),
        Chevron: ({
          className: chevronClassName,
          orientation,
          ...chevronProps
        }) => {
          if (orientation === "left") {
            return (
              <CaretLeft
                size={15}
                weight="bold"
                className={cn(chevronClassName)}
                {...chevronProps}
              />
            )
          }
          if (orientation === "right") {
            return (
              <CaretRight
                size={15}
                weight="bold"
                className={cn(chevronClassName)}
                {...chevronProps}
              />
            )
          }
          return (
            <CaretDown
              size={14}
              weight="bold"
              className={cn(chevronClassName)}
              {...chevronProps}
            />
          )
        },
        DayButton: ({ ...dayButtonProps }) => (
          <CalendarDayButton locale={locale} {...dayButtonProps} />
        ),
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames()
  const ref = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      className={cn(
        "tnum size-(--cell-size) rounded-(--cell-radius) border-0 font-arcade-mono text-[13px] font-bold hover:bg-accent hover:text-accent-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
        defaultClassNames.day_button,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
