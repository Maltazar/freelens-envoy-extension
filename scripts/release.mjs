import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";
import semver from "semver";

export function releaseMetadata(manifest, tag) {
  const version = semver.parse(manifest.version);
  assert.ok(version && version.version === manifest.version && version.build.length === 0, "Use an exact SemVer package version without build metadata");
  assert.match(manifest.name, /^@[a-z0-9-]+\/[a-z0-9-]+$/, "Expected a scoped npm package name");
  if (tag !== undefined) assert.equal(tag, `v${manifest.version}`, "Release tag must equal v + package.json version");
  const tarball = `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`;
  return {
    version: manifest.version,
    tarball,
    zip: tarball.replace(/\.tgz$/, ".zip"),
    prerelease: version.prerelease.length > 0,
    dist_tag: version.prerelease.length > 0 ? "next" : "latest",
  };
}

async function readManifest(directory) {
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(join(directory, "package-lock.json"), "utf8"));
  assert.equal(lock.version, manifest.version, "Update package-lock.json when bumping the version");
  assert.equal(lock.packages[""].version, manifest.version, "Lockfile root package version is stale");
  assert.equal(lock.name, manifest.name, "Lockfile package name is stale");
  assert.equal(lock.packages[""].name, manifest.name, "Lockfile root package name is stale");
  return manifest;
}

export async function packRelease({ directory = process.cwd(), outputDirectory = join(directory, "artifacts"), tag } = {}) {
  const manifest = await readManifest(directory);
  const metadata = releaseMetadata(manifest, tag);
  await mkdir(outputDirectory, { recursive: true });
  const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", outputDirectory], {
    cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"],
  }));
  assert.equal(packed.length, 1, "Expected one extension tarball");
  assert.equal(packed[0].filename, metadata.tarball);
  const paths = packed[0].files.map(({ path }) => path);
  for (const required of ["package.json", manifest.main, manifest.renderer, manifest.renderer.replace(/\.js$/, ".css"), "README.md", "LICENSE"]) {
    assert.ok(paths.includes(required), `Tarball is missing ${required}`);
  }
  assert.ok(paths.every((path) => path.startsWith("dist/") || ["package.json", "README.md", "LICENSE"].includes(path)), "Unexpected development files in tarball");

  const tarball = await readFile(join(outputDirectory, metadata.tarball));
  const tarballChecksum = `${createHash("sha256").update(tarball).digest("hex")}  ${metadata.tarball}\n`;
  await writeFile(join(outputDirectory, `${metadata.tarball}.sha256`), tarballChecksum);
  const zip = zipSync({ [metadata.tarball]: tarball, [`${metadata.tarball}.sha256`]: Buffer.from(tarballChecksum) }, {
    level: 0, mtime: new Date("2000-01-01T00:00:00Z"),
  });
  await writeFile(join(outputDirectory, metadata.zip), zip);
  await writeFile(join(outputDirectory, `${metadata.zip}.sha256`), `${createHash("sha256").update(zip).digest("hex")}  ${metadata.zip}\n`);
  return metadata;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, tag] = process.argv.slice(2);
  assert.ok(mode === undefined || mode === "--tag" || mode === "--check-tag", "Usage: release.mjs [--tag VERSION | --check-tag VERSION]");
  if (mode) assert.ok(tag, "A release tag is required");
  if (mode === "--check-tag") {
    const metadata = releaseMetadata(await readManifest(process.cwd()), tag);
    for (const [key, value] of Object.entries(metadata)) console.log(`${key}=${value}`);
  } else {
    const metadata = await packRelease({ tag });
    console.log(`Created artifacts/${metadata.tarball}, artifacts/${metadata.zip} and their SHA-256 sidecars`);
  }
}