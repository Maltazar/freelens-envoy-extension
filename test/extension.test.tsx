import type { Renderer } from "@freelensapp/extensions";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceLink, ResourceDetails } from "../src/components";
import { ENVOY_VERSION, GATEWAY_GROUP } from "../src/domain";
import { OverviewPage, ResourcePage } from "../src/pages";
import { RelatedEnvoyDetails } from "../src/related";
import EnvoyGatewayRenderer from "../src/renderer";
import { EnvoyResource, resources, type EnvoyStore } from "../src/resources";
import { servedApis, stores } from "./host";

const security = resources.find(({ kind }) => kind === "SecurityPolicy")!;

function makePolicy(name = "harbor-auth", namespace = "harbor-app") {
  return new EnvoyResource({
    apiVersion: ENVOY_VERSION, kind: "SecurityPolicy",
    metadata: { name, namespace, uid: `${namespace}-${name}`, resourceVersion: "1", creationTimestamp: "2026-11-04T00:00:00Z", selfLink: `/apis/${ENVOY_VERSION}/namespaces/${namespace}/securitypolicies/${name}` },
    spec: { targetRefs: [{ group: GATEWAY_GROUP, kind: "HTTPRoute", name: "harbor", sectionName: "api" }], cors: { allowMethods: ["GET"] } },
    status: { ancestors: [{ ancestorRef: { name: "public", kind: "Gateway" }, conditions: [
      { type: "Accepted", status: "False", reason: "Conflicted", message: "Another policy wins" },
    ] }] },
  });
}

function makeStore(items: EnvoyResource[]) {
  const dispose = vi.fn();
  const subscribe = vi.fn(() => dispose);
  const loadAll = vi.fn(async (_options?: { onLoadFailure?: (error: unknown) => void }) => items);
  const state = observable({ items, contextItems: items, isLoaded: true, isLoading: false });
  const store = Object.assign(state, { subscribe, loadAll }) as unknown as EnvoyStore;
  runInAction(() => stores.set("SecurityPolicy", store));
  return { store, state, dispose, subscribe, loadAll };
}

afterEach(() => {
  cleanup();
  runInAction(() => { stores.clear(); servedApis.clear(); });
});

describe("extension registration", () => {
  it("contributes eight Envoy CRDs with matching list/menu/detail registrations, not duplicate Gateway API models", () => {
    const extension = new EnvoyGatewayRenderer({} as ConstructorParameters<typeof EnvoyGatewayRenderer>[0]);
    expect(extension.customResources).toHaveLength(8);
    expect(extension.clusterPages).toHaveLength(9);
    expect(extension.clusterPageMenus.filter((menu) => menu.parentId === "envoy-gateway")).toHaveLength(9);
    expect(extension.customResources.map((Model) => Model.kind)).not.toContain("HTTPRoute");
    for (const definition of resources) {
      expect(definition.Model.namespaced).toBe(true);
      expect(definition.Model.apiBase).toBe(`/apis/${ENVOY_VERSION}/${definition.plural}`);
      expect(extension.kubeObjectDetailItems.find((item) => item.kind === definition.kind)?.apiVersions).toEqual([ENVOY_VERSION]);
    }
    expect(extension.kubeObjectDetailItems.find((item) => item.kind === "HTTPRoute")?.components.Details).toBe(RelatedEnvoyDetails);
  });
});

describe("resource UI and lifecycle", () => {
  it("renders an unavailable message then follows observable discovery when a CRD appears", async () => {
    const view = render(<ResourcePage definition={security} />);
    expect(screen.getByText(/not available in Freelens discovery/)).toBeTruthy();
    await act(async () => { makeStore([makePolicy()]); });
    expect(await screen.findByText("Attention")).toBeTruthy();
    expect(view.container.textContent).toContain("harbor-auth");
    expect(view.container.textContent).toContain("cors");
  });

  it("shows ancestor reasons and all explicit settings without fetching credential objects", () => {
    const object = makePolicy();
    render(<ResourceDetails object={object} />);
    expect(screen.getByText("Another policy wins")).toBeTruthy();
    expect(screen.getByText("Gateway harbor-app/public")).toBeTruthy();
    expect(screen.getByText(/Configured settings/)).toBeTruthy();
    expect(screen.getByText(/"GET"/)).toBeTruthy();
    expect(screen.getByText(/Referenced Secrets are not fetched/)).toBeTruthy();
  });

  it("uses selected namespace counts, navigates to the matching page and disposes subscriptions on unmount", async () => {
    const { state, subscribe, dispose } = makeStore([makePolicy(), makePolicy("other", "other-app")]);
    runInAction(() => { state.contextItems = [state.items[0]!]; });
    const extension = { navigate: vi.fn(async () => {}) } as unknown as Renderer.LensExtension;
    const view = render(<OverviewPage extension={extension} />);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.queryByText("other-app/other")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Security Policies" }));
    expect(extension.navigate).toHaveBeenCalledWith("securitypolicies");
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("reports load failures, retries cleanly, and never leaves old watches behind", async () => {
    const { loadAll, dispose, subscribe } = makeStore([makePolicy()]);
    loadAll.mockImplementationOnce(async (options) => { options?.onLoadFailure?.(new Error("Forbidden (403)")); return []; });
    const view = render(<ResourcePage definition={security} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Forbidden (403)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("decorates a route with its direct policy and section, excluding identically named targets in other namespaces", async () => {
    makeStore([makePolicy(), makePolicy("unrelated", "other-app")]);
    const route = new EnvoyResource({
      apiVersion: `${GATEWAY_GROUP}/v1`, kind: "HTTPRoute",
      metadata: { name: "harbor", namespace: "harbor-app", uid: "route", resourceVersion: "1", selfLink: `/apis/${GATEWAY_GROUP}/v1/namespaces/harbor-app/httproutes/harbor` }, spec: {},
    });
    render(<RelatedEnvoyDetails object={route} />);
    expect(await screen.findByText("harbor-app/harbor-auth")).toBeTruthy();
    expect(screen.getByText("targetRef · section api")).toBeTruthy();
    expect(screen.queryByText("other-app/unrelated")).toBeNull();
  });

  it("links references only to a discovered kind in the correct group/version", () => {
    const ref = { group: "gateway.envoyproxy.io", kind: "Backend", name: "external" };
    const view = render(<ReferenceLink reference={ref} namespace="harbor-app" />);
    expect(screen.queryByRole("link")).toBeNull();
    act(() => { runInAction(() => servedApis.add(`${ENVOY_VERSION}/Backend`)); });
    expect(screen.getByRole("link").getAttribute("href")).toBe("#Backend/harbor-app/external");
    view.unmount();
  });
});