import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach } from "vitest";

import { _resetDbForTests } from "@/lib/db";

// Reset IndexedDB and the db singleton between tests so each spec is isolated.
beforeEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: replacing global indexedDB for test isolation
	(globalThis as any).indexedDB = new IDBFactory();
	_resetDbForTests();
});
