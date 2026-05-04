import type { Connection, Node, ReactFlowInstance } from "reactflow";

import { ResourceType } from "@/lib/resource-registry";

import type { ResourceKind, ResourceNodeData } from "./types";

export interface TemplateDeps {
  addResource: (
    kind: ResourceKind,
    position: { x: number; y: number },
    namespace: string
  ) => Node<ResourceNodeData>;
  updateNode: (id: string, patch: Partial<ResourceNodeData>) => void;
  onConnect: (connection: Connection) => void;
  reactFlowInstance: ReactFlowInstance | null;
  namespace: string;
}

const OFFSET = 240;

const basePositionFor = (instance: ReactFlowInstance | null) =>
  instance ? instance.project({ x: 200, y: 140 }) : { x: 0, y: 0 };

const positionAt = (
  base: { x: number; y: number },
  index: number
): { x: number; y: number } => ({
  x: base.x + index * OFFSET,
  y: base.y,
});

const connectStraight = (
  onConnect: TemplateDeps["onConnect"],
  source: string,
  target: string
) =>
  onConnect({
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
  });

const buildWebService = (deps: TemplateDeps) => {
  const { addResource, updateNode, onConnect, reactFlowInstance, namespace } =
    deps;
  const base = basePositionFor(reactFlowInstance);
  const suffix = crypto.randomUUID().slice(0, 4);
  const appLabel = `web-${suffix}`;

  const deployment = addResource(
    ResourceType.Deployment,
    positionAt(base, 0),
    namespace
  );
  updateNode(deployment.id, {
    name: `${appLabel}-deploy`,
    labels: { app: appLabel },
    replicas: 2,
    image: "nginx:latest",
  });

  const service = addResource(
    ResourceType.Service,
    positionAt(base, 1),
    namespace
  );
  updateNode(service.id, {
    name: `${appLabel}-svc`,
    labels: { app: appLabel },
    selectors: { app: appLabel },
    ports: [80],
  });

  const ingress = addResource(
    ResourceType.Ingress,
    positionAt(base, 2),
    namespace
  );
  updateNode(ingress.id, {
    name: `${appLabel}-ing`,
    serviceName: `${appLabel}-svc`,
    servicePort: 80,
    path: "/",
  });

  connectStraight(onConnect, service.id, deployment.id);
  connectStraight(onConnect, ingress.id, service.id);
};

const buildConfigBackedApp = (deps: TemplateDeps) => {
  const { addResource, updateNode, onConnect, reactFlowInstance, namespace } =
    deps;
  const base = basePositionFor(reactFlowInstance);
  const suffix = crypto.randomUUID().slice(0, 4);
  const appLabel = `cfg-${suffix}`;

  const config = addResource(
    ResourceType.ConfigMap,
    positionAt(base, 0),
    namespace
  );
  updateNode(config.id, {
    name: `${appLabel}-config`,
    labels: { app: appLabel },
    data: { "app.config": "" },
  });

  const deployment = addResource(
    ResourceType.Deployment,
    positionAt(base, 1),
    namespace
  );
  updateNode(deployment.id, {
    name: `${appLabel}-deploy`,
    labels: { app: appLabel },
    image: "nginx:latest",
    ports: [80],
  });

  const service = addResource(
    ResourceType.Service,
    positionAt(base, 2),
    namespace
  );
  updateNode(service.id, {
    name: `${appLabel}-svc`,
    selectors: { app: appLabel },
    ports: [80],
  });

  connectStraight(onConnect, service.id, deployment.id);
};

const TEMPLATE_BUILDERS: Record<string, (deps: TemplateDeps) => void> = {
  "web-service": buildWebService,
  "config-backed-app": buildConfigBackedApp,
};

export function applyInfrastructureTemplate(
  templateId: string,
  deps: TemplateDeps
): void {
  const builder = TEMPLATE_BUILDERS[templateId];
  if (builder) {
    builder(deps);
  }
}
