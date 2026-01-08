/**
 * Hooks - Unified exports
 */

// Resource hooks
export {
  useResource,
  useResourceList,
  useResourceMutation,
  type UseResourceOptions,
  type MutationToastConfig,
  type UseResourceMutationOptions,
} from "./useResource";

// Detail page hook
export {
  useResourceDetail,
  isResourceNotFoundError,
} from "./useResourceDetail";

// Specialized hooks
export { useResourceYaml } from "./useResourceYaml";
export { useCopyToClipboard } from "./useCopyToClipboard";
export { usePodsWithMetrics, type PodWithMetrics } from "./usePodsWithMetrics";
export { useMetrics } from "./useMetrics";

// License and user hooks
export { useLicense } from "./useLicense";
export { usePremiumFeature } from "./usePremiumFeature";
export { useUserProfile } from "./useUserProfile";

// Navigation hooks
// Navigation hooks
export { useLoginRedirect } from "./useLoginRedirect";

// Terminal
export { useTerminalSession } from "./useTerminalSession";
