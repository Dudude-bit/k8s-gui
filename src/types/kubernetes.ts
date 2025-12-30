// Kubernetes resource types for the frontend

export interface ClusterContext {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  is_current: boolean;
}

