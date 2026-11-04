import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { configurationKeys, health, targetsText } from "./domain";
import { LoadError, StatusBadge, Targets, useStoreSubscription } from "./components";
import { availableStore, resources, type EnvoyResource, type EnvoyStore, type ResourceDefinition } from "./resources";

const { KubeObjectListLayout, KubeObjectAge, LinkToObject } = Renderer.Component;

export const ResourcePage = observer(({ definition }: { definition: ResourceDefinition }) => {
  const store = availableStore(definition);
  if (!store) return <div className="envoy-page envoy-unavailable">
    <h2>{definition.title}</h2>
    <p>{definition.description}</p>
    <div className="envoy-notice">This API is not available in Freelens discovery yet.</div>
    <p>Expected: <code>{definition.Model.apiBase}</code></p>
    <p>Check that this Envoy Gateway CRD is installed, served as v1alpha1, and visible to your Kubernetes user.
      Discovery may still be loading. Optional CRDs depend on your Envoy Gateway installation.</p>
  </div>;
  return <ResourceList key={definition.kind} definition={definition} store={store} />;
});

const ResourceList = observer(({ definition, store }: { definition: ResourceDefinition; store: EnvoyStore }) => {
  const { error, retry } = useStoreSubscription(store);
  return <div className="envoy-list">
    {error && <LoadError error={error} retry={retry} />}
    <KubeObjectListLayout<EnvoyResource, Renderer.K8sApi.KubeApi<EnvoyResource>>
      tableId={`envoy-${definition.plural}`}
      className="envoy-resource-table"
      store={store}
      subscribeStores={false}
      renderHeaderTitle={definition.title}
      searchFilters={[
        (item) => item.getSearchFields(),
        (item) => [targetsText(item), ...configurationKeys(item.spec), health(item)],
      ]}
      sortingCallbacks={{
        name: (item) => item.getName(), namespace: (item) => item.getNs() ?? "",
        targets: targetsText, settings: (item) => configurationKeys(item.spec).join(", "),
        status: health, age: (item) => item.getCreationTimestamp(),
      }}
      renderTableHeader={[
        { title: "Name", sortBy: "name", className: "envoy-name-cell" },
        { title: "Namespace", sortBy: "namespace", className: "envoy-namespace-cell" },
        ...(definition.policy ? [{ title: "Targets", sortBy: "targets", className: "envoy-targets-cell" }] : []),
        { title: "Configured settings", sortBy: "settings", className: "envoy-settings-cell" },
        { title: "Status", sortBy: "status", className: "envoy-status-cell" },
        { title: "Age", sortBy: "age", className: "envoy-age-cell" },
      ]}
      renderTableContents={(item) => [
        item.getName(), item.getNs(),
        ...(definition.policy ? [<Targets key="targets" object={item} />] : []),
        configurationKeys(item.spec).join(", ") || "—",
        <StatusBadge key="status" object={item} />,
        <KubeObjectAge key="age" object={item} />,
      ]}
    />
  </div>;
});

const ResourceCard = observer(({ definition, extension }: { definition: ResourceDefinition; extension: Renderer.LensExtension }) => {
  const store = availableStore(definition);
  const { error, retry } = useStoreSubscription(store);
  const items = store?.contextItems ?? [];
  const counts = items.reduce<Record<string, number>>((values, object) => {
    const status = health(object);
    values[status] = (values[status] ?? 0) + 1;
    return values;
  }, {});
  return <article className="envoy-card">
    <button className="envoy-card-title" onClick={() => void extension.navigate(definition.plural)}>{definition.title}</button>
    <p className="envoy-muted">{definition.description}</p>
    {!store ? <p>API unavailable</p> : error ? <LoadError error={error} retry={retry} /> : <>
      <div className="envoy-count">{store.isLoaded ? items.length : "…"}</div>
      <p className="envoy-muted">{store.isLoaded ? "resources in selected namespaces" : "Loading resources…"}</p>
      <div className="envoy-counts">{Object.entries(counts).map(([status, count]) => <span key={status}>{status}: {count}</span>)}</div>
      {items.filter((object) => health(object) === "Attention").slice(0, 3).map((object) => <div key={object.getId()}>
        <LinkToObject object={object} content={`${object.getNs()}/${object.getName()}`} />
      </div>)}
    </>}
  </article>;
});

export const OverviewPage = observer(({ extension }: { extension: Renderer.LensExtension }) => <div className="envoy-page">
  <header className="envoy-header">
    <span className="envoy-eyebrow">GATEWAY API · ENVOY</span>
    <h1>Envoy Gateway</h1>
    <p>Policies, proxy configuration and controller-reported status across your selected namespaces.</p>
  </header>
  <div className="envoy-notice">Use the Gateway API extension for Gateways and routes.
    Their details drawers also include Envoy attachments while this extension is enabled.</div>
  <div className="envoy-grid">{resources.map((definition) =>
    <ResourceCard key={definition.kind} definition={definition} extension={extension} />,
  )}</div>
</div>);