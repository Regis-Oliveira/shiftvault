import type * as React from "react";
import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/components/ThemeProvider";

/** Shadcn-style Sonner Toaster — themed via ThemeProvider so toasts match light/dark. */
function Toaster({ ...props }: React.ComponentProps<typeof Sonner>) {
	const { resolved } = useTheme();
	return (
		<Sonner
			theme={resolved}
			className="toaster group"
			position="bottom-right"
			closeButton
			richColors
			toastOptions={{
				classNames: {
					toast:
						"group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-[var(--shadow-card)]",
					description: "group-[.toast]:text-muted-foreground",
					actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
					cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
				}
			}}
			{...props}
		/>
	);
}

export { Toaster };
