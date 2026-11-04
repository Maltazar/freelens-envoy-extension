import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { attachments, envoyReferences, type ResourceData } from "./domain";
import { LoadError, ReferenceLink, StatusBadge, useStoreSubscription } from "./components";
import { availableStore, resources, type ResourceDefinition } from "./resources";

const RelatedPolicies = observer(({ definition, target }: { definition: ResourceDefinition; target: ResourceData }) => {
  const store = availableStore(definition);
  const { error, retry } = useStoreSubscription(store);
  if (!store) return null;
  const matching = store.contextItems.map((object) => ({ object, links: attachments(object, target) }))
    .filter(({ links }) => links.length);
  return <section className="envoy-related-group">
    <h3>{definition.title}</h3>
    {error ? <LoadError error={error} retry={retry} /> : !store.isLoaded ? <p>Loading policies…</p> :
      matching.length ? matching.map(({ object, links }) => <div key={object.getId()} className="envoy-related-row">
        <Renderer.Component.LinkToObject object={object} content={`${object.getNs()}/${object.getName()}`} />
        <StatusBadge object={object} />
        <small className="envoy-muted">{links.map((link) => `${link.via}${link.sectionName ? ` · section ${link.sectionName}` : ""}`).join(", ")}</small>
      </div>) : <p className="envoy-muted">No direct or same-namespace selector attachments found in loaded namespaces.</p>}
  </section>;
});

export const RelatedEnvoyDetails = observer(({ object }: Renderer.Component.KubeObjectDetailsProps) => {
  // Host-provided Gateway API models belong to the companion extension, not this package.
  const target = object as unknown as ResourceData;
  const references = envoyReferences(target);
  return <div className="envoy-details">
    <Renderer.Component.DrawerTitle>Envoy Gateway attachments</Renderer.Component.DrawerTitle>
    {references.map((reference, index) => <Renderer.Component.DrawerItem key={index} name={reference.kind ?? "Envoy resource"}>
      <ReferenceLink reference={reference} namespace={object.getNs()} />
    </Renderer.Component.DrawerItem>)}
    <p className="envoy-muted">Configured direct targets and same-namespace label-selector matches only.
      Section targets are shown separately. Gateway-inherited policies, cross-namespace selectors and effective
      merge/override precedence are not calculated. Results follow your namespace access and selection.</p>
    {resources.filter((definition) => definition.policy).map((definition) =>
      <RelatedPolicies key={definition.kind} definition={definition} target={target} />,
    )}
  </div>;
});