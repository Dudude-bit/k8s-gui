import { ReactNode, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, FileCode, Box, Link as LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { YamlEditor } from "@/components/yaml/YamlEditor";
import { LabelsDisplay } from "@/components/resources/LabelsDisplay";
import { ResourceDetailLayout } from "@/components/resources/ResourceDetailLayout";
import { formatAge } from "@/lib/utils";
import { normalizeTauriError } from "@/lib/error-utils";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { REFRESH_INTERVALS, STALE_TIMES } from "@/lib/refresh";
import { useClusterStore } from "@/stores/clusterStore";
import { commands } from "@/lib/commands";
import type { CustomResourceDetailInfo } from "@/generated/types";

// Component to render spec/status as a tree
function JsonTreeViewer({ data, depth = 0 }: { data: unknown; depth?: number }): ReactNode {
  if (data === null || data === undefined) {
    return <span className="text-muted-foreground">null</span>;
  }

  if (typeof data === "boolean") {
    return (
      <Badge variant={data ? "default" : "secondary"}>
        {String(data)}
      </Badge>
    );
  }

  if (typeof data === "number" || typeof data === "string") {
    return <span className="font-mono text-sm">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-muted-foreground">[]</span>;
    }
    return (
      <div className={depth > 0 ? "ml-4 border-l pl-4" : ""}>
        {data.map((item, index) => (
          <div key={index} className="py-1">
            <span className="text-muted-foreground mr-2">[{index}]</span>
            <JsonTreeViewer data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-muted-foreground">{"{}"}</span>;
    }
    return (
      <div className={depth > 0 ? "ml-4 border-l pl-4" : ""}>
        {entries.map(([key, value]) => (
          <div key={key} className="py-1">
            <span className="font-medium text-primary">{key}:</span>{" "}
            <JsonTreeViewer data={value} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(data)}</span>;
}

export function CustomResourceDetail() {
  const { crdName, namespace, name } = useParams<{
    crdName: string;
    namespace?: string;
    name: string;
  }>();
  const navigate = useNavigate();
  const { isConnected } = useClusterStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Decode CRD name from URL
  const decodedCrdName = crdName ? decodeURIComponent(crdName) : "";

  const goBack = () => navigate(-1);

  // Fetch CRD info to get kind and other metadata
  const { data: crdInfo } = useQuery({
    queryKey: ["crd", decodedCrdName],
    queryFn: async () => {
      try {
        return await commands.getCrd(decodedCrdName);
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected && !!decodedCrdName,
  });

  // Fetch the custom resource
  const {
    data: resource,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["custom-resource", decodedCrdName, namespace, name],
    queryFn: async () => {
      try {
        return await commands.getCustomResource(
          decodedCrdName,
          name || "",
          namespace || null
        );
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected && !!decodedCrdName && !!name,
    staleTime: STALE_TIMES.resourceDetail,
    refetchInterval: REFRESH_INTERVALS.resourceDetail,
  });

  // Fetch YAML
  const { data: yaml = "" } = useQuery({
    queryKey: ["custom-resource-yaml", decodedCrdName, namespace, name],
    queryFn: async () => {
      try {
        return await commands.getCustomResourceYaml(
          decodedCrdName,
          name || "",
          namespace || null
        );
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    enabled: isConnected && !!decodedCrdName && !!name,
    staleTime: STALE_TIMES.resourceDetail,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      try {
        await commands.deleteCustomResource(
          decodedCrdName,
          name || "",
          namespace || null
        );
      } catch (err) {
        throw new Error(normalizeTauriError(err));
      }
    },
    onSuccess: () => {
      toast({
        title: `${crdInfo?.kind || "Resource"} deleted`,
        description: `${name} has been deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["custom-resources", decodedCrdName] });
      navigate(-1);
    },
    onError: (error: Error) => {
      toast({
        title: `Failed to delete ${crdInfo?.kind || "resource"}`,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCopyYaml = () => {
    navigator.clipboard.writeText(yaml);
    toast({
      title: "Copied to clipboard",
      description: "YAML has been copied to clipboard.",
    });
  };

  // Determine status from resource
  const statusValue = resource ? getStatusFromResource(resource) : null;
  const statusVariant = getStatusVariant(statusValue);

  // Build tabs
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: resource && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  Resource Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">API Version</span>
                  <span className="font-mono">{resource.apiVersion}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Kind</span>
                  <span>{resource.kind}</span>
                </div>
                {resource.namespace && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Namespace</span>
                    <span>{resource.namespace}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">UID</span>
                  <span className="font-mono text-xs truncate max-w-[200px]">
                    {resource.uid}
                  </span>
                </div>
                {resource.resourceVersion && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Resource Version</span>
                    <span className="font-mono">{resource.resourceVersion}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>
                    {resource.createdAt ? formatAge(resource.createdAt) : "-"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Owner References */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Owner References
                </CardTitle>
              </CardHeader>
              <CardContent>
                {resource.ownerReferences.length > 0 ? (
                  <div className="space-y-2">
                    {resource.ownerReferences.map((owner, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                      >
                        <div>
                          <span className="font-medium">{owner.name}</span>
                          <span className="text-muted-foreground ml-2">
                            ({owner.kind})
                          </span>
                        </div>
                        {owner.controller && (
                          <Badge variant="outline" className="text-xs">
                            Controller
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No owner references
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Finalizers */}
          {resource.finalizers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Finalizers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {resource.finalizers.map((finalizer, index) => (
                    <Badge key={index} variant="outline" className="font-mono text-xs">
                      {finalizer}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Labels & Annotations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LabelsDisplay labels={resource.labels || {}} title="Labels" />
            <LabelsDisplay labels={resource.annotations || {}} title="Annotations" />
          </div>

          {/* CRD Link */}
          {crdInfo && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Custom Resource Definition
                    </p>
                    <p className="font-medium">{decodedCrdName}</p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/${toPlural(ResourceType.CustomResourceDefinition)}/${encodeURIComponent(decodedCrdName)}`}>
                      View CRD
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ),
    },
    {
      id: "spec",
      label: "Spec",
      content: (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Spec</CardTitle>
          </CardHeader>
          <CardContent>
            {resource ? (
              <JsonTreeViewer data={resource.spec} />
            ) : (
              <p className="text-muted-foreground">Loading...</p>
            )}
          </CardContent>
        </Card>
      ),
    },
    ...(resource?.status != null
      ? [
          {
            id: "status",
            label: "Status",
            content: (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonTreeViewer data={resource.status} />
                </CardContent>
              </Card>
            ),
          },
        ]
      : []),
    {
      id: "yaml",
      label: "YAML",
      content: (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">YAML Definition</CardTitle>
            <Button variant="outline" size="sm" onClick={handleCopyYaml}>
              Copy
            </Button>
          </CardHeader>
          <CardContent>
            <YamlEditor value={yaml} readOnly height="500px" />
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <>
      <ResourceDetailLayout
        resource={resource}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        resourceKind={crdInfo?.kind || "Resource"}
        title={resource?.name || ""}
        namespace={resource?.namespace ?? undefined}
        statusBadge={
          statusValue && <Badge variant={statusVariant}>{statusValue}</Badge>
        }
        badges={
          resource && (
            <span className="text-muted-foreground">{resource.kind}</span>
          )
        }
        icon={<Box className="h-8 w-8 text-muted-foreground" />}
        onBack={goBack}
        onRefresh={refetch}
        actions={
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={`Delete ${crdInfo?.kind || "Resource"}?`}
        description={`Are you sure you want to delete "${name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          deleteMutation.mutate();
          setDeleteDialogOpen(false);
        }}
      />
    </>
  );
}

// Helper to extract status from resource
function getStatusFromResource(resource: CustomResourceDetailInfo): string | null {
  if (!resource.status || typeof resource.status !== "object") {
    return null;
  }

  const status = resource.status as Record<string, unknown>;

  // Common status fields
  if (typeof status.phase === "string") {
    return status.phase;
  }

  if (typeof status.state === "string") {
    return status.state;
  }

  // Check conditions for Ready condition
  if (Array.isArray(status.conditions)) {
    const readyCondition = status.conditions.find(
      (c: unknown) =>
        typeof c === "object" &&
        c !== null &&
        (c as Record<string, unknown>).type === "Ready"
    );
    if (readyCondition) {
      const cond = readyCondition as Record<string, unknown>;
      return cond.status === "True" ? "Ready" : "NotReady";
    }
  }

  // Cert-manager specific
  if (typeof status.ready === "boolean") {
    return status.ready ? "Ready" : "NotReady";
  }

  return null;
}

// Helper to get badge variant based on status
function getStatusVariant(
  status: string | null
): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "outline";

  const lowerStatus = status.toLowerCase();

  if (
    lowerStatus === "ready" ||
    lowerStatus === "running" ||
    lowerStatus === "active" ||
    lowerStatus === "healthy" ||
    lowerStatus === "true" ||
    lowerStatus === "succeeded"
  ) {
    return "default";
  }

  if (
    lowerStatus === "notready" ||
    lowerStatus === "failed" ||
    lowerStatus === "error" ||
    lowerStatus === "false"
  ) {
    return "destructive";
  }

  if (
    lowerStatus === "pending" ||
    lowerStatus === "progressing" ||
    lowerStatus === "unknown"
  ) {
    return "secondary";
  }

  return "outline";
}
