# Freelens Envoy Gateway extension

An **Envoy Gateway companion for Freelens 2**, adding dedicated views for Envoy-specific policies and configuration alongside the standard Gateway API extension.

This is an independent plugin, not a fork. Keep `@freelensapp/gateway-api-extension` installed for GatewayClasses, Gateways, HTTPRoutes and the other standard Gateway API resources. This plugin adds an **Envoy Gateway** sidebar and contributes Envoy attachment sections to their existing details drawers, without registering duplicate Gateway API models.

## Requirements

- Freelens **2.x**. Freelens 1.x uses a different extension API and is not supported.
- Envoy Gateway with the desired CRDs served under `gateway.envoyproxy.io/v1alpha1`.
- Your existing Freelens Kubernetes identity must be able to discover those APIs and `get`, `list`, and `watch` the resources in the namespaces you use. This extension does not change cluster permissions or install CRDs.
- The Gateway API extension **1.x** is recommended for the standard resource pages; the Envoy resource pages work independently.

## Install

Open Freelens **Extensions** (`Ctrl+Shift+E`) and choose one of the following methods. Enable the extension for your cluster after installation.

### From npm

Once the package has been published, enter **`@maltazar/freelens-envoy-gateway-extension`** in the install field. The `@…` syntax refers to an npm package, not the GitHub repository name; a GitHub Release alone does not make package-name installation work.

Alternatively, open [Install in Freelens](freelens://app/extensions/install/%40maltazar%2Ffreelens-envoy-gateway-extension).

### From a GitHub Release

Open [Releases](https://github.com/Maltazar/freelens-envoy-extension/releases) and either:

- Paste the URL of the release's `.tgz` asset into Freelens Extensions. Freelens downloads its neighboring `.tgz.sha256` and verifies it.
- Download the `.zip` release asset and extract it. It contains the `.tgz` and its `.tgz.sha256`; keep them together and install the `.tgz` by local path or drag-and-drop.

The ZIP has its own `.zip.sha256` for verifying the download. **Do not install the ZIP directly**, and do not use GitHub's automatically generated **Source code** archives: those are not built extensions. If the repository is private, download the assets while signed into GitHub and install locally rather than giving Freelens an authenticated GitHub URL.

### Build a local package

1. Build and package with `npm run pack:local`.
2. Keep these files together:
   - `artifacts/maltazar-freelens-envoy-gateway-extension-0.1.0.tgz`
   - `artifacts/maltazar-freelens-envoy-gateway-extension-0.1.0.tgz.sha256`
3. In Freelens, open **Extensions** (`Ctrl+Shift+E`), enter the full path to the `.tgz`, and install it. Alternatively, drop the tarball onto the Freelens window. Freelens verifies the neighboring checksum file.
4. Enable the extension for your cluster and open **Envoy Gateway** in the cluster sidebar.

The command also produces a convenience `.zip` and `.zip.sha256`. No system ZIP utility is needed. If Freelens runs on a different machine or OS, including Windows while you build in WSL, copy the files to a directory accessible to the application. Local installation does not require npm publication or GitHub access.

### Develop from the directory

Use Node.js 24 or newer. From this directory, run `npm ci --ignore-scripts`, followed by `npm run build`. In Freelens Extensions, install the full path to this directory (the directory containing `package.json`). Freelens runs `dist/` in place and shows a development directory install as unverified.

Run `npm run dev` for rebuilds on source changes. Freelens 2 reloads a directory-installed extension after its entry points change. Restart Freelens if you change the manifest's `main` or `renderer` paths.

## What you can see

The **Overview** shows object counts and controller-reported status, filtered by your selected namespaces, with links to objects requiring attention.

Each resource has a native Freelens list with sorting, namespace filtering, search, age, status and configured-setting names. Policy lists also show target references and label selectors. Click a row for its conditions, ancestor/controller diagnostics, attachment targets, and expandable JSON sections containing the explicit spec values, including fields added by newer Envoy releases.

| Sidebar page | Kind | Configuration |
| --- | --- | --- |
| Envoy Proxies | `EnvoyProxy` | Data-plane deployment/service, logging, telemetry, bootstrap and other proxy settings |
| Client Traffic Policies | `ClientTrafficPolicy` | Downstream TLS, headers, client IP detection and connections |
| Backend Traffic Policies | `BackendTrafficPolicy` | Rate limits, retries, timeouts, health checks, circuit breakers and load balancing |
| Security Policies | `SecurityPolicy` | JWT, OIDC, CORS, authentication and authorization |
| Extension Policies | `EnvoyExtensionPolicy` | Lua, Wasm, external processing and extensions |
| Patch Policies | `EnvoyPatchPolicy` | JSON patches targeting generated xDS resources |
| Backends | `Backend` | Envoy-specific backend endpoints and connection configuration |
| HTTP Route Filters | `HTTPRouteFilter` | Extended matches, rewrites, direct responses and credential injection |

All eight are namespaced `gateway.envoyproxy.io/v1alpha1` resources. Missing optional APIs display an availability message rather than preventing other pages from working. Discovery updates reactively if an API becomes available. Supported kinds are omitted from Freelens' Custom Resources sidebar tree while the extension is enabled; their CRD definitions remain accessible.

### Gateway API details

The details drawers for GatewayClass, Gateway, HTTPRoute, GRPCRoute, TCPRoute, TLSRoute, UDPRoute and ListenerSet gain an **Envoy Gateway attachments** section. It shows:

- EnvoyProxy parameters referenced by a GatewayClass or Gateway.
- Envoy Backend and HTTPRouteFilter references used by route rules, including mirror backends and backend-level extension filters.
- Policies directly targeting the object through `targetRef` or `targetRefs`, retaining `sectionName`.
- Policies matching the object's labels through same-namespace `targetSelectors`, including label expressions.

References link to native object details when the target API is discovered. The related-policy lists follow selected namespaces; include the object's namespace to see its policies.

### Status meaning

- **Accepted**: each reported condition group has a positive acceptance/readiness/reference result, without reported failures or warnings.
- **Attention**: a current condition reports rejection, unresolved references, degradation, overriding, conflict or a warning. Read the details for the exact controller reason and message.
- **Pending**: reported conditions refer to an older generation of the resource.
- **Unknown**: conditions are indeterminate or an ancestor lacks a positive result.
- **Not reported**: no conditions have been published. Some resources, notably HTTPRouteFilter, do not have a status subresource. Absence of conditions is not treated as success or failure.

These are summaries of Kubernetes conditions, **not an end-to-end traffic health check**.

## Scope and limitations

- This targets **Envoy Gateway**, not Istio's `EnvoyFilter`, Contour or every application embedding Envoy.
- It displays configured and reported state. It does **not** calculate effective policy inheritance, merging or precedence, and does not infer a Gateway policy onto every child route.
- Cross-namespace target selectors remain visible in policy configuration but are not resolved into related-object matches. Authorization depends on ReferenceGrants and controller watch scope.
- It does not collect live request metrics, access logs, xDS/config dumps or Envoy admin statistics. Use your observability tools and Freelens' workload views for those.
- `EnvoyGateway` control-plane configuration is not registered as a CRD page: its configuration API is normally stored in a ConfigMap/file, not a served EnvoyGateway Kubernetes resource.
- Referenced Secrets are not fetched. Explicit CRD spec values are displayed as returned by Kubernetes; treat inline configuration as sensitive where appropriate.
- There are no background cluster writes. Native Freelens list actions, including edits and deletion where available, remain subject to your existing RBAC.

## Development and verification

| Command | Purpose |
| --- | --- |
| `npm ci --ignore-scripts` | Install the locked build/test dependencies without dependency lifecycle scripts |
| `npm run dev` | Watch and rebuild both ESM entry points |
| `npm run typecheck` | Check application and test types against the published Freelens SDK |
| `npm test` | Run domain, registration, React UI and subscription-lifecycle tests |
| `npm run test:release` | Test version validation and real TGZ/ZIP packaging; run after a build |
| `npm run check` | Typecheck, test, build, smoke-test the bundles and test release packaging |
| `npm run pack:local` | Run all checks and produce `.tgz`, `.tgz.sha256`, `.zip` and `.zip.sha256` |
| `npm run pack:local -- --tag v0.1.0` | Additionally require the release tag to match the package/lockfile version |

The `.npmrc` disables install lifecycle scripts. `pack:local` runs validation explicitly before packing, so it does not depend on npm automatically running `prepack`.

The bundle smoke test loads both emitted entry points using the documented Freelens 2 globals, renders all nine pages with unavailable APIs, checks CSS delivery, and rejects duplicate bundled React/MobX. Release tests pack the actual built extension, inspect its manifest and runtime assets, validate both sidecars, and confirm the ZIP contains the exact installable tarball and checksum. The tests use Node.js and the standard `tar` utility (available on GitHub's Ubuntu runners). UI tests use a small host adapter; they do not prove behavior inside the actual Electron application or against a live Kubernetes cluster.

For live verification, install alongside the Gateway API extension and check:

1. Overview/list counts follow namespace changes, and policy search finds targets and configured setting names.
2. A policy row opens its conditions, ancestor reasons, target links and configured settings.
3. A route or Gateway drawer shows its direct Envoy attachments and opens referenced objects.
4. Optional missing CRDs and denied access produce useful messages without breaking other pages.
5. Disable/re-enable the extension and switch clusters to confirm menus, drawers and watches clean up correctly.

No API keys, `.env`, telemetry service or separate backend are required.

## CI and releases

### CI

`.github/workflows/ci.yml` runs for pull requests to `main`, pushes to `main`, and manual dispatches. It installs the lockfile with dependency scripts disabled, runs the full validation/package flow, verifies all checksums, and uploads an **extension-preview** workflow artifact retained for seven days. Extract the workflow artifact to find the installable files; it is not itself a Freelens package. CI never publishes to npm or creates a GitHub Release.

For branch protection, require **CI / Validate and package**. Third-party actions are pinned to verified release commit hashes, and checkout does not persist Git credentials.

### Create a release

1. Commit and push these workflows to `main` and ensure CI passes. GitHub Actions must be enabled for the repository.
2. Set the desired package version with `npm version patch --no-git-tag-version` (or use `minor`, `major`, or an explicit version). This updates both `package.json` and `package-lock.json`. For the first `0.1.0` release, the existing version is already set.
3. Commit both version files, push `main`, and wait for CI to pass.
4. Create an annotated tag matching that exact version, for example `git tag -a v0.1.0 -m "Release 0.1.0"`, then push it with `git push origin v0.1.0`.

`.github/workflows/release.yml` handles `v*` tag pushes. It rejects a tag/version mismatch or stale lockfile, validates and packages the extension, then creates a GitHub Release with generated notes and these assets:

- `maltazar-freelens-envoy-gateway-extension-0.1.0.tgz`
- `maltazar-freelens-envoy-gateway-extension-0.1.0.tgz.sha256`
- `maltazar-freelens-envoy-gateway-extension-0.1.0.zip`
- `maltazar-freelens-envoy-gateway-extension-0.1.0.zip.sha256`

The filenames use the version being released. A prerelease such as `0.2.0-rc.1` gets a GitHub prerelease and npm's `next` dist-tag; stable versions use npm's `latest` dist-tag. Preview CI builds do not change the package version or any registry dist-tag.

Only the GitHub release job has `contents: write`; it uses GitHub's built-in token, so no personal access token is required. The optional npm job runs afterwards, uses the **same checked tarball**, installs no project dependencies, and has only read access plus OIDC permission. Release jobs do not use dependency caches.

Do not move published tags or reuse npm versions. For transient failures or corrected account/environment settings, rerun **only failed jobs** in Actions; successfully created releases and published npm versions are intentionally not overwritten. A rerun still uses the workflow from the original tag, so a workflow/code fix needs a new version/tag.

### Enable package-name installation: one-time npm setup

GitHub release downloads work without this setup. To enable installation by `@maltazar/freelens-envoy-gateway-extension`, you must own the **`@maltazar` npm scope** and publish the package publicly. Public npm publication exposes the package contents even if the GitHub repository is private.

1. Leave the repository variable **`PUBLISH_TO_NPM`** unset for the first GitHub release. Download its `.tgz` asset, sign into your npm account locally using `npm login`, and publish that exact file with `npm publish ./artifacts/maltazar-freelens-envoy-gateway-extension-0.1.0.tgz --access public --ignore-scripts` (place the downloaded file in `artifacts/`, or use its actual local path). Keep the leading `./`: npm can interpret a bare `artifacts/name.tgz` argument as a GitHub repository shorthand instead of a local file. Complete authentication/2FA directly in your terminal/browser; do not put credentials in the repository. This initial publish creates the package whose settings hold the trusted publisher configuration.
2. In GitHub, create an environment named **`npm`** under **Settings → Environments**. Optionally require maintainer approval and allow only release tags for deployment.
3. In the npm package's **Settings → Trusted publishing**, add a GitHub Actions publisher with these exact values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `Maltazar` |
   | Repository | `freelens-envoy-extension` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |
   | Allowed actions | Enable direct **`npm publish`** |

4. In GitHub **Settings → Secrets and variables → Actions → Variables**, add the **repository variable** `PUBLISH_TO_NPM` with value `true`. This is a flag, not a secret. Do not configure it only as an environment variable: the workflow uses it before entering the environment.
5. Release the **next unpublished version**, for example `0.1.1`, through a matching tag. npm's trusted-publisher configuration must complete its first successful automated publish within two days of creation; recreate an expired configuration if necessary. Do not rerun npm publication of the manually bootstrapped version.

The workflow uses Node 24 with an OIDC-capable npm (npm 11.5.1 or later). It needs **no `NPM_TOKEN` secret**: the `npm` environment and `release.yml` identity must match the npm configuration, and `id-token: write` is scoped to the publishing job. npm automatically adds provenance for public packages built from public repositories; private repositories do not get that provenance. Keep the manifest's `repository.url` matching this GitHub repository.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for account setup and troubleshooting. These workflows are configured locally; pushing a tag and completing npm account setup are what activate publication.

## References and attribution

- [Freelens Gateway API extension](https://github.com/freelensapp/freelens-gateway-api-extension): companion extension and reference for native list/detail integration.
- [Freelens 2 extension API contracts](https://github.com/freelensapp/freelens/blob/main/docs/extensions/api.md): runtime globals, shared React/MobX, resource registration and stylesheet loading.
- [Envoy Gateway API reference](https://gateway.envoyproxy.io/docs/api/extension_types/): resource fields and status conventions.

The build-time host-library bridge follows the MIT-licensed Freelens Gateway API extension's singleton bridging pattern. This project is not an official Freelens or Envoy project. Licensed under MIT; see [LICENSE](LICENSE).
