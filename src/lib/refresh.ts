export const REFRESH_INTERVALS = {
  resourceList: 5000,
  resourceDetail: 5000,
  overview: 4000,
  metrics: 3000,
  metricsCluster: 4000,
  fast: 2000,
  slow: 12000,
} as const;

export const STALE_TIMES = {
  resourceList: 3000,
  metrics: 2000,
  overview: 3000,
  resourceDetail: 2000,
  fast: 2000,
  slow: 12000,
} as const;
