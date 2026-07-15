import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SubagentStatusConfig } from "./domain/model.js";

export const DEFAULT_CONFIG: Readonly<SubagentStatusConfig> = Object.freeze({
	shortcut: "ctrl+shift+o",
	completionGraceMs: 10_000,
	refreshMs: 1_000,
	maxAgents: 100,
});

type ConfigKey = keyof SubagentStatusConfig;
type PartialConfig = Partial<Record<ConfigKey, unknown>>;

export interface LoadConfigOptions {
	cwd: string;
	globalDir?: string;
	homeDir?: string;
	readFile?: (path: string) => string | undefined;
	warn?: (message: string) => void;
}

export interface ConfigResult {
	config: SubagentStatusConfig;
	warnings: string[];
}

const validators: {
	[K in ConfigKey]: (value: unknown) => value is SubagentStatusConfig[K];
} = {
	shortcut: (value): value is string =>
		typeof value === "string" && /^[a-z0-9]+(?:\+[a-z0-9]+)+$/i.test(value),
	completionGraceMs: (value): value is number =>
		Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 60_000,
	refreshMs: (value): value is number =>
		Number.isInteger(value) && Number(value) >= 500 && Number(value) <= 5_000,
	maxAgents: (value): value is number =>
		Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100,
};

function readJson(
	path: string,
	readFile: (path: string) => string | undefined,
): PartialConfig | undefined | "malformed" {
	const contents = readFile(path);
	if (contents === undefined) return undefined;
	try {
		const parsed: unknown = JSON.parse(contents);
		return parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as PartialConfig)
			: "malformed";
	} catch {
		return "malformed";
	}
}

export function loadConfig(options: LoadConfigOptions): ConfigResult {
	const readFile =
		options.readFile ??
		((path: string) => {
			try {
				return readFileSync(path, "utf8");
			} catch {
				return undefined;
			}
		});
	const globalDir =
		options.globalDir ?? join(options.homeDir ?? homedir(), ".pi", "agent");
	const sources = [
		{
			name: "project",
			value: readJson(
				join(options.cwd, ".pi", "subagent-status.json"),
				readFile,
			),
		},
		{
			name: "global",
			value: readJson(join(globalDir, "subagent-status.json"), readFile),
		},
	] as const;
	const warnings: string[] = [];
	const config = { ...DEFAULT_CONFIG };

	for (const key of Object.keys(DEFAULT_CONFIG) as ConfigKey[]) {
		for (const source of sources) {
			if (source.value === "malformed") continue;
			const candidate = source.value?.[key];
			if (candidate === undefined) continue;
			if (validators[key](candidate)) {
				(config as Record<ConfigKey, unknown>)[key] = candidate;
				break;
			}
			warnings.push(`Invalid ${source.name} ${key}; using fallback.`);
		}
	}
	for (const source of sources) {
		if (source.value === "malformed")
			warnings.push(`Malformed ${source.name} configuration; using fallback.`);
	}
	for (const warning of [...new Set(warnings)]) {
		try {
			options.warn?.(warning);
		} catch {
			/* Host warning delivery must not break configuration. */
		}
	}
	return { config, warnings: [...new Set(warnings)] };
}
