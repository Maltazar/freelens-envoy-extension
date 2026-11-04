export const ENVOY_GROUP = "gateway.envoyproxy.io";
export const GATEWAY_GROUP = "gateway.networking.k8s.io";
export const ENVOY_VERSION = `${ENVOY_GROUP}/v1alpha1`;

export interface ObjectRef {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
  sectionName?: string;
}

export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: { key: string; operator: string; values?: string[] }[];
}

export interface TargetSelector extends LabelSelector {
  group?: string;
  kind: string;
  namespaces?: { from?: "Same" | "All" | "Selector"; selector?: LabelSelector };
}

export interface EnvoySpec extends Record<string, unknown> {
  targetRef?: ObjectRef;
  targetRefs?: ObjectRef[];
  targetSelectors?: TargetSelector[];
}

export interface Condition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  observedGeneration?: number;
  lastTransitionTime?: string;
}

export interface EnvoyStatus {
  conditions?: Condition[];
  ancestors?: { ancestorRef: ObjectRef; controllerName?: string; conditions?: Condition[] }[];
}

export interface ResourceData {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; labels?: Partial<Record<string, string>>; generation?: number };
  spec?: EnvoySpec;
  status?: EnvoyStatus;
}

export interface ConditionGroup {
  label: string;
  controller?: string;
  conditions: Condition[];
}

export function conditionGroups(object: ResourceData): ConditionGroup[] {
  const groups: ConditionGroup[] = [];
  if (object.status?.conditions?.length) {
    groups.push({ label: "Resource", conditions: object.status.conditions });
  }
  for (const ancestor of object.status?.ancestors ?? []) {
    groups.push({
      label: referenceText(ancestor.ancestorRef, object.metadata.namespace),
      controller: ancestor.controllerName,
      conditions: ancestor.conditions ?? [],
    });
  }
  return groups;
}

const positiveConditions = new Set(["Accepted", "Ready", "Programmed", "ResolvedRefs"]);
const negativeConditions = new Set(["Overridden", "Conflicted", "Degraded", "Warning"]);

export type ResourceHealth = "Accepted" | "Attention" | "Pending" | "Unknown" | "Not reported";

export function health(object: ResourceData): ResourceHealth {
  const groups = conditionGroups(object);
  const conditions = groups.flatMap((group) => group.conditions);
  if (!conditions.length) return "Not reported";
  const generation = object.metadata.generation;
  const current = conditions.filter((condition) =>
    generation === undefined || condition.observedGeneration === undefined || condition.observedGeneration >= generation,
  );
  if (current.some((condition) =>
    (positiveConditions.has(condition.type) && condition.status === "False") ||
    (negativeConditions.has(condition.type) && condition.status === "True"),
  )) return "Attention";
  if (current.length !== conditions.length) return "Pending";
  if (groups.some((group) => !group.conditions.length) || current.some((condition) => condition.status === "Unknown")) {
    return "Unknown";
  }
  // Every reported ancestor must have a positive result, not just one of them.
  return groups.every((group) => group.conditions.some((condition) =>
    positiveConditions.has(condition.type) && condition.status === "True",
  )) ? "Accepted" : "Unknown";
}

export function targetRefs(spec: EnvoySpec = {}): ObjectRef[] {
  return [...(spec.targetRef ? [spec.targetRef] : []), ...(spec.targetRefs ?? [])];
}

export function referenceText(ref: ObjectRef, namespace?: string): string {
  const ns = ref.kind === "GatewayClass" ? undefined : (ref.namespace ?? namespace);
  return `${ref.kind ?? "Gateway"} ${ns ? `${ns}/` : ""}${ref.name}${ref.sectionName ? ` #${ref.sectionName}` : ""}`;
}

export function selectorText(selector: TargetSelector): string {
  const labels = Object.entries(selector.matchLabels ?? {}).map(([key, value]) => `${key}=${value}`);
  const expressions = (selector.matchExpressions ?? []).map(({ key, operator, values }) =>
    `${key} ${operator}${values?.length ? ` (${values.join(", ")})` : ""}`,
  );
  const namespaceScope = selector.namespaces?.from ?? "Same";
  return `${selector.kind} [${[...labels, ...expressions].join(", ") || "all labels"}] (namespaces: ${namespaceScope})`;
}

export function targetsText(object: ResourceData): string {
  const spec = object.spec ?? {};
  return [
    ...targetRefs(spec).map((ref) => referenceText(ref, object.metadata.namespace)),
    ...(spec.targetSelectors ?? []).map(selectorText),
  ].join(", ") || "—";
}

export function matchesLabels(labels: Partial<Record<string, string>>, selector: LabelSelector): boolean {
  if (!Object.entries(selector.matchLabels ?? {}).every(([key, value]) => labels[key] === value)) return false;
  return (selector.matchExpressions ?? []).every(({ key, operator, values = [] }) => {
    const exists = labels[key] !== undefined;
    switch (operator) {
      case "In": return exists && values.includes(labels[key]!);
      case "NotIn": return !exists || !values.includes(labels[key]!);
      case "Exists": return exists;
      case "DoesNotExist": return !exists;
      default: return false;
    }
  });
}

export interface Attachment {
  via: string;
  sectionName?: string;
}

/** Configured relationships only; never infer inheritance, precedence or ReferenceGrant authorization. */
export function attachments(policy: ResourceData, target: ResourceData): Attachment[] {
  const group = target.apiVersion.split("/")[0];
  const result: Attachment[] = [];
  for (const ref of targetRefs(policy.spec)) {
    const namespace = ref.namespace ?? policy.metadata.namespace;
    if ((ref.group ?? GATEWAY_GROUP) === group && (ref.kind ?? "Gateway") === target.kind &&
      ref.name === target.metadata.name && (target.kind === "GatewayClass" || namespace === target.metadata.namespace)) {
      result.push({ via: "targetRef", sectionName: ref.sectionName });
    }
  }
  for (const selector of policy.spec?.targetSelectors ?? []) {
    const from = selector.namespaces?.from ?? "Same";
    // Cross-namespace selection also requires watched namespaces and ReferenceGrants.
    // Keep it in the policy spec instead of asserting an authorized attachment here.
    if (from !== "Same" || policy.metadata.namespace !== target.metadata.namespace) continue;
    if ((selector.group ?? GATEWAY_GROUP) === group && selector.kind === target.kind &&
      matchesLabels(target.metadata.labels ?? {}, selector)) {
      result.push({ via: "label selector" });
    }
  }
  return result;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Explicit Envoy references used by a GatewayClass, Gateway or route. */
export function envoyReferences(target: ResourceData): ObjectRef[] {
  const spec = target.spec ?? {};
  const refs: ObjectRef[] = [];
  const add = (value: unknown) => {
    const ref = asRecord(value);
    if (ref.group === ENVOY_GROUP && typeof ref.kind === "string" && typeof ref.name === "string") {
      refs.push(ref as unknown as ObjectRef);
    }
  };
  if (target.kind === "GatewayClass") add(spec.parametersRef);
  if (target.kind === "Gateway") add(asRecord(spec.infrastructure).parametersRef);
  for (const rule of Array.isArray(spec.rules) ? spec.rules : []) {
    const record = asRecord(rule);
    for (const backend of Array.isArray(record.backendRefs) ? record.backendRefs : []) add(backend);
    const filters = Array.isArray(record.filters) ? [...record.filters] : [];
    for (const backend of Array.isArray(record.backendRefs) ? record.backendRefs : []) {
      const nested = asRecord(backend).filters;
      if (Array.isArray(nested)) filters.push(...nested);
    }
    for (const filter of filters) {
      const record = asRecord(filter);
      if (record.type === "ExtensionRef") add(record.extensionRef);
      if (record.type === "RequestMirror") add(asRecord(record.requestMirror).backendRef);
    }
  }
  return refs.map((ref) => ({ ...ref, namespace: ref.namespace ?? target.metadata.namespace }));
}

export function configurationKeys(spec: EnvoySpec = {}): string[] {
  return Object.keys(spec).filter((key) => !["targetRef", "targetRefs", "targetSelectors"].includes(key));
}