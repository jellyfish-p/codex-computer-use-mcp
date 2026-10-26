import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageName = "@jellyfish-p/codex-computer-use-mcp";

export interface ReleasePlan {
	version: string;
	tag: string;
	npmTag: "latest" | "windows-preview";
	prerelease: boolean;
	title: string;
}

/** Only the two release channels documented for this fork are published. */
export function planRelease(version: string, tag = `v${version}`): ReleasePlan {
	if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-windows\.(0|[1-9]\d*))?$/.test(version)) {
		throw new Error(`Unsupported release version: ${version}`);
	}
	if (tag !== `v${version}`) throw new Error("Release tag must match the package version");
	const prerelease = version.includes("-windows.");
	return {
		version,
		tag,
		npmTag: prerelease ? "windows-preview" : "latest",
		prerelease,
		title: prerelease ? `Windows preview ${tag}` : `Release ${tag}`,
	};
}

interface BuildManifest {
	name: string;
	version: string;
	filename: string;
	commit: string;
	sha256: string;
	integrity: string;
}

export interface ReleaseArtifact extends BuildManifest {
	plan: ReleasePlan;
}

/** Read only the artifact produced by the build job in this workflow run. */
export function verifyArtifact(directory: string, tag: string, commit: string): ReleaseArtifact {
	const manifest: BuildManifest = JSON.parse(readFileSync(path.join(directory, "build-manifest.json"), "utf8").replace(/^\uFEFF/, ""));
	if (manifest.name !== packageName) throw new Error("Unexpected release package name");
	const plan = planRelease(manifest.version, tag);
	if (!commit || manifest.commit !== commit) throw new Error("Artifact commit does not match this workflow run");
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tgz$/.test(manifest.filename)) throw new Error("Invalid artifact filename");
	const content = readFileSync(path.join(directory, manifest.filename));
	const sha256 = createHash("sha256").update(content).digest("hex");
	const integrity = `sha512-${createHash("sha512").update(content).digest("base64")}`;
	if (sha256 !== manifest.sha256 || integrity !== manifest.integrity) throw new Error("Artifact checksum mismatch");
	return { ...manifest, plan };
}

interface NpmResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

type RunNpm = (args: string[], cwd: string) => NpmResult;
const registry = "https://registry.npmjs.org/";

function runNpm(args: string[], cwd: string): NpmResult {
	// Arguments are fixed flags, validated versions and the build's basename, never free-form shell input.
	const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
		cwd,
		encoding: "utf8",
		shell: process.platform === "win32",
		timeout: 180_000,
	});
	if (result.error) throw result.error;
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Publishing uses the tested archive, not a rebuild or a lifecycle script on the release runner. */
export function publishArtifact(directory: string, tag: string, commit: string, npm: RunNpm = runNpm): "published" | "already-published" {
	const artifact = verifyArtifact(directory, tag, commit);
	const existing = npm(["view", `${artifact.name}@${artifact.version}`, "dist.integrity", "--json", "--registry", registry], directory);
	if (existing.status === 0) {
		if (JSON.parse(existing.stdout) !== artifact.integrity) throw new Error("This npm version already exists with different content");
		return "already-published";
	}
	let code: string | undefined;
	try { code = JSON.parse(existing.stdout).error?.code; } catch { /* Non-JSON network errors are not a missing package. */ }
	if (code !== "E404") throw new Error(`npm registry lookup failed: ${existing.stderr}`);
	const result = npm(["publish", `./${artifact.filename}`, "--access", "public", "--tag", artifact.plan.npmTag, "--provenance", "--registry", registry], directory);
	if (result.status !== 0) throw new Error(`npm publication failed: ${result.stderr}`);
	return "published";
}

function main(): void {
	if (process.argv[2] === "metadata") {
		const metadata: { name: string; version: string } = JSON.parse(readFileSync("package.json", "utf8"));
		if (metadata.name !== packageName) throw new Error("Unexpected release package name");
		const plan = planRelease(metadata.version, process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined);
		if (process.env.GITHUB_OUTPUT) {
			appendFileSync(process.env.GITHUB_OUTPUT, `npm-tag=${plan.npmTag}\nprerelease=${plan.prerelease}\nrelease-title=${plan.title}\n`);
		}
		console.log(JSON.stringify(plan));
		return;
	}
	if (process.argv[2] === "publish") {
		if (process.env.GITHUB_EVENT_NAME !== "push" || process.env.GITHUB_REF_TYPE !== "tag") {
			throw new Error("Automatic npm publication requires a version tag push");
		}
		console.log(publishArtifact(path.resolve(process.argv[3] ?? "release"), process.env.GITHUB_REF_NAME ?? "", process.env.GITHUB_SHA ?? ""));
		return;
	}
	throw new Error("Usage: node tools/release.ts metadata | publish [artifact-directory]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try { main(); }
	catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
