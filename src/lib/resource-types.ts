/**
 * Resource Type Constants
 *
 * Centralized definitions for Kubernetes resource types.
 * Uses CamelCase singular form (Kind) as the primary format.
 * Provides utility functions for conversion to other formats.
 */

/**
 * Kubernetes resource types (CamelCase singular - matches Kind field)
 */
export const ResourceType = {
    Pod: "Pod",
    Deployment: "Deployment",
    StatefulSet: "StatefulSet",
    DaemonSet: "DaemonSet",
    Job: "Job",
    CronJob: "CronJob",
    ConfigMap: "ConfigMap",
    Secret: "Secret",
    Service: "Service",
    Ingress: "Ingress",
    PersistentVolumeClaim: "PersistentVolumeClaim",
    PersistentVolume: "PersistentVolume",
    StorageClass: "StorageClass",
    Endpoints: "Endpoints",
    Node: "Node",
    Event: "Event",
    Namespace: "Namespace",
    CustomResourceDefinition: "CustomResourceDefinition",
} as const;

export type ResourceKind = (typeof ResourceType)[keyof typeof ResourceType];



/**
 * Mapping from Kind to lowercase plural API path format
 */
const kindToPlural: Record<ResourceKind, string> = {
    Pod: "pods",
    Deployment: "deployments",
    StatefulSet: "statefulsets",
    DaemonSet: "daemonsets",
    Job: "jobs",
    CronJob: "cronjobs",
    ConfigMap: "configmaps",
    Secret: "secrets",
    Service: "services",
    Ingress: "ingresses",
    PersistentVolumeClaim: "persistentvolumeclaims",
    PersistentVolume: "persistentvolumes",
    StorageClass: "storageclasses",
    Endpoints: "endpoints",
    Node: "nodes",
    Event: "events",
    Namespace: "namespaces",
    CustomResourceDefinition: "customresourcedefinitions",
};

/**
 * Mapping from lowercase plural to Kind
 */
const pluralToKind: Record<string, ResourceKind> = {
    pods: "Pod",
    deployments: "Deployment",
    statefulsets: "StatefulSet",
    daemonsets: "DaemonSet",
    jobs: "Job",
    cronjobs: "CronJob",
    configmaps: "ConfigMap",
    secrets: "Secret",
    services: "Service",
    ingresses: "Ingress",
    persistentvolumeclaims: "PersistentVolumeClaim",
    persistentvolumes: "PersistentVolume",
    storageclasses: "StorageClass",
    endpoints: "Endpoints",
    nodes: "Node",
    events: "Event",
    namespaces: "Namespace",
    customresourcedefinitions: "CustomResourceDefinition",
};

/**
 * Convert resource type to lowercase plural form (for API paths)
 * @example toPlural("Pod") → "pods"
 */
export function toPlural(resourceType: ResourceKind): string {
    return kindToPlural[resourceType];
}

/**
 * Convert any resource string to Kind format
 * @example toKind("pods") → "Pod", toKind("Pod") → "Pod"
 */
export function toKind(resourceType: string): ResourceKind | null {
    // Already in Kind format
    if (resourceType in kindToPlural) {
        return resourceType as ResourceKind;
    }
    // Lowercase format
    const lower = resourceType.toLowerCase();
    return pluralToKind[lower] ?? null;
}

/**
 * Check if a string is a valid ResourceType
 */
export function isResourceType(value: string): value is ResourceKind {
    return value in kindToPlural || value.toLowerCase() in pluralToKind;
}
