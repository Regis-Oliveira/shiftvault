import { describe, expect, it } from "vitest";

import { newId } from "@/lib/id";

describe("newId", () => {
	it("returns a non-empty string", () => {
		const id = newId();
		expect(id).toBeTypeOf("string");
		expect(id.length).toBeGreaterThan(0);
	});

	it("returns a unique value on each call", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) ids.add(newId());
		expect(ids.size).toBe(100);
	});
});
