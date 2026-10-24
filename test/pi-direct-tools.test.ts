import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import adapter, { computerUseToolName } from "../integrations/pi/index.ts";
import { MAC_PLATFORM, WINDOWS_PLATFORM } from "../src/platform.ts";
import type { DirectMethod } from "../src/tools.ts";

for (const platform of [MAC_PLATFORM, WINDOWS_PLATFORM]) {
	test(`Pi calls ${platform.name} tools directly without registering codemode`, async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "pi-direct-tools."));
		try {
			const names = platform.methods.map(computerUseToolName);
			const calls: DirectMethod[] = [];
			const settingsManager = SettingsManager.inMemory({
				defaultTools: names.map((name) => `+${name}`),
				cacheWarming: "off",
			});
			const resourceLoader = new DefaultResourceLoader({
				cwd: root,
				agentDir: root,
				settingsManager,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				extensionFactories: [(pi) => adapter(pi, {
					async execute(method) {
						calls.push(method);
						return { isError: false, content: [{ type: "text", text: "official fixture" }] };
					},
					async close() {},
				}, platform)],
			});
			await resourceLoader.reload();
			assert.deepEqual(resourceLoader.getExtensions().errors, []);
			const modelRuntime = await ModelRuntime.create({
				authPath: path.join(root, "auth.json"),
				modelsPath: null,
				refreshOnCreate: false,
				allowModelNetwork: false,
			});
			const { session } = await createAgentSession({
				cwd: root,
				agentDir: root,
				settingsManager,
				resourceLoader,
				modelRuntime,
				sessionManager: SessionManager.inMemory(root),
			});
			try {
				await session.bindExtensions({});
				assert.equal(session.getAllTools().some((tool) => tool.name === "codemode"), false);
				const active = session.getActiveToolNames();
				for (const name of [...names, "read", "bash", "edit", "write"]) assert.ok(active.includes(name), name);
				// This is Pi's model-visible wrapped tool, not a raw adapter function.
				const tool = session.agent.state.tools.find((item) => item.name === "computer_use_list_apps");
				assert.ok(tool);
				const result = await tool.execute("direct-call", {}, new AbortController().signal);
				assert.deepEqual(result.content, [{ type: "text", text: "official fixture" }]);
				assert.deepEqual(calls, ["list_apps"]);
			} finally {
				session.dispose();
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
}
