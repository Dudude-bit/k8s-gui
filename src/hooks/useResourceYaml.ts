import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

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
    queryFn: () =>
      invoke<string>(`get_${resourceKind.toLowerCase()}_yaml`, {
        name,
        namespace,
      }),
    enabled: activeTab === "yaml" && !!namespace && !!name,
  });
}




