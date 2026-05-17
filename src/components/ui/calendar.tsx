import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Calendar({
	className,
	classNames,
	// Hide previous/next-month days by default. They confuse range selection (e.g. June 4 also
	// shows in May's grid as an outside day) and have poor contrast at their faded opacity.
	showOutsideDays = false,
	captionLayout = "label",
	formatters,
	components,
	...props
}: React.ComponentProps<typeof DayPicker>) {
	const defaultClassNames = getDefaultClassNames();
	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			captionLayout={captionLayout}
			className={cn("bg-card text-card-foreground p-3 [--cell-size:--spacing(10)]", className)}
			formatters={{
				formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
				...formatters
			}}
			classNames={{
				root: cn("w-fit", defaultClassNames.root),
				months: cn("relative flex flex-col gap-4 md:flex-row", defaultClassNames.months),
				month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
				nav: cn(
					"absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
					defaultClassNames.nav
				),
				button_previous: cn(
					buttonVariants({ variant: "ghost", size: "icon" }),
					"size-8 select-none p-0 aria-disabled:opacity-50",
					defaultClassNames.button_previous
				),
				button_next: cn(
					buttonVariants({ variant: "ghost", size: "icon" }),
					"size-8 select-none p-0 aria-disabled:opacity-50",
					defaultClassNames.button_next
				),
				month_caption: cn(
					"flex h-8 w-full items-center justify-center px-8 text-sm font-medium",
					defaultClassNames.month_caption
				),
				caption_label: cn("select-none font-medium", defaultClassNames.caption_label),
				month_grid: cn("mx-auto w-fit border-collapse", defaultClassNames.month_grid),
				weekdays: cn("flex", defaultClassNames.weekdays),
				weekday: cn(
					"text-muted-foreground flex-1 select-none rounded-md text-[0.78rem] font-normal",
					defaultClassNames.weekday
				),
				week: cn("mt-2 flex w-full", defaultClassNames.week),
				day: cn(
					"group/day relative aspect-square h-full w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",
					defaultClassNames.day
				),
				// Default day button — gives every cell a fixed cell-size box. Pages that supply
				// a custom DayButton (e.g. the team Calendar with overtime/time-off dots) skip this.
				day_button: cn(
					"size-(--cell-size) p-0 font-normal text-sm rounded-md transition-colors",
					"hover:bg-accent hover:text-accent-foreground",
					"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
					"data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40",
					"data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:hover:bg-primary",
					defaultClassNames.day_button
				),
				range_start: cn("rounded-l-md", defaultClassNames.range_start),
				range_middle: cn("rounded-none", defaultClassNames.range_middle),
				range_end: cn("rounded-r-md", defaultClassNames.range_end),
				today: cn(
					"bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
					defaultClassNames.today
				),
				// If a caller opts back into outside days, render them visibly but not at the faded
				// opacity that fails WCAG. Combine with `disabled={{ outside: true }}` to block clicks.
				outside: cn("text-muted-foreground", defaultClassNames.outside),
				disabled: cn("text-muted-foreground/60", defaultClassNames.disabled),
				hidden: cn("invisible", defaultClassNames.hidden),
				...classNames
			}}
			components={{
				Chevron: ({ orientation, ...iconProps }) => {
					const Icon = orientation === "left" ? ChevronLeftIcon : ChevronRightIcon;
					return <Icon aria-hidden="true" className="size-4" {...iconProps} />;
				},
				...components
			}}
			{...props}
		/>
	);
}

export { Calendar };
