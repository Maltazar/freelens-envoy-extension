import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import {
  conditionGroups, configurationKeys, ENVOY_VERSION, GATEWAY_GROUP, health,
  referenceText, selectorText, targetRefs, type ObjectRef, type ResourceData,
} from "./domain";
import { type EnvoyResource, type EnvoyStore } from "./resources";

const { DrawerItem, DrawerTitle, LinkToObject } = Renderer.Component;

export function useStoreSubscription(store: EnvoyStore | undefined) {
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setError(undefined);
    if (!store) return;
    let active = true;
    const onLoadFailure = (failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : String(failure));
    };
    const dispose = store.subscribe({ onLoadFailure });
    // Explicit load gives us a retryable error even when the host already has a subscription.
    void store.loadAll({ onLoadFailure }).catch(onLoadFailure);
    return () => { active = false; dispose(); };
  }, [store, attempt]);
  return { error, retry: () => setAttempt((value) => value + 1) };
}

export function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return <div className="envoy-notice" role="alert">
    <strong>Unable to load resources.</strong> Check Kubernetes permissions and connectivity.
    <div>{error}</div>
    <button className="envoy-button" onClick={retry}>Retry</button>
  </div>;
}

export function StatusBadge({ object }: { object: ResourceData }) {
  const value = health(object);
  return <span className={`envoy-status envoy-status-${value.toLowerCase().replaceAll(" ", "-")}`}>{value}</span>;
}

export const ReferenceLink = observer(({ reference, namespace, defaultGroup = GATEWAY_GROUP }: {
  reference: ObjectRef; namespace?: string; defaultGroup?: string;
}) => {
  const kind = reference.kind ?? "Gateway";
  const group = reference.group ?? defaultGroup;
  const versions = group ? ["v1", "v1beta1", "v1alpha2", "v1alpha1"].map((version) => `${group}/${version}`) : ["v1"];
  const apiVersion = versions.find((version) => Renderer.K8sApi.apiManager.getApiByKind(kind, version));
  const text = referenceText({ ...reference, kind }, namespace);
  if (!apiVersion) return <span title={`${group || "core"}/${kind}: API not available`}>{text}</span>;
  return <span onClick={(event) => event.stopPropagation()}>
    <LinkToObject objectRef={{
      apiVersion, kind, name: reference.name,
      namespace: kind === "GatewayClass" ? undefined : (reference.namespace ?? namespace),
    }} content={text} />
  </span>;
});

export const Targets = observer(({ object }: { object: EnvoyResource }) => <>
  {targetRefs(object.spec).map((reference, index) => <div key={`ref-${index}`}>
    <ReferenceLink reference={reference} namespace={object.getNs()} />
  </div>)}
  {(object.spec?.targetSelectors ?? []).map((selector, index) => <div key={`selector-${index}`}>{selectorText(selector)}</div>)}
</>);

export const ResourceDetails = observer(({ object }: Renderer.Component.KubeObjectDetailsProps<EnvoyResource>) => {
  const groups = conditionGroups(object);
  return <div className="envoy-details">
    <DrawerTitle>Envoy Gateway</DrawerTitle>
    <DrawerItem name="API">{object.apiVersion || ENVOY_VERSION}</DrawerItem>
    <DrawerItem name="Status"><StatusBadge object={object} /></DrawerItem>
    {targetRefs(object.spec).length + (object.spec?.targetSelectors?.length ?? 0) > 0 &&
      <DrawerItem name="Configured targets"><Targets object={object} /></DrawerItem>}
    {groups.length === 0 && <p className="envoy-muted">No controller conditions reported. This does not imply acceptance or failure.</p>}
    {groups.map((group, index) => <section key={index} className="envoy-condition-group">
      <h3>{group.label}</h3>
      {group.controller && <p className="envoy-muted">{group.controller}</p>}
      {!group.conditions.length && <p>No conditions reported for this ancestor.</p>}
      {group.conditions.map((condition) => <div key={condition.type} className="envoy-condition">
        <strong>{condition.type}: {condition.status}</strong>
        {condition.reason && <span> · {condition.reason}</span>}
        {condition.message && <p>{condition.message}</p>}
        <small className="envoy-muted">
          Observed generation: {condition.observedGeneration ?? "not reported"}
          {object.metadata.generation !== undefined && ` / current: ${object.metadata.generation}`}
          {condition.lastTransitionTime && ` · ${condition.lastTransitionTime}`}
        </small>
      </div>)}
    </section>)}
    <DrawerTitle>Configured settings</DrawerTitle>
    <p className="envoy-muted">Explicit CRD values, not calculated Envoy defaults or effective merged policy. Referenced Secrets are not fetched.</p>
    {configurationKeys(object.spec).map((key) => <details key={key} className="envoy-setting">
      <summary>{key}</summary>
      <pre>{JSON.stringify(object.spec[key], null, 2)}</pre>
    </details>)}
    {!configurationKeys(object.spec).length && <p className="envoy-muted">No additional settings configured.</p>}
  </div>;
});