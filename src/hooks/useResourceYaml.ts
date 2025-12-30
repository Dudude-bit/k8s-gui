import { useQuery } from "@tanstack/react-query";
import { invokeTyped } from "@/lib/tauri";

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
      invokeTyped<string>(`get_${resourceKind.toLowerCase()}_yaml`, {
        name,
        namespace,
      }),
    enabled: activeTab === "yaml" && !!namespace && !!name,
  });
}
