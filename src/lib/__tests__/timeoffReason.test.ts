import { describe, expect, it } from "vitest";

import {
	normaliseTimeoffReason,
	TIMEOFF_REASONS,
	timeoffReasonBadge,
	timeoffReasonLabel
} from "@/lib/timeoffReason";

describe("TIMEOFF_REASONS", () => {
	it("lists every reason exactly once, with unspecified last", () => {
		expect(TIMEOFF_REASONS).toEqual(["vacation", "sick", "comp", "personal", "unspecified"]);
	});
});

describe("normaliseTimeoffReason", () => {
	it("returns the reason as-is when present", () => {
		expect(normaliseTimeoffReason("vacation")).toBe("vacation");
		expect(normaliseTimeoffReason("sick")).toBe("sick");
	});

	it("defaults missing reason to 'unspecified'", () => {
		expect(normaliseTimeoffReason(undefined)).toBe("unspecified");
	});
});

describe("timeoffReasonLabel", () => {
	it("produces a human-readable label per reason", () => {
		expect(timeoffReasonLabel("vacation")).toBe("Vacation");
		expect(timeoffReasonLabel("sick")).toBe("Sick");
		expect(timeoffReasonLabel("comp")).toBe("Comp day");
		expect(timeoffReasonLabel("personal")).toBe("Personal");
		expect(timeoffReasonLabel("unspecified")).toBe("Unspecified");
	});

	it("treats undefined as unspecified", () => {
		expect(timeoffReasonLabel(undefined)).toBe("Unspecified");
	});
});

describe("timeoffReasonBadge", () => {
	it("assigns a distinct badge variant per reason", () => {
		expect(timeoffReasonBadge("vacation").variant).toBe("secondary");
		expect(timeoffReasonBadge("sick").variant).toBe("destructive");
		expect(timeoffReasonBadge("comp").variant).toBe("success");
		expect(timeoffReasonBadge("personal").variant).toBe("outline");
	});

	it("muted-foreground className on unspecified so it visually fades", () => {
		const result = timeoffReasonBadge("unspecified");
		expect(result.variant).toBe("outline");
		expect(result.className).toMatch(/text-muted-foreground/);
	});
});
