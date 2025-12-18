import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Trash2,
  RefreshCw,
  Copy,
  Scale,
  ImageIcon,
  RotateCcw,
} from 'lucide-react';

interface DeploymentInfo {
  name: string;
  namespace: string;
  replicas: number;
  ready_replicas: number;
  available_replicas: number;
  unavailable_replicas: number;
  strategy: string;
  selector: Record<string, string>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  containers: ContainerSpec[];
  conditions: DeploymentCondition[];
  created_at: string | null;
}

interface ContainerSpec {
  name: string;
  image: string;
  ports: number[];
  resources: {
    requests: Record<string, string>;
    limits: Record<string, string>;
  };
}

interface DeploymentCondition {
  type: string;
  status: string;
  reason: string | null;
  message: string | null;
  last_update_time: string | null;
}

interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  node_name: string | null;
  ready: string;
  restarts: number;
  age: string;
}

interface RolloutStatus {
  is_complete: boolean;
  current_replicas: number;
  updated_replicas: number;
  ready_replicas: number;
  available_replicas: number;
  message: string;
}

export function DeploymentDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [newReplicas, setNewReplicas] = useState(1);
  const [newImage, setNewImage] = useState('');
  const [selectedContainer, setSelectedContainer] = useState('');

  const { data: deployment, isLoading, error } = useQuery({
    queryKey: ['deployment', namespace, name],
    queryFn: async () => {
      const result = await invoke<DeploymentInfo>('get_deployment', { name, namespace });
      return result;
    },
    enabled: !!namespace && !!name,
  });

  const { data: deploymentYaml } = useQuery({
    queryKey: ['deployment-yaml', namespace, name],
    queryFn: async () => {
      const result = await invoke<string>('get_deployment_yaml', { name, namespace });
      return result;
    },
    enabled: activeTab === 'yaml' && !!namespace && !!name,
  });

  const { data: pods = [] } = useQuery({
    queryKey: ['deployment-pods', namespace, name],
    queryFn: async () => {
      const result = await invoke<PodInfo[]>('get_deployment_pods', { name, namespace });
      return result;
    },
    enabled: activeTab === 'pods' && !!namespace && !!name,
  });

  const { data: rolloutStatus } = useQuery({
    queryKey: ['rollout-status', namespace, name],
    queryFn: async () => {
      const result = await invoke<RolloutStatus>('get_rollout_status', { name, namespace });
      return result;
    },
    enabled: !!namespace && !!name,
    refetchInterval: 5000,
  });

  const scaleMutation = useMutation({
    mutationFn: async (replicas: number) => {
      await invoke('scale_deployment', { name, namespace, replicas });
    },
    onSuccess: () => {
      toast({
        title: 'Deployment scaled',
        description: `Deployment ${name} scaled to ${newReplicas} replicas.`,
      });
      setScaleDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['deployment', namespace, name] });
    },
    onError: (err) => {
      toast({
        title: 'Error',
        description: `Failed to scale deployment: ${err}`,
        variant: 'destructive',
      });
    },
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      await invoke('restart_deployment', { name, namespace });
    },
    onSuccess: () => {
      toast({
        title: 'Deployment restarted',
        description: `Deployment ${name} is being restarted.`,
      });
      queryClient.invalidateQueries({ queryKey: ['deployment', namespace, name] });
    },
    onError: (err) => {
      toast({
        title: 'Error',
        description: `Failed to restart deployment: ${err}`,
        variant: 'destructive',
      });
    },
  });

  const updateImageMutation = useMutation({
    mutationFn: async () => {
      await invoke('update_deployment_image', {
        name,
        namespace,
        container: selectedContainer,
        image: newImage,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Image updated',
        description: `Container ${selectedContainer} image updated to ${newImage}.`,
      });
      setImageDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['deployment', namespace, name] });
    },
    onError: (err) => {
      toast({
        title: 'Error',
        description: `Failed to update image: ${err}`,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await invoke('delete_deployment', { name, namespace });
    },
    onSuccess: () => {
      toast({
        title: 'Deployment deleted',
        description: `Deployment ${name} has been deleted.`,
      });
      navigate(-1);
    },
    onError: (err) => {
      toast({
        title: 'Error',
        description: `Failed to delete deployment: ${err}`,
        variant: 'destructive',
      });
    },
  });

  const copyYaml = async () => {
    if (deploymentYaml) {
      await navigator.clipboard.writeText(deploymentYaml);
      toast({
        title: 'Copied',
        description: 'YAML copied to clipboard.',
      });
    }
  };

  const openScaleDialog = () => {
    if (deployment) {
      setNewReplicas(deployment.replicas);
      setScaleDialogOpen(true);
    }
  };

  const openImageDialog = (containerName: string, currentImage: string) => {
    setSelectedContainer(containerName);
    setNewImage(currentImage);
    setImageDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !deployment) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">Failed to load deployment details</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const isRolloutInProgress = rolloutStatus && !rolloutStatus.is_complete;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{deployment.name}</h1>
            <p className="text-muted-foreground">{deployment.namespace}</p>
          </div>
          <Badge variant={deployment.ready_replicas === deployment.replicas ? 'success' : 'warning'}>
            {deployment.ready_replicas}/{deployment.replicas} ready
          </Badge>
          {isRolloutInProgress && (
            <Badge variant="secondary" className="animate-pulse">
              <RotateCcw className="mr-1 h-3 w-3 animate-spin" />
              Rolling out...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openScaleDialog}>
            <Scale className="mr-2 h-4 w-4" />
            Scale
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Restart
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Rollout Progress */}
      {isRolloutInProgress && rolloutStatus && (
        <Card className="border-blue-500/50 bg-blue-500/10">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">{rolloutStatus.message}</span>
              <span className="text-sm text-muted-foreground">
                {rolloutStatus.ready_replicas}/{rolloutStatus.current_replicas} pods ready
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="containers">Containers</TabsTrigger>
          <TabsTrigger value="pods">Pods</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Deployment Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Strategy</span>
                  <span>{deployment.strategy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Replicas</span>
                  <span>{deployment.replicas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ready</span>
                  <span>{deployment.ready_replicas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available</span>
                  <span>{deployment.available_replicas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{deployment.created_at || '-'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Labels</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(deployment.labels).map(([key, value]) => (
                    <Badge key={key} variant="outline" className="text-xs">
                      {key}={value}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="containers">
          <div className="space-y-4">
            {deployment.containers.map((container) => (
              <Card key={container.name}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">{container.name}</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openImageDialog(container.name, container.image)}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Update Image
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Image</span>
                    <span className="font-mono text-xs">{container.image}</span>
                  </div>
                  {container.ports.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ports</span>
                      <span>{container.ports.join(', ')}</span>
                    </div>
                  )}
                  {Object.keys(container.resources.requests).length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Requests</span>
                      <span>
                        {Object.entries(container.resources.requests)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')}
                      </span>
                    </div>
                  )}
                  {Object.keys(container.resources.limits).length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Limits</span>
                      <span>
                        {Object.entries(container.resources.limits)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pods">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {pods.map((pod) => (
                  <Link
                    key={pod.name}
                    to={`/pod/${pod.namespace}/${pod.name}`}
                    className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          pod.status === 'Running'
                            ? 'success'
                            : pod.status === 'Pending'
                            ? 'warning'
                            : 'destructive'
                        }
                      >
                        {pod.status}
                      </Badge>
                      <span className="font-medium">{pod.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Ready: {pod.ready}</span>
                      <span>Restarts: {pod.restarts}</span>
                      <span>{pod.age}</span>
                    </div>
                  </Link>
                ))}
                {pods.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">No pods found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yaml">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Deployment YAML</CardTitle>
              <Button variant="outline" size="sm" onClick={copyYaml}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto">
                  {deploymentYaml || 'Loading...'}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conditions">
          <Card>
            <CardHeader>
              <CardTitle>Deployment Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {deployment.conditions.map((condition, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={condition.status === 'True' ? 'success' : 'secondary'}
                      >
                        {condition.type}
                      </Badge>
                      <span className="text-sm">{condition.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {condition.reason && <span>{condition.reason}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Scale Dialog */}
      <Dialog open={scaleDialogOpen} onOpenChange={setScaleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scale Deployment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="replicas">Number of replicas</Label>
              <Input
                id="replicas"
                type="number"
                min={0}
                value={newReplicas}
                onChange={(e) => setNewReplicas(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScaleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => scaleMutation.mutate(newReplicas)}
              disabled={scaleMutation.isPending}
            >
              Scale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Image Dialog */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Container Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Container</Label>
              <Input value={selectedContainer} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">New Image</Label>
              <Input
                id="image"
                value={newImage}
                onChange={(e) => setNewImage(e.target.value)}
                placeholder="e.g., nginx:1.21"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateImageMutation.mutate()}
              disabled={updateImageMutation.isPending || !newImage}
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
