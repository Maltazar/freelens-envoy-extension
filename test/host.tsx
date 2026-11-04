import type { Renderer } from "@freelensapp/extensions";
import type { ComponentProps, ReactNode } from "react";
import { observable } from "mobx";
import type { ResourceData } from "../src/domain";
import type { EnvoyResource, EnvoyStore } from "../src/resources";

// Test adapter, not a substitute for testing in the Freelens application.
export const stores = observable.map<string, EnvoyStore>();
export const servedApis = observable.set<string>();

class TestObject {
  apiVersion: string;
  kind: string;
  metadata: ResourceData["metadata"];
  spec: ResourceData["spec"];
  status: ResourceData["status"];
  static kind: string;
  constructor(data: ResourceData) {
    this.apiVersion = data.apiVersion;
    this.kind = data.kind;
    this.metadata = data.metadata;
    this.spec = data.spec ?? {};
    this.status = data.status;
  }
  static getStore() {
    const store = stores.get(this.kind);
    if (!store) throw new Error("API not available");
    return store;
  }
  getName() { return this.metadata.name; }
  getNs() { return this.metadata.namespace; }
  getId() { return `${this.kind}/${this.getNs()}/${this.getName()}`; }
  getCreationTimestamp() { return "2026-11-04T00:00:00Z"; }
  getSearchFields() { return [this.getName(), this.getNs() ?? ""]; }
}

export const hostApi = {
  Main: { LensExtension: class {} },
  Renderer: {
    LensExtension: class {},
    K8sApi: {
      LensExtensionKubeObject: TestObject,
      detailsFor: (Model: typeof TestObject & { crd: { apiVersions: string[] } }, options: { Details: unknown; priority: number }) => ({
        kind: Model.kind, apiVersions: Model.crd.apiVersions, priority: options.priority, components: { Details: options.Details },
      }),
      apiManager: { getApiByKind: (kind: string, version: string) => servedApis.has(`${version}/${kind}`) ? {} : undefined },
    },
    Component: {
      Icon: () => <span>Envoy</span>,
      DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
      DrawerItem: ({ name, children }: { name: string; children: ReactNode }) => <div><strong>{name}</strong>{children}</div>,
      LinkToObject: ({ object, objectRef, content }: ComponentProps<typeof Renderer.Component.LinkToObject>) => {
        const kind = objectRef && "kind" in objectRef ? objectRef.kind : undefined;
        const namespace = objectRef && "namespace" in objectRef ? objectRef.namespace : undefined;
        return <a href={`#${object?.kind ?? kind}/${object?.getNs() ?? namespace ?? ""}/${object?.getName() ?? objectRef?.name}`}>
          {content ?? object?.getName() ?? objectRef?.name}
        </a>;
      },
      KubeObjectAge: () => <span>1d</span>,
      KubeObjectListLayout: (props: { renderHeaderTitle: ReactNode; store: EnvoyStore; renderTableContents: (item: EnvoyResource) => ReactNode[] }) =>
        <div><h2>{props.renderHeaderTitle}</h2>
          {props.store.contextItems.map((item) => <div key={item.getId()}>{props.renderTableContents(item)}</div>)}
        </div>,
    },
  },
};