import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LogViewer } from '@/components/logs/LogViewer';
import { Terminal } from '@/components/terminal/Terminal';
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Terminal as TerminalIcon,
  Trash2,
  RefreshCw,
  Copy,
  Activity,
  AlertCircle,
  Search,
} from 'lucide-react';

interface PodCondition {
  type_: string;
  status: string;
  last_transition_time: string | null;
  reason: string | null;
  message: string | null;
}

interface ContainerState {
  type: 'running' | 'waiting' | 'terminated' | 'unknown';
  reason?: string | null;
  exit_code?: number;
}

interface ContainerInfo {
  name: string;
  image: string;
  ready: boolean;
  restart_count: number;
  state: ContainerState;
  started_at: string | null;
}

interface PodStatusInfo {
  phase: string;
  ready: boolean;
  conditions: PodCondition[];
  message: string | null;
  reason: string | null;
}

interface PodInfo {
  name: string;
  namespace: string;
  uid: string;
  status: PodStatusInfo;
  node_name: string | null;
  pod_ip: string | null;
  host_ip: string | null;
  containers: ContainerInfo[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
  created_at: string | null;
  restart_count: number;
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'running':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
    case 'error':
      return 'destructive';
    default:
      return 'secondary';
  }
};

export function PodDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [podKey, setPodKey] = useState(0); // Used to force LogViewer remount
  const [isSearchingReplacement, setIsSearchingReplacement] = useState(false);
  const [savedLabels, setSavedLabels] = useState<Record<string, string> | null>(null);

  const { data: pod, isLoading, error } = useQuery({
    queryKey: ['pod', namespace, name],
    queryFn: async () => {
      const result = await invoke<PodInfo>('get_pod', { name, namespace });
      // Save labels for replacement search
      if (result.labels && Object.keys(result.labels).length > 0) {
        setSavedLabels(result.labels);
      }
      return result;
    },
    enabled: !!namespace && !!name,
    retry: (failureCount, error) => {
      // Don't retry if pod not found (404)
      const errorStr = String(error);
      if (errorStr.includes('not found') || errorStr.includes('NotFound')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Find replacement pod by labels
  const findReplacementPod = useCallback(async (labelsToUse?: Record<string, string>) => {
    const labels = labelsToUse || savedLabels;
    console.log('findReplacementPod called with labels:', labels, 'namespace:', namespace);
    
    if (!labels || !namespace) {
      console.log('No labels or namespace, returning null');
      return null;
    }
    
    setIsSearchingReplacement(true);
    
    try {
      // Build label selector from pod's labels (use app/component labels)
      // Also include pod-template-hash for deployments
      const importantLabels = ['app', 'app.kubernetes.io/name', 'app.kubernetes.io/instance', 'component', 'pod-template-hash'];
      const labelParts: string[] = [];
      
      for (const label of importantLabels) {
        if (labels[label]) {
          labelParts.push(`${label}=${labels[label]}`);
        }
      }
      
      if (labelParts.length === 0) {
        console.log('No matching labels found, returning null');
        setIsSearchingReplacement(false);
        return null;
      }
      
      const labelSelector = labelParts.join(',');
      console.log('Label selector:', labelSelector);
      
      interface PodListItem {
        name: string;
        namespace: string;
        status: {
          phase: string;
        };
      }
      
      const pods = await invoke<PodListItem[]>('list_pods', {
        filters: {
          namespace,
          label_selector: labelSelector,
        },
      });
      
      console.log('Found pods:', pods);
      
      // Find a running pod that's not the current one
      // status.phase is the phase string (Running, Pending, etc.)
      const replacement = pods.find(
        (p) => p.name !== name && p.status.phase === 'Running'
      );
      
      console.log('Replacement pod:', replacement);
      
      return replacement || null;
    } catch (err) {
      console.error('Failed to find replacement pod:', err);
      return null;
    } finally {
      setIsSearchingReplacement(false);
    }
  }, [savedLabels, namespace, name]);

  const { data: podYaml } = useQuery({
    queryKey: ['pod-yaml', namespace, name],
    queryFn: async () => {
      const result = await invoke<string>('get_pod_yaml', { name, namespace });
      return result;
    },
    enabled: activeTab === 'yaml' && !!namespace && !!name,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await invoke('delete_pod', { name, namespace });
    },
    onSuccess: () => {
      toast({
        title: 'Pod deleted',
        description: `Pod ${name} has been deleted.`,
      });
      navigate(-1);
    },
    onError: (err) => {
      toast({
        title: 'Error',
        description: `Failed to delete pod: ${err}`,
        variant: 'destructive',
      });
    },
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      await invoke('restart_pod', { name, namespace });
    },
    onSuccess: () => {
      toast({
        title: 'Pod restarted',
        description: `Pod ${name} is being restarted.`,
      });
      queryClient.invalidateQueries({ queryKey: ['pod', namespace, name] });
    },
    onError: (err) => {
      toast({
        title: 'Error',
        description: `Failed to restart pod: ${err}`,
        variant: 'destructive',
      });
    },
  });

  const copyYaml = async () => {
    if (podYaml) {
      await navigator.clipboard.writeText(podYaml);
      toast({
        title: 'Copied',
        description: 'YAML copied to clipboard.',
      });
    }
  };

  const openTerminal = (containerName: string) => {
    setSelectedContainer(containerName);
    setShowTerminal(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !pod) {
    const errorStr = String(error || '');
    const isPodNotFound = errorStr.includes('not found') || errorStr.includes('NotFound');
    
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive text-lg font-medium">
          {isPodNotFound ? 'Pod not found' : 'Failed to load pod details'}
        </p>
        {isPodNotFound && (
          <p className="text-muted-foreground text-sm">
            The pod may have been deleted or restarted with a new name
          </p>
        )}
        {isSearchingReplacement && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Looking for replacement...</span>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          {isPodNotFound && savedLabels && (
            <Button 
              onClick={() => findReplacementPod().then((replacement) => {
                if (replacement) {
                  toast({
                    title: 'Found replacement pod',
                    description: `Switching to ${replacement.name}`,
                  });
                  navigate(`/pods/${replacement.namespace}/${replacement.name}`, { replace: true });
                } else {
                  toast({
                    title: 'No replacement found',
                    description: 'No other running pods with matching labels',
                    variant: 'destructive',
                  });
                }
              })} 
              disabled={isSearchingReplacement}
            >
              <Search className="mr-2 h-4 w-4" />
              {isSearchingReplacement ? 'Searching...' : 'Find Replacement'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{pod.name}</h1>
            <p className="text-muted-foreground">{pod.namespace}</p>
          </div>
          <Badge variant={getStatusColor(pod.status.phase) as any}>{pod.status.phase}</Badge>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Terminal Panel */}
      {showTerminal && selectedContainer && (
        <Card>
          <CardContent className="p-0 h-80">
            <Terminal
              podName={pod.name}
              namespace={pod.namespace}
              containerName={selectedContainer}
              onClose={() => setShowTerminal(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="containers">Containers</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Pod Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phase</span>
                  <span>{pod.status.phase}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Node</span>
                  <span>{pod.node_name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pod IP</span>
                  <span>{pod.pod_ip || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Host IP</span>
                  <span>{pod.host_ip || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started</span>
                  <span>{pod.start_time || '-'}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Labels</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(pod.labels).map(([key, value]) => (
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
            {pod.containers.map((container) => (
              <Card key={container.name}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    {container.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={container.ready ? 'success' : 'destructive'}>
                      {container.ready ? 'Ready' : 'Not Ready'}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openTerminal(container.name)}
                    >
                      <TerminalIcon className="mr-2 h-4 w-4" />
                      Shell
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Image</span>
                    <span className="font-mono text-xs max-w-md truncate">{container.image}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">State</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={container.state.type === 'running' ? 'success' : container.state.type === 'waiting' ? 'warning' : 'secondary'}>
                        {container.state.type}
                      </Badge>
                      {container.state.reason && (
                        <span className="text-xs text-muted-foreground">({container.state.reason})</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Restarts</span>
                    <span className={container.restart_count > 5 ? 'text-yellow-500' : ''}>{container.restart_count}</span>
                  </div>
                  {container.started_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Started At</span>
                      <span>{new Date(container.started_at).toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="h-[500px]">
            <CardContent className="p-0 h-full">
              <LogViewer
                key={podKey}
                podName={pod.name}
                namespace={pod.namespace}
                containers={pod.containers.map((c) => c.name)}
                initialContainer={pod.containers[0]?.name}
                onPodNotFound={() => {
                  // Refetch to check if pod still exists
                  refetch();
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yaml">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Pod YAML</CardTitle>
              <Button variant="outline" size="sm" onClick={copyYaml}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto">
                  {podYaml || 'Loading...'}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conditions">
          <Card>
            <CardHeader>
              <CardTitle>Pod Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pod.status.conditions.map((condition, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={condition.status === 'True' ? 'success' : 'secondary'}
                      >
                        {condition.type_}
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
    </div>
  );
}
