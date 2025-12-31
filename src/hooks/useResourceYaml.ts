import { useQuery } from "@tanstack/react-query";
import * as commands from "@/generated/commands";

/** Map resource kind to its apiVersion */
export const API_VERSION_MAP: Record<string, string> = {
  Pod: "v1",
  Service: "v1",
  ConfigMap: "v1",
  Secret: "v1",
  Namespace: "v1",
  Node: "v1",
  PersistentVolume: "v1",
  PersistentVolumeClaim: "v1",
  Endpoints: "v1",
  Deployment: "apps/v1",
  StatefulSet: "apps/v1",
  DaemonSet: "apps/v1",
  ReplicaSet: "apps/v1",
  Job: "batch/v1",
  CronJob: "batch/v1",
  Ingress: "networking.k8s.io/v1",
  NetworkPolicy: "networking.k8s.io/v1",
  StorageClass: "storage.k8s.io/v1",
  ClusterRole: "rbac.authorization.k8s.io/v1",
  ClusterRoleBinding: "rbac.authorization.k8s.io/v1",
  Role: "rbac.authorization.k8s.io/v1",
  RoleBinding: "rbac.authorization.k8s.io/v1",
  ServiceAccount: "v1",
};

/**
 * Get API version for a resource kind
 */
export function getApiVersion(resourceKind: string): string {
  return API_VERSION_MAP[resourceKind] || "v1";
}

/**
 * Fetch YAML manifest for a resource (for use in callbacks where hooks are not available)
 */
export function fetchResourceYaml(
  resourceKind: string,
  name: string,
  namespace?: string | null
): Promise<string> {
  const apiVersion = getApiVersion(resourceKind);
  return commands.getManifest(resourceKind, apiVersion, name, namespace || null);
}

/**
 * Hook for loading YAML of a Kubernetes resource
 */
export function useResourceYaml(
  resourceKind: string,
  name: string | undefined,
  namespace: string | undefined,
  activeTab: string
) {
  return useQuery({
    queryKey: [`${resourceKind.toLowerCase()}-yaml`, namespace, name],
    queryFn: () => fetchResourceYaml(resourceKind, name!, namespace),
    enabled: activeTab === "yaml" && !!name,
  });
}
