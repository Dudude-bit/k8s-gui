import { ResourceType } from "@/lib/resource-types";

export type ResourceKind =
  | typeof ResourceType.Pod
  | typeof ResourceType.Deployment
  | typeof ResourceType.Service
  | typeof ResourceType.Ingress
  | typeof ResourceType.ConfigMap
  | typeof ResourceType.Secret;

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
  kind: typeof ResourceType.Pod;
  image: string;
  ports: number[];
}

export interface DeploymentResourceData extends BaseResourceData {
  kind: typeof ResourceType.Deployment;
  replicas: number;
  image: string;
  ports: number[];
}

export interface ServiceResourceData extends BaseResourceData {
  kind: typeof ResourceType.Service;
  serviceType: "ClusterIP" | "NodePort" | "LoadBalancer";
  sessionAffinity: "None" | "ClientIP";
  ports: number[];
  selectors: Record<string, string>;
}

export interface IngressResourceData extends BaseResourceData {
  kind: typeof ResourceType.Ingress;
  host: string;
  path: string;
  pathType: "Prefix" | "Exact" | "ImplementationSpecific";
  serviceName: string;
  servicePort: number;
}

export interface ConfigMapResourceData extends BaseResourceData {
  kind: typeof ResourceType.ConfigMap;
  data: Record<string, string>;
}

export interface SecretResourceData extends BaseResourceData {
  kind: typeof ResourceType.Secret;
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
