// src/components/ui/source-badge.tsx
import { Badge } from "@/components/ui/badge";
import { Lock, FileKey, Settings, Box, HardDrive, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type SourceType =
  | "secret"
  | "configmap"
  | "direct"
  | "field"
  | "resource"
  | "envFromSecret"
  | "envFromConfigMap"
  | "volume"
  | "tls";

interface SourceBadgeProps {
  type: SourceType;
  name?: string;
  namespace?: string;
  className?: string;
  linkable?: boolean;
}

const sourceConfig: Record<SourceType, {
  label: string;
  icon: React.ElementType;
  variant: "default" | "secondary" | "outline" | "destructive";
  color?: string;
}> = {
  secret: {
    label: "Secret",
    icon: Lock,
    variant: "destructive",
  },
  configmap: {
    label: "ConfigMap",
    icon: FileKey,
    variant: "secondary",
  },
  direct: {
    label: "Direct",
    icon: Settings,
    variant: "outline",
  },
  field: {
    label: "Field",
    icon: Settings,
    variant: "outline",
  },
  resource: {
    label: "Resource",
    icon: Box,
    variant: "outline",
  },
  envFromSecret: {
    label: "EnvFrom Secret",
    icon: Lock,
    variant: "destructive",
  },
  envFromConfigMap: {
    label: "EnvFrom ConfigMap",
    icon: FileKey,
    variant: "secondary",
  },
  volume: {
    label: "Volume",
    icon: HardDrive,
    variant: "outline",
  },
  tls: {
    label: "TLS",
    icon: Globe,
    variant: "outline",
  },
};

export function SourceBadge({
  type,
  name,
  namespace,
  className,
  linkable = true,
}: SourceBadgeProps) {
  const config = sourceConfig[type];
  const Icon = config.icon;

  const content = (
    <Badge variant={config.variant} className={cn("gap-1", className)}>
      <Icon className="h-3 w-3" />
      {config.label}
      {name && <span className="ml-1 opacity-70">{name}</span>}
    </Badge>
  );

  const isSecretType = type === "secret" || type === "envFromSecret";
  const isConfigMapType = type === "configmap" || type === "envFromConfigMap";

  if (linkable && name && namespace && (isSecretType || isConfigMapType)) {
    const resourceType = isSecretType ? "secrets" : "configmaps";
    const path = `/configuration/${resourceType}/${namespace}/${name}`;
    return (
      <Link to={path} className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
