import { describe, expect, it } from "vitest";
import {
  attachments, conditionGroups, configurationKeys, ENVOY_GROUP, ENVOY_VERSION, envoyReferences,
  GATEWAY_GROUP, health, matchesLabels, referenceText, targetsText, type Condition, type ResourceData,
} from "../src/domain";

const accepted: Condition = { type: "Accepted", status: "True", observedGeneration: 2 };
const route: ResourceData = {
  apiVersion: `${GATEWAY_GROUP}/v1`, kind: "HTTPRoute",
  metadata: { name: "harbor", namespace: "harbor-app", labels: { app: "harbor", tier: "edge" } },
};
const policy: ResourceData = {
  apiVersion: ENVOY_VERSION, kind: "BackendTrafficPolicy",
  metadata: { name: "timeouts", namespace: "harbor-app", generation: 2 },
};

describe("controller-reported status", () => {
  it("handles absent, positive, rejected and unknown conditions without treating negative-polarity False as failure", () => {
    expect(health(policy)).toBe("Not reported");
    expect(health({ ...policy, status: { conditions: [accepted, { type: "Overridden", status: "False" }] } })).toBe("Accepted");
    expect(health({ ...policy, status: { conditions: [{ ...accepted, status: "False", reason: "Invalid" }] } })).toBe("Attention");
    expect(health({ ...policy, status: { conditions: [accepted, { type: "Warning", status: "True" }] } })).toBe("Attention");
    expect(health({ ...policy, status: { conditions: [{ ...accepted, status: "Unknown" }] } })).toBe("Unknown");
    expect(health({ ...policy, status: { conditions: [{ type: "Merged", status: "True" }] } })).toBe("Unknown");
  });

  it("does not report stale accepted/rejected generations as current", () => {
    for (const status of ["True", "False"]) {
      expect(health({ ...policy, status: { conditions: [{ ...accepted, status, observedGeneration: 1 }] } })).toBe("Pending");
    }
  });

  it("aggregates every ancestor and preserves controller/reason diagnostics", () => {
    const status = { ancestors: [
      { ancestorRef: { name: "public", kind: "Gateway" }, conditions: [accepted], controllerName: "gateway.envoyproxy.io/gatewayclass-controller" },
      { ancestorRef: { name: "private", kind: "Gateway" }, conditions: [{ ...accepted, status: "False", reason: "Conflicted", message: "Another policy wins" }] },
    ] };
    expect(health({ ...policy, status })).toBe("Attention");
    expect(conditionGroups({ ...policy, status })[1]).toMatchObject({ label: "Gateway harbor-app/private", conditions: [{ message: "Another policy wins" }] });
    status.ancestors[1]!.conditions = [];
    expect(health({ ...policy, status })).toBe("Unknown");
  });
});

describe("configured policy attachments", () => {
  it("supports old/new targets, multiple targets and sections without crossing namespaces, groups or kinds", () => {
    const target = { group: GATEWAY_GROUP, kind: "HTTPRoute", name: "harbor", sectionName: "api" };
    expect(attachments({ ...policy, spec: { targetRef: target } }, route)).toEqual([{ via: "targetRef", sectionName: "api" }]);
    const configured = { ...policy, spec: { targetRefs: [target, { ...target, name: "other" }] } };
    expect(attachments(configured, route)).toHaveLength(1);
    for (const change of [{ kind: "GRPCRoute" }, { apiVersion: "other.example/v1" }, { metadata: { ...route.metadata, namespace: "other" } }]) {
      expect(attachments(configured, { ...route, ...change })).toEqual([]);
    }
    expect(targetsText(configured)).toContain("HTTPRoute harbor-app/harbor #api");
    expect(referenceText({ name: "envoy", kind: "GatewayClass" }, "ignored")).toBe("GatewayClass envoy");
  });

  it("matches same-namespace selectors and does not claim authorization for cross-namespace selectors", () => {
    const selector = { kind: "HTTPRoute", matchLabels: { app: "harbor" }, matchExpressions: [{ key: "tier", operator: "In", values: ["edge"] }] };
    expect(attachments({ ...policy, spec: { targetSelectors: [selector] } }, route)).toEqual([{ via: "label selector" }]);
    expect(attachments({ ...policy, spec: { targetSelectors: [{ ...selector, namespaces: { from: "All" } }] } }, route)).toEqual([]);
    expect(attachments({ ...policy, spec: { targetSelectors: [{ ...selector, kind: "Gateway" }] } }, route)).toEqual([]);
    expect(targetsText({ ...policy, spec: { targetSelectors: [selector] } })).toContain("app=harbor, tier In (edge)");
  });

  it("applies Kubernetes label expression semantics, including absent labels for NotIn", () => {
    const check = (key: string, operator: string, values?: string[]) => matchesLabels(route.metadata.labels!, { matchExpressions: [{ key, operator, values }] });
    expect(check("tier", "In", ["edge"])).toBe(true);
    expect(check("tier", "NotIn", ["internal"])).toBe(true);
    expect(check("absent", "NotIn", ["edge"])).toBe(true);
    expect(check("tier", "Exists")).toBe(true);
    expect(check("absent", "DoesNotExist")).toBe(true);
    expect(check("tier", "DoesNotExist")).toBe(false);
    expect(check("tier", "Unsupported")).toBe(false);
    expect(matchesLabels({}, { matchLabels: { app: "harbor" } })).toBe(false);
  });
});

describe("references and schema-tolerant settings", () => {
  it("resolves proxy parameters from GatewayClass and Gateway with their proper namespace", () => {
    const ref = { group: ENVOY_GROUP, kind: "EnvoyProxy", name: "edge", namespace: "envoy-gateway-system" };
    expect(envoyReferences({ ...route, kind: "GatewayClass", spec: { parametersRef: ref } })).toEqual([ref]);
    expect(envoyReferences({ ...route, kind: "Gateway", spec: { infrastructure: { parametersRef: { ...ref, namespace: undefined } } } })).toEqual([{ ...ref, namespace: "harbor-app" }]);
  });

  it("finds Envoy backends, mirror backends and nested extension filters but ignores core refs and malformed values", () => {
    const backend = { group: ENVOY_GROUP, kind: "Backend", name: "external", namespace: "shared" };
    const filter = { group: ENVOY_GROUP, kind: "HTTPRouteFilter", name: "rewrite" };
    const target = { ...route, spec: { rules: [{ backendRefs: [backend, { name: "core-service" }, { name: "nested", filters: [{ type: "ExtensionRef", extensionRef: filter }] }], filters: [
      { type: "RequestMirror", requestMirror: { backendRef: backend } },
      { type: "ExtensionRef", extensionRef: filter }, { type: "ExtensionRef", extensionRef: null },
    ] }] } };
    expect(envoyReferences(target)).toEqual([backend, backend, { ...filter, namespace: "harbor-app" }, { ...filter, namespace: "harbor-app" }]);
    expect(envoyReferences({ ...route, spec: { rules: "not-an-array" } })).toEqual([]);
    expect(configurationKeys({ targetRef: { name: "public" }, timeout: {}, futureField: false })).toEqual(["timeout", "futureField"]);
  });
});