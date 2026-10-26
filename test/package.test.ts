import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { z } from "zod";
import { DefaultPackageManager, loadSkills, SettingsManager } from "@earendil-works/pi-coding-agent";
import packageMetadata from "../package.json" with { type: "json" };

const execFileAsync = promisify(execFile);
// npm is a .cmd shim on Windows, which Node only runs through a shell.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// Reproduce config inherited by prepublishOnly during npm publish --dry-run.
const npmOptions = (cwd: string) => ({
	cwd,
	shell: process.platform === "win32",
	env: { ...process.env, npm_config_dry_run: "true" },
});
const packReportSchema = z.object({
	filename: z.string(),
	files: z.array(z.object({ path: z.string() })),
});
const packOutputSchema = z.union([
	z.array(packReportSchema).nonempty(),
	z.record(z.string(), packReportSchema),
]);

test("npm metadata targets the fork's public preview without renaming its CLI", async () => {
	assert.equal(packageMetadata.name, "@jellyfish-p/codex-computer-use-mcp");
	assert.deepEqual(packageMetadata.publishConfig, {
		access: "public",
		tag: "windows-preview",
		registry: "https://registry.npmjs.org/",
	});
	assert.equal(packageMetadata.repository.url, "git+https://github.com/jellyfish-p/codex-computer-use-mcp.git");
	assert.equal(packageMetadata.bugs.url, "https://github.com/jellyfish-p/codex-computer-use-mcp/issues");
	assert.equal(packageMetadata.homepage, "https://github.com/jellyfish-p/codex-computer-use-mcp#readme");
	assert.deepEqual(packageMetadata.bin, { "codex-computer-use-mcp": "dist/mcp-server.js" });
	const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
	assert.equal(lock.name, packageMetadata.name);
	assert.equal(lock.version, packageMetadata.version);
	assert.equal(lock.packages[""].name, packageMetadata.name);
	assert.equal(lock.packages[""].version, packageMetadata.version);
});

test("scoped package installs and discovers its Pi skill even during a publish dry-run", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "computer-use-package-test."));
	try {
		const projectRoot = process.cwd();
		const sourceRoot = path.join(root, "source");
		await cp(projectRoot, sourceRoot, {
			recursive: true,
			filter: (entry) => ![".git", "dist", "node_modules"].includes(path.relative(projectRoot, entry).split(path.sep)[0]),
		});
		// A junction needs no symlink privilege on Windows.
		await symlink(path.join(projectRoot, "node_modules"), path.join(sourceRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
		// Only the temporary test pack/install must write files; the outer publish stays a dry run.
		const { stdout } = await execFileAsync(npm, ["pack", "--dry-run=false", "--json", "--pack-destination", root], npmOptions(sourceRoot));
		const parsedReport = packOutputSchema.parse(JSON.parse(stdout));
		const report = Array.isArray(parsedReport) ? parsedReport[0] : Object.values(parsedReport)[0];
		assert.ok(report);
		const files = report.files.map((item) => item.path).sort();
		for (const required of [
			"README.md",
			"SECURITY.md",
			"dist/mcp-server.js",
			"dist/version.js",
			"integrations/pi/index.ts",
			"skills/computer-use/SKILL.md",
			"skills/computer-use/references/windows.md",
			"skills/computer-use/references/macos.md",
			"package.json",
		]) assert.ok(files.includes(required), required);
		assert.equal(files.some((file) => file.startsWith("docs/")), false, "local upstream reference snapshots must not be published");
		for (const excluded of ["package-lock.json", "src/version.ts", "test/package.test.ts", "tsconfig.json"]) {
			assert.equal(files.includes(excluded), false, excluded);
		}

		const consumer = path.join(root, "consumer");
		await mkdir(consumer);
		await writeFile(path.join(consumer, "package.json"), '{"private":true}\n');
		await execFileAsync(npm, ["install", "--dry-run=false", "--no-audit", "--no-fund", path.join(root, report.filename)], npmOptions(consumer));

		const installedRoot = path.join(consumer, "node_modules", packageMetadata.name);
		const installedPackage = JSON.parse(await readFile(path.join(installedRoot, "package.json"), "utf8"));
		assert.equal(installedPackage.name, packageMetadata.name);
		assert.equal(installedPackage.version, packageMetadata.version);
		await access(path.join(consumer, "node_modules", ".bin", process.platform === "win32" ? "codex-computer-use-mcp.cmd" : "codex-computer-use-mcp"));
		// Registry installs never run prepare; it only builds git and source checkouts.
		assert.equal(installedPackage.scripts.prepare, "npm run build");
		assert.deepEqual(Object.keys(installedPackage.dependencies).sort(), ["@modelcontextprotocol/sdk", "zod"]);
		await assert.rejects(access(path.join(consumer, "node_modules", "typescript")));
		await assert.rejects(access(path.join(consumer, "node_modules", "@types", "node")));

		const agentDir = path.join(root, "pi-agent");
		const packages = new DefaultPackageManager({ cwd: consumer, agentDir, settingsManager: SettingsManager.inMemory() });
		const resources = await packages.resolveExtensionSources([installedRoot], { temporary: true });
		// Use Pi's package discovery and skill parser without loading the user's global skills.
		const { skills, diagnostics } = loadSkills({
			cwd: consumer,
			agentDir,
			includeDefaults: false,
			skillPaths: resources.skills.filter((resource) => resource.enabled).map((resource) => resource.path),
		});
		assert.deepEqual(diagnostics, []);
		assert.deepEqual(skills.map((skill) => skill.name), ["computer-use"]);
		assert.equal(skills[0].disableModelInvocation, false);
		assert.equal(skills[0].filePath, path.join(installedRoot, "skills", "computer-use", "SKILL.md"));
		for (const platform of ["windows", "macos"]) {
			await access(path.join(skills[0].baseDir, "references", `${platform}.md`));
		}

		const status = await execFileAsync(process.execPath, [path.join(installedRoot, "dist", "mcp-server.js"), "--status"]);
		assert.equal(JSON.parse(status.stdout).permissionMode, "no-permissions");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
