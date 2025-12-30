/**
 * Hooks - Unified exports
 */

// Resource hooks
export {
  useResource,
  useResourceList,
  useResourceMutation,
  useResourceDelete,
  useResourceCrud,
  type UseResourceOptions,
  type MutationToastConfig,
  type UseResourceMutationOptions,
  type ResourceWithIdentity,
  type UseResourceDeleteConfig,
  type UseResourceCrudConfig,
} from './useResource';

// Detail page hook
export {
  useResourceDetail,
  isResourceNotFoundError,
  type UseResourceDetailOptions,
  type UseResourceDetailResult,
  type DetailLoadingProps,
  type DetailErrorProps,
} from './useResourceDetail';

// Specialized hooks
export { useResourceYaml } from './useResourceYaml';
export { useCopyToClipboard } from './useCopyToClipboard';
export { usePodsWithMetrics, type PodWithMetrics } from './usePodsWithMetrics';
export { usePodMetrics } from './usePodMetrics';
export { useResourceWithMetrics } from './useResourceWithMetrics';

// License and user hooks
export { useLicense } from './useLicense';
export { usePremiumFeature } from './usePremiumFeature';
export { useUserProfile } from './useUserProfile';

// Navigation hooks
export { useLoginRedirect } from './useLoginRedirect';
