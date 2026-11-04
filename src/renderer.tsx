import { Renderer } from "@freelensapp/extensions";
import { ResourceDetails } from "./components";
import { OverviewPage, ResourcePage } from "./pages";
import { RelatedEnvoyDetails } from "./related";
import { resources } from "./resources";
import "./styles.css";

const EnvoyIcon = (props: Renderer.Component.IconProps) => <Renderer.Component.Icon {...props} material="hub" />;

export default class EnvoyGatewayRenderer extends Renderer.LensExtension {
  customResources = resources.map(({ Model }) => Model);

  kubeObjectDetailItems = [
    ...resources.map(({ Model }) => Renderer.K8sApi.detailsFor(Model, { priority: 20, Details: ResourceDetails })),
    ...["GatewayClass", "Gateway", "HTTPRoute", "GRPCRoute", "TCPRoute", "TLSRoute", "UDPRoute", "ListenerSet"].map((kind) => ({
      kind,
      apiVersions: ["v1", "v1beta1", "v1alpha2"].map((version) => `gateway.networking.k8s.io/${version}`),
      priority: 30,
      components: { Details: RelatedEnvoyDetails },
    })),
  ];

  clusterPages = [
    { id: "overview", components: { Page: () => <OverviewPage extension={this} /> } },
    ...resources.map((definition) => ({
      id: definition.plural,
      components: { Page: () => <ResourcePage definition={definition} /> },
    })),
  ];

  clusterPageMenus = [
    { id: "envoy-gateway", title: "Envoy Gateway", components: { Icon: EnvoyIcon } },
    { id: "overview", parentId: "envoy-gateway", title: "Overview", target: { pageId: "overview" }, components: {} },
    ...resources.map((definition) => ({
      id: definition.plural, parentId: "envoy-gateway", title: definition.title,
      target: { pageId: definition.plural }, components: {},
    })),
  ];
}