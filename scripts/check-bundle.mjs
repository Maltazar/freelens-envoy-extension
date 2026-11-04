import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as Mobx from "mobx";
import * as MobxReact from "mobx-react";

// Exercise the emitted modules with only the documented API globals for each process.
globalThis.FreelensExtensionApi = { Main: { LensExtension: class {} } };
const { default: MainExtension } = await import("../dist/main.js");
assert.ok(new MainExtension());

globalThis.FreelensExtensionApi = {
  React, ReactJsxRuntime, Mobx, MobxReact,
  Renderer: {
    LensExtension: class {},
    K8sApi: {
      LensExtensionKubeObject: class { static getStore() { throw new Error("Unavailable CRD"); } },
      detailsFor: (Model, { Details, priority }) => ({ kind: Model.kind, apiVersions: Model.crd.apiVersions, priority, components: { Details } }),
      apiManager: { getApiByKind: () => undefined },
    },
    Component: {},
  },
};
const { default: RendererExtension } = await import("../dist/renderer.js");
const extension = new RendererExtension();
assert.equal(extension.customResources.length, 8);
assert.equal(extension.clusterPages.length, 9);
assert.equal(extension.kubeObjectDetailItems.length, 16);
for (const page of extension.clusterPages) {
  const html = renderToStaticMarkup(React.createElement(page.components.Page));
  assert.ok(html.length > 100, `Page ${page.id} rendered no content`);
}
const renderer = await readFile("dist/renderer.js", "utf8");
assert.ok(renderer.includes("globalThis.FreelensExtensionApi.ReactJsxRuntime"));
assert.ok(!renderer.includes("node_modules/react/"), "Bundle includes a duplicate React");
assert.ok(!renderer.includes("node_modules/mobx/"), "Bundle includes a duplicate MobX");
assert.ok(!/^import\s/m.test(renderer), "Bundle has an unresolved runtime import");
assert.ok((await readFile("dist/renderer.css", "utf8")).includes("envoy-page"));
console.log("Built entry points load via Freelens 2 host globals; all 9 pages render; sibling stylesheet present.");