export const REFRESH_INTERVALS = {
  resourceList: 2000,
  resourceDetail: 2000,
  overview: 2000,
  metrics: 2000,
  metricsCluster: 2000,
  fast: 1000,
  slow: 8000,
} as const;

export const STALE_TIMES = {
  resourceList: 1000,
  metrics: 1000,
  overview: 1000,
  resourceDetail: 1000,
  fast: 500,
  slow: 6000,
} as const;
