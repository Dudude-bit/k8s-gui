export type ResourceScope = "namespaced" | "cluster";

export const RESOURCE_REGISTRY = [
  { kind: "Pod", plural: "pods", apiVersion: "v1", scope: "namespaced" },
  {
    kind: "Deployment",
    plural: "deployments",
    apiVersion: "apps/v1",
    scope: "namespaced",
  },
  {
    kind: "StatefulSet",
    plural: "statefulsets",
    apiVersion: "apps/v1",
    scope: "namespaced",
  },
  {
    kind: "DaemonSet",
    plural: "daemonsets",
    apiVersion: "apps/v1",
    scope: "namespaced",
  },
  { kind: "Job", plural: "jobs", apiVersion: "batch/v1", scope: "namespaced" },
  {
    kind: "CronJob",
    plural: "cronjobs",
    apiVersion: "batch/v1",
    scope: "namespaced",
  },
  {
    kind: "ConfigMap",
    plural: "configmaps",
    apiVersion: "v1",
    scope: "namespaced",
  },
  {
    kind: "Secret",
    plural: "secrets",
    apiVersion: "v1",
    scope: "namespaced",
  },
  {
    kind: "Service",
    plural: "services",
    apiVersion: "v1",
    scope: "namespaced",
  },
  {
    kind: "Ingress",
    plural: "ingresses",
    apiVersion: "networking.k8s.io/v1",
    scope: "namespaced",
  },
  {
    kind: "PersistentVolumeClaim",
    plural: "persistentvolumeclaims",
    apiVersion: "v1",
    scope: "namespaced",
  },
  {
    kind: "PersistentVolume",
    plural: "persistentvolumes",
    apiVersion: "v1",
    scope: "cluster",
  },
  {
    kind: "StorageClass",
    plural: "storageclasses",
    apiVersion: "storage.k8s.io/v1",
    scope: "cluster",
  },
  {
    kind: "Endpoints",
    plural: "endpoints",
    apiVersion: "v1",
    scope: "namespaced",
  },
  { kind: "Node", plural: "nodes", apiVersion: "v1", scope: "cluster" },
  { kind: "Event", plural: "events", apiVersion: "v1", scope: "namespaced" },
  {
    kind: "Namespace",
    plural: "namespaces",
    apiVersion: "v1",
    scope: "cluster",
  },
  {
    kind: "CustomResourceDefinition",
    plural: "customresourcedefinitions",
    apiVersion: "apiextensions.k8s.io/v1",
    scope: "cluster",
  },
] as const;

export type ResourceKind = (typeof RESOURCE_REGISTRY)[number]["kind"];
export type ResourceDefinition = (typeof RESOURCE_REGISTRY)[number];

export const ResourceType = Object.fromEntries(
  RESOURCE_REGISTRY.map((entry) => [entry.kind, entry.kind])
) as { [K in ResourceKind]: K };

const RESOURCE_BY_KIND = new Map<ResourceKind, ResourceDefinition>(
  RESOURCE_REGISTRY.map((entry) => [entry.kind, entry])
);
const RESOURCE_BY_PLURAL = new Map<string, ResourceDefinition>(
  RESOURCE_REGISTRY.map((entry) => [entry.plural, entry])
);

export function toPlural(resourceKind: ResourceKind): string {
  return RESOURCE_BY_KIND.get(resourceKind)?.plural ?? resourceKind.toLowerCase();
}

export function toKind(resourceType: string): ResourceKind | null {
  if (RESOURCE_BY_KIND.has(resourceType as ResourceKind)) {
    return resourceType as ResourceKind;
  }
  const lower = resourceType.toLowerCase();
  return RESOURCE_BY_PLURAL.get(lower)?.kind ?? null;
}

export function isResourceType(value: string): value is ResourceKind {
  return (
    RESOURCE_BY_KIND.has(value as ResourceKind) ||
    RESOURCE_BY_PLURAL.has(value.toLowerCase())
  );
}

export function getResourceDefinition(
  kind: ResourceKind
): ResourceDefinition {
  return RESOURCE_BY_KIND.get(kind)!;
}

export function getApiVersion(resourceKind: string): string {
  const known =
    RESOURCE_BY_KIND.get(resourceKind as ResourceKind) ??
    RESOURCE_BY_PLURAL.get(resourceKind.toLowerCase());
  return known?.apiVersion ?? "v1";
}

export function getScope(resourceKind: ResourceKind): ResourceScope {
  return RESOURCE_BY_KIND.get(resourceKind)?.scope ?? "namespaced";
}
