export type ResourceKind =
  | "Pod"
  | "Deployment"
  | "Service"
  | "Ingress"
  | "ConfigMap"
  | "Secret";

export interface BaseResourceData {
  kind: ResourceKind;
  name: string;
  namespace: string;
  labels: Record<string, string>;
  origin?: "builder" | "cluster";
  status?: string;
  rawManifest?: Record<string, unknown>;
}

export interface PodResourceData extends BaseResourceData {
  kind: "Pod";
  image: string;
  ports: number[];
}

export interface DeploymentResourceData extends BaseResourceData {
  kind: "Deployment";
  replicas: number;
  image: string;
  ports: number[];
}

export interface ServiceResourceData extends BaseResourceData {
  kind: "Service";
  serviceType: "ClusterIP" | "NodePort" | "LoadBalancer";
  sessionAffinity: "None" | "ClientIP";
  ports: number[];
  selectors: Record<string, string>;
}

export interface IngressResourceData extends BaseResourceData {
  kind: "Ingress";
  host: string;
  path: string;
  pathType: "Prefix" | "Exact" | "ImplementationSpecific";
  serviceName: string;
  servicePort: number;
}

export interface ConfigMapResourceData extends BaseResourceData {
  kind: "ConfigMap";
  data: Record<string, string>;
}

export interface SecretResourceData extends BaseResourceData {
  kind: "Secret";
  secretType: string;
  data: Record<string, string>;
}

export type ResourceNodeData =
  | PodResourceData
  | DeploymentResourceData
  | ServiceResourceData
  | IngressResourceData
  | ConfigMapResourceData
  | SecretResourceData;
