import { Renderer } from "@freelensapp/extensions";
import { ENVOY_VERSION, type EnvoySpec, type EnvoyStatus } from "./domain";

export class EnvoyResource extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.KubeObjectMetadata, EnvoyStatus, EnvoySpec
> {
  static readonly namespaced = true;
}

// Models share a schema-tolerant spec so new Envoy fields remain visible without an extension release.
function resource(kind: string, plural: string, singular: string, title: string, description: string, policy = false) {
  class Model extends EnvoyResource {
    static readonly kind = kind;
    static readonly apiBase = `/apis/${ENVOY_VERSION}/${plural}`;
    static readonly crd = { apiVersions: [ENVOY_VERSION], plural, singular };
  }
  return { kind, plural, title, description, policy, Model };
}

export const resources = [
  resource("EnvoyProxy", "envoyproxies", "envoyproxy", "Envoy Proxies", "Data-plane deployment, service, logging and telemetry configuration."),
  resource("ClientTrafficPolicy", "clienttrafficpolicies", "clienttrafficpolicy", "Client Traffic Policies", "Downstream TLS, client IP detection, headers and connection settings.", true),
  resource("BackendTrafficPolicy", "backendtrafficpolicies", "backendtrafficpolicy", "Backend Traffic Policies", "Rate limits, retries, timeouts, health checks and load balancing.", true),
  resource("SecurityPolicy", "securitypolicies", "securitypolicy", "Security Policies", "JWT, OIDC, CORS, authorization and external authentication.", true),
  resource("EnvoyExtensionPolicy", "envoyextensionpolicies", "envoyextensionpolicy", "Extension Policies", "Wasm, Lua, external processing and other Envoy extensions.", true),
  resource("EnvoyPatchPolicy", "envoypatchpolicies", "envoypatchpolicy", "Patch Policies", "JSON patches applied to generated Envoy xDS configuration.", true),
  resource("Backend", "backends", "backend", "Backends", "Envoy-specific backend endpoints and connection configuration."),
  resource("HTTPRouteFilter", "httproutefilters", "httproutefilter", "HTTP Route Filters", "Extended route matching, rewrites, direct responses and credential injection."),
];

export type ResourceDefinition = typeof resources[number];
export type EnvoyStore = Renderer.K8sApi.KubeObjectStore<EnvoyResource>;

export function availableStore(definition: ResourceDefinition): EnvoyStore | undefined {
  try {
    return definition.Model.getStore<EnvoyResource>();
  } catch {
    // Discovery is observable; observer components retry when the API registry changes.
    return undefined;
  }
}