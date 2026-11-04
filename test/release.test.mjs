import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { unzipSync } from "fflate";
import { packRelease, releaseMetadata } from "../scripts/release.mjs";

test("release metadata enforces matching immutable versions and separates prereleases", () => {
  const manifest = { name: "@maltazar/freelens-envoy-gateway-extension", version: "0.1.0" };
  assert.deepEqual(releaseMetadata(manifest, "v0.1.0"), {
    version: "0.1.0", tarball: "maltazar-freelens-envoy-gateway-extension-0.1.0.tgz",
    zip: "maltazar-freelens-envoy-gateway-extension-0.1.0.zip", prerelease: false, dist_tag: "latest",
  });
  const prerelease = releaseMetadata({ ...manifest, version: "0.2.0-rc.1" }, "v0.2.0-rc.1");
  assert.equal(prerelease.prerelease, true);
  assert.equal(prerelease.dist_tag, "next");
  for (const tag of ["0.1.0", "v0.2.0", "main", "v0.1.0\nmalicious=true"]) {
    assert.throws(() => releaseMetadata(manifest, tag), /Release tag/);
  }
  for (const version of ["latest", "v0.1.0", "01.0.0", "0.1.0+build.1"]) {
    assert.throws(() => releaseMetadata({ ...manifest, version }), /SemVer/);
  }
});

test("real extension build packs into a verified installable tarball and portable ZIP", async () => {
  const directory = await mkdtemp(join(tmpdir(), "freelens-release-"));
  try {
    const manifest = JSON.parse(await readFile("package.json", "utf8"));
    const metadata = await packRelease({ outputDirectory: directory, tag: `v${manifest.version}` });
    assert.deepEqual((await readdir(directory)).sort(), [metadata.tarball, `${metadata.tarball}.sha256`, metadata.zip, `${metadata.zip}.sha256`].sort());
    for (const name of [metadata.tarball, metadata.zip]) {
      const digest = createHash("sha256").update(await readFile(join(directory, name))).digest("hex");
      assert.equal(await readFile(join(directory, `${name}.sha256`), "utf8"), `${digest}  ${name}\n`);
    }
    const entries = unzipSync(await readFile(join(directory, metadata.zip)));
    assert.deepEqual(Object.keys(entries).sort(), [metadata.tarball, `${metadata.tarball}.sha256`].sort());
    for (const [name, bytes] of Object.entries(entries)) {
      assert.deepEqual(Buffer.from(bytes), await readFile(join(directory, name)));
    }
    const archive = join(directory, metadata.tarball);
    const packedManifest = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
    assert.equal(packedManifest.name, "@maltazar/freelens-envoy-gateway-extension");
    assert.equal(packedManifest.version, manifest.version);
    assert.equal(packedManifest.engines.freelens, "^2.0.0");
    assert.equal(packedManifest.main, "dist/main.js");
    assert.equal(packedManifest.renderer, "dist/renderer.js");
    for (const asset of ["dist/main.js", "dist/renderer.js", "dist/renderer.css"]) {
      assert.deepEqual(execFileSync("tar", ["-xOf", archive, `package/${asset}`]), await readFile(asset));
    }
    const paths = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
    assert.ok(paths.includes("package/LICENSE"));
    assert.ok(paths.includes("package/README.md"));
    assert.ok(paths.every((path) => !/package\/(?:src|test|node_modules|\.github)\//.test(path)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});