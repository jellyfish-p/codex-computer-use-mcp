import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { planRelease, publishArtifact, verifyArtifact } from "../tools/release.ts";

test("release tags select isolated preview and stable channels", () => {
	assert.deepEqual(planRelease("0.6.2-windows.4", "v0.6.2-windows.4"), {
		version: "0.6.2-windows.4",
		tag: "v0.6.2-windows.4",
		npmTag: "windows-preview",
		prerelease: true,
		title: "Windows preview v0.6.2-windows.4",
	});
	assert.deepEqual(planRelease("0.6.3", "v0.6.3"), {
		version: "0.6.3",
		tag: "v0.6.3",
		npmTag: "latest",
		prerelease: false,
		title: "Release v0.6.3",
	});
	assert.throws(() => planRelease("0.6.3", "v0.6.4"), /must match/);
	assert.throws(() => planRelease("0.6.3-beta.1"), /Unsupported release version/);
	assert.throws(() => planRelease("01.2.3"), /Unsupported release version/);
});

test("the release CLI emits GitHub metadata and refuses publishing outside a tag push", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "release-cli."));
	const script = fileURLToPath(new URL("../tools/release.ts", import.meta.url));
	const output = path.join(directory, "github-output");
	const env = { ...process.env, GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v0.6.3", GITHUB_EVENT_NAME: "pull_request", GITHUB_OUTPUT: output };
	try {
		await writeFile(path.join(directory, "package.json"), JSON.stringify({ name: "@jellyfish-p/codex-computer-use-mcp", version: "0.6.3" }));
		const result = spawnSync(process.execPath, [script, "metadata"], { cwd: directory, env, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		assert.equal(JSON.parse(result.stdout).npmTag, "latest");
		assert.match(await readFile(output, "utf8"), /npm-tag=latest\n/);
		assert.match(await readFile(output, "utf8"), /prerelease=false\n/);
		const denied = spawnSync(process.execPath, [script, "publish", "missing-artifact"], { cwd: directory, env, encoding: "utf8" });
		assert.notEqual(denied.status, 0);
		assert.match(denied.stderr, /tag push/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

async function artifactFixture(version = "0.6.2-windows.4") {
	const directory = await mkdtemp(path.join(os.tmpdir(), "release-artifact."));
	const content = Buffer.from("prepared package fixture");
	const manifest = {
		name: "@jellyfish-p/codex-computer-use-mcp",
		version,
		filename: `jellyfish-p-codex-computer-use-mcp-${version}.tgz`,
		commit: "verified-commit",
		sha256: createHash("sha256").update(content).digest("hex"),
		integrity: `sha512-${createHash("sha512").update(content).digest("base64")}`,
	};
	await writeFile(path.join(directory, manifest.filename), content);
	await writeFile(path.join(directory, "build-manifest.json"), JSON.stringify(manifest));
	return { directory, manifest };
}

test("new versions publish the verified archive to the selected channel with provenance", async () => {
	for (const [version, npmTag] of [["0.6.2-windows.4", "windows-preview"], ["0.6.3", "latest"]]) {
		const { directory, manifest } = await artifactFixture(version);
		const calls: string[][] = [];
		try {
			const result = publishArtifact(directory, `v${version}`, "verified-commit", (args, cwd) => {
				assert.equal(cwd, directory);
				calls.push(args);
				return args[0] === "view"
					? { status: 1, stdout: '{"error":{"code":"E404"}}', stderr: "not found" }
					: { status: 0, stdout: "published", stderr: "" };
			});
			assert.equal(result, "published");
			assert.deepEqual(calls[1], ["publish", `./${manifest.filename}`, "--access", "public", "--tag", npmTag, "--provenance", "--registry", "https://registry.npmjs.org/"]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}
});

test("release retries skip only identical published content and stop on registry failures", async () => {
	const { directory, manifest } = await artifactFixture();
	try {
		const existing = publishArtifact(directory, "v0.6.2-windows.4", "verified-commit", (args) => {
			assert.equal(args[0], "view", "an existing version must not be published twice");
			return { status: 0, stdout: JSON.stringify(manifest.integrity), stderr: "" };
		});
		assert.equal(existing, "already-published");
		assert.throws(() => publishArtifact(directory, "v0.6.2-windows.4", "verified-commit", () => ({
			status: 0, stdout: '"sha512-different"', stderr: "",
		})), /different content/);
		assert.throws(() => publishArtifact(directory, "v0.6.2-windows.4", "verified-commit", (args) => {
			assert.equal(args[0], "view");
			return { status: 1, stdout: '{"error":{"code":"E403"}}', stderr: "registry denied" };
		}), /registry lookup failed/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("release artifacts must match their package, tag, commit and content hashes", async () => {
	const { directory, manifest } = await artifactFixture();
	try {
		const artifact = verifyArtifact(directory, "v0.6.2-windows.4", "verified-commit");
		assert.equal(artifact.name, "@jellyfish-p/codex-computer-use-mcp");
		assert.equal(artifact.plan.npmTag, "windows-preview");
		assert.equal(artifact.integrity, manifest.integrity);
		assert.throws(() => verifyArtifact(directory, "v0.6.2-windows.5", "verified-commit"), /must match/);
		assert.throws(() => verifyArtifact(directory, "v0.6.2-windows.4", "another-commit"), /commit/);
		await writeFile(path.join(directory, manifest.filename), "changed bytes");
		assert.throws(() => verifyArtifact(directory, "v0.6.2-windows.4", "verified-commit"), /checksum/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
