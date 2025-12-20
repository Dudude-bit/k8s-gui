import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Server, Cpu, HardDrive, MemoryStick, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NodeAddressInfo {
  type_: string;
  address: string;
}

interface ConditionInfo {
  type_: string;
  status: string;
  message: string | null;
  reason: string | null;
  last_transition_time: string | null;
}

interface NodeStatusInfo {
  ready: boolean;
  conditions: ConditionInfo[];
  addresses: NodeAddressInfo[];
}

interface ResourceQuantities {
  cpu: string | null;
  memory: string | null;
  pods: string | null;
  ephemeral_storage: string | null;
}

interface NodeInfo {
  name: string;
  uid: string;
  status: NodeStatusInfo;
  roles: string[];
  version: string;
  os: string;
  arch: string;
  container_runtime: string;
  labels: Record<string, string>;
  capacity: ResourceQuantities;
  allocatable: ResourceQuantities;
  created_at: string | null;
}

export function NodeDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  const { data: node, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['node', name],
    queryFn: async () => {
      return invoke<NodeInfo>('get_node', { name });
    },
    enabled: !!name,
    placeholderData: keepPreviousData,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Node not found
      </div>
    );
  }

  const getInternalIP = () => {
    const internal = node.status.addresses.find(a => a.type_ === 'InternalIP');
    return internal?.address || '-';
  };

  const getExternalIP = () => {
    const external = node.status.addresses.find(a => a.type_ === 'ExternalIP');
    return external?.address || '-';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Server className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">{node.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {node.roles.map((role) => (
                <Badge key={role} variant="outline">{role}</Badge>
              ))}
              <Badge className={node.status.ready ? 'bg-green-500' : 'bg-red-500'}>
                {node.status.ready ? 'Ready' : 'NotReady'}
              </Badge>
            </div>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Resource Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{node.capacity.cpu || '-'}</div>
            <p className="text-xs text-muted-foreground">
              Allocatable: {node.allocatable.cpu || '-'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{node.capacity.memory || '-'}</div>
            <p className="text-xs text-muted-foreground">
              Allocatable: {node.allocatable.memory || '-'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pods</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{node.capacity.pods || '-'}</div>
            <p className="text-xs text-muted-foreground">
              Allocatable: {node.allocatable.pods || '-'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate text-lg">{node.capacity.ephemeral_storage || '-'}</div>
            <p className="text-xs text-muted-foreground truncate">
              Allocatable: {node.allocatable.ephemeral_storage || '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="w-full">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="conditions">Conditions</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Node Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Internal IP</p>
                <p className="font-mono">{getInternalIP()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">External IP</p>
                <p className="font-mono">{getExternalIP()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Kubernetes Version</p>
                <p>{node.version}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Container Runtime</p>
                <p>{node.container_runtime}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">OS</p>
                <p>{node.os}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Architecture</p>
                <p>{node.arch}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p>{node.created_at ? new Date(node.created_at).toLocaleString() : '-'}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conditions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {node.status.conditions.map((condition, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant={condition.status === 'True' ? 'default' : 'secondary'}>
                        {condition.type_}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {condition.message || condition.reason || '-'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {condition.last_transition_time 
                        ? new Date(condition.last_transition_time).toLocaleString() 
                        : '-'}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="labels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Labels</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(node.labels).map(([key, value]) => (
                  <Badge key={key} variant="outline" className="font-mono text-xs">
                    {key}={value}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
