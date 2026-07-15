import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
	it("cascades each field from project, global, and defaults", () => {
		const files: Record<string, string> = {
			"/work/.pi/subagent-status.json": JSON.stringify({ refreshMs: 750 }),
			"/global/subagent-status.json": JSON.stringify({
				completionGraceMs: 2500,
				maxAgents: 12,
			}),
		};
		const result = loadConfig({
			cwd: "/work",
			globalDir: "/global",
			readFile: (path) => files[path],
		});
		expect(result.config).toEqual({
			shortcut: "ctrl+shift+o",
			completionGraceMs: 2500,
			refreshMs: 750,
			maxAgents: 12,
		});
		expect(result.warnings).toEqual([]);
	});

	it("uses exact defaults when files are absent", () => {
		expect(
			loadConfig({
				cwd: "/work",
				globalDir: "/global",
				readFile: () => undefined,
			}).config,
		).toEqual(DEFAULT_CONFIG);
	});

	it("defaults invalid fields and reports one warning per field", () => {
		const result = loadConfig({
			cwd: "/work",
			globalDir: "/global",
			readFile: (path) =>
				path.startsWith("/work")
					? JSON.stringify({
							completionGraceMs: -1,
							refreshMs: 499,
							maxAgents: 101,
							shortcut: "",
						})
					: undefined,
		});
		expect(result.config).toEqual(DEFAULT_CONFIG);
		expect(result.warnings).toEqual([
			"Invalid project shortcut; using fallback.",
			"Invalid project completionGraceMs; using fallback.",
			"Invalid project refreshMs; using fallback.",
			"Invalid project maxAgents; using fallback.",
		]);
	});

	it("falls through an invalid project field to a valid global value", () => {
		const files: Record<string, string> = {
			"/work/.pi/subagent-status.json": JSON.stringify({ refreshMs: 100 }),
			"/global/subagent-status.json": JSON.stringify({ refreshMs: 2500 }),
		};
		const result = loadConfig({
			cwd: "/work",
			globalDir: "/global",
			readFile: (path) => files[path],
		});
		expect(result.config.refreshMs).toBe(2500);
		expect(result.warnings).toContain(
			"Invalid project refreshMs; using fallback.",
		);
	});

	it("falls through invalid values at every layer to the default", () => {
		const files: Record<string, string> = {
			"/work/.pi/subagent-status.json": JSON.stringify({ maxAgents: 0 }),
			"/global/subagent-status.json": JSON.stringify({ maxAgents: 101 }),
		};
		const result = loadConfig({
			cwd: "/work",
			globalDir: "/global",
			readFile: (path) => files[path],
		});
		expect(result.config.maxAgents).toBe(DEFAULT_CONFIG.maxAgents);
		expect(result.warnings).toEqual([
			"Invalid project maxAgents; using fallback.",
			"Invalid global maxAgents; using fallback.",
		]);
	});

	it("does not throw when warning delivery fails", () => {
		const warn = vi.fn(() => {
			throw new Error("host unavailable");
		});
		expect(() =>
			loadConfig({
				cwd: "/work",
				globalDir: "/global",
				readFile: (path) => (path.startsWith("/work") ? "{" : undefined),
				warn,
			}),
		).not.toThrow();
		expect(warn).toHaveBeenCalledOnce();
	});

	it("survives malformed JSON and preserves a valid lower-precedence field", () => {
		const files: Record<string, string> = {
			"/work/.pi/subagent-status.json": "{",
			"/global/subagent-status.json": JSON.stringify({ refreshMs: 2000 }),
		};
		const result = loadConfig({
			cwd: "/work",
			globalDir: "/global",
			readFile: (path) => files[path],
		});
		expect(result.config.refreshMs).toBe(2000);
		expect(result.warnings).toContain(
			"Malformed project configuration; using fallback.",
		);
	});

	it.each([
		["completionGraceMs", 0],
		["completionGraceMs", 60_000],
		["refreshMs", 500],
		["refreshMs", 5_000],
		["maxAgents", 1],
		["maxAgents", 100],
	] as const)("accepts boundary %s=%s", (field, value) => {
		const result = loadConfig({
			cwd: "/work",
			globalDir: "/global",
			readFile: (path) =>
				path.startsWith("/work")
					? JSON.stringify({ [field]: value })
					: undefined,
		});
		expect(result.config[field]).toBe(value);
	});

	it("rejects an unsupported shortcut identifier without crashing", () => {
		const result = loadConfig({
			cwd: "/work",
			globalDir: "/global",
			readFile: (path) =>
				path.startsWith("/work")
					? JSON.stringify({ shortcut: "not a binding" })
					: undefined,
		});
		expect(result.config.shortcut).toBe("ctrl+shift+o");
	});
});
