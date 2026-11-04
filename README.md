# Freelens Envoy Gateway extension

An **Envoy Gateway companion for Freelens 2**, adding dedicated views for Envoy-specific policies and configuration alongside the standard Gateway API extension.

This is an independent plugin, not a fork. Keep `@freelensapp/gateway-api-extension` installed for GatewayClasses, Gateways, HTTPRoutes and the other standard Gateway API resources. This plugin adds an **Envoy Gateway** sidebar and contributes Envoy attachment sections to their existing details drawers, without registering duplicate Gateway API models.

## Requirements

- Freelens **2.x**. Freelens 1.x uses a different extension API and is not supported.
- Envoy Gateway with the desired CRDs served under `gateway.envoyproxy.io/v1alpha1`.
- Your existing Freelens Kubernetes identity must be able to discover those APIs and `get`, `list`, and `watch` the resources in the namespaces you use. This extension does not change cluster permissions or install CRDs.
- The Gateway API extension **1.x** is recommended for the standard resource pages; the Envoy resource pages work independently.

## Install locally

No Git remote, GitHub release or npm publication is needed.

### Install the built package

1. Build and package with `npm run pack:local`.
2. Keep these files together:
   - `artifacts/maltazar-freelens-envoy-gateway-extension-0.1.0.tgz`
   - `artifacts/maltazar-freelens-envoy-gateway-extension-0.1.0.tgz.sha256`
3. In Freelens, open **Extensions** (`Ctrl+Shift+E`), enter the full path to the `.tgz`, and install it. Alternatively, drop the tarball onto the Freelens window. Freelens verifies the neighboring checksum file.
4. Enable the extension for your cluster and open **Envoy Gateway** in the cluster sidebar.

If Freelens runs on a different machine or OS, including Windows while you build in WSL, copy both files to a directory accessible to the application. This package name is local; it is **not published to npm**.

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
| `npm run check` | Typecheck, test, build and smoke-test the emitted bundles |
| `npm run pack:local` | Run all checks, produce an installable tarball and its SHA-256 sidecar |

The `.npmrc` disables install lifecycle scripts. `pack:local` runs validation explicitly before packing, so it does not depend on npm automatically running `prepack`.

The bundle smoke test loads both emitted entry points using the documented Freelens 2 globals, renders all nine pages with unavailable APIs, checks CSS delivery, and rejects duplicate bundled React/MobX. UI tests use a small host adapter; they do not prove behavior inside the actual Electron application or against a live Kubernetes cluster.

For live verification, install alongside the Gateway API extension and check:

1. Overview/list counts follow namespace changes, and policy search finds targets and configured setting names.
2. A policy row opens its conditions, ancestor reasons, target links and configured settings.
3. A route or Gateway drawer shows its direct Envoy attachments and opens referenced objects.
4. Optional missing CRDs and denied access produce useful messages without breaking other pages.
5. Disable/re-enable the extension and switch clusters to confirm menus, drawers and watches clean up correctly.

No API keys, `.env`, telemetry service or separate backend are required.

## References and attribution

- [Freelens Gateway API extension](https://github.com/freelensapp/freelens-gateway-api-extension): companion extension and reference for native list/detail integration.
- [Freelens 2 extension API contracts](https://github.com/freelensapp/freelens/blob/main/docs/extensions/api.md): runtime globals, shared React/MobX, resource registration and stylesheet loading.
- [Envoy Gateway API reference](https://gateway.envoyproxy.io/docs/api/extension_types/): resource fields and status conventions.

The build-time host-library bridge follows the MIT-licensed Freelens Gateway API extension's singleton bridging pattern. This project is not an official Freelens or Envoy project. Licensed under MIT; see [LICENSE](LICENSE).