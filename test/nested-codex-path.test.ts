import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const broker = await import("../src/direct-broker.ts");
const service = await import("../src/direct-service.ts");

// The nested app-server transport is macOS-only; Windows uses the @oai/sky helper.
const macTest = process.platform === "darwin" ? test : test.skip;

macTest("the nested Computer Use server receives only the verified Codex path", async (t) => {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "cu-nested-codex.")));
	const previous = { CODEX_CLI_PATH: process.env.CODEX_CLI_PATH };
	try {
		const codex = path.join(root, 'Official Codex "binary"');
		const alias = path.join(root, "configured-codex");
		const app = path.join(root, "Codex Computer Use.app");
		const client = path.join(app, "Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient");
		await mkdir(path.dirname(client), { recursive: true });
		await writeFile(client, "signed fixture\n");
		await writeFile(codex, "signed fixture\n");
		await symlink(codex, alias);
		const configPath = path.join(root, "config.json");
		await writeFile(configPath, JSON.stringify({ codexPath: alias, computerUseAppPath: app }));
		process.env.CODEX_CLI_PATH = "/ambient/unverified/codex";

		// SAFETY: the broker reads only status, stdout and stderr from these synchronous probes.
		t.mock.method(childProcess, "spawnSync", ((command: string, args: string[]) => {
			if (command === "/usr/bin/codesign") {
				return args[0] === "--verify" ? { status: 0, stdout: "", stderr: "" } : { status: 0, stdout: "", stderr: "TeamIdentifier=2DC432GLL2\n" };
			}
			if (command === codex && args[0] === "--version") return { status: 0, stdout: "codex-cli 1.0.0\n", stderr: "" };
			if (command === "/usr/bin/plutil") return { status: 0, stdout: "fixture-build\n", stderr: "" };
			throw new Error(`Unexpected verification command: ${command}`);
		}) as typeof childProcess.spawnSync);
		let spawned: unknown[] | undefined;
		t.mock.method(childProcess, "spawn", (...args: unknown[]) => {
			spawned = args;
			throw new Error("captured app-server spawn");
		});
		syncBuiltinESMExports();

		await assert.rejects(broker.createOfficialDirectToolSession({ configPath }), /captured app-server spawn/);
		assert.ok(spawned);
		assert.equal(spawned[0], codex);
		// SAFETY: the captured call is the broker's spawn(command, args, options) call.
		const args = spawned[1] as string[];
		// SAFETY: the same captured call always passes cwd and a complete env.
		const { cwd, env } = spawned[2] as { cwd: string; env: NodeJS.ProcessEnv };
		const table = args.find((arg) => arg.startsWith("mcp_servers="));
		assert.ok(table);
		const nativeEnv = /, env = \{ CODEX_CLI_PATH = ("(?:[^"\\]|\\.)*") \}/.exec(table);
		assert.ok(nativeEnv, "the nested server table must set CODEX_CLI_PATH");
		assert.equal(JSON.parse(nativeEnv[1]!), codex, "canonical verified binary, not the configured alias or ambient value");
		assert.deepEqual(args.map((arg) => arg === table ? table.replace(nativeEnv[0], "") : arg), broker.buildDirectAppServerArgs(cwd, client));
		assert.equal(env.CODEX_CLI_PATH, undefined, "the sanitized broker environment is unchanged");
		assert.equal(env.PATH, "/usr/bin:/bin:/usr/sbin:/sbin");

		assert.equal(service.getDirectStatus(root).codexPath, codex);
	} finally {
		t.mock.restoreAll();
		syncBuiltinESMExports();
		if (previous.CODEX_CLI_PATH === undefined) delete process.env.CODEX_CLI_PATH;
		else process.env.CODEX_CLI_PATH = previous.CODEX_CLI_PATH;
		await rm(root, { recursive: true, force: true });
	}
});

test("app-server args omit the nested env when no Codex path is supplied", () => {
	assert.doesNotMatch(broker.buildDirectAppServerArgs().join(" "), /CODEX_CLI_PATH/);
	assert.match(broker.buildDirectAppServerArgs("/tmp/work", "/tmp/client", "/Applications/Codex").join(" "), /tool_timeout_sec = 120, env = \{ CODEX_CLI_PATH = "\/Applications\/Codex" \} \}\}/);
});
