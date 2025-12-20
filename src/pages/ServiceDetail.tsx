import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Network, RefreshCw, Globe, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServicePortInfo {
  name: string | null;
  protocol: string;
  port: i32;
  target_port: string;
  node_port: i32 | null;
}

interface ServiceInfo {
  name: string;
  namespace: string;
  uid: string;
  type_: string;
  cluster_ip: string | null;
  external_ips: string[];
  ports: ServicePortInfo[];
  selector: Record<string, string>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  created_at: string | null;
}

type i32 = number;

export function ServiceDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();

  const { data: service, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['service', namespace, name],
    queryFn: async () => {
      return invoke<ServiceInfo>('get_service', { name, namespace });
    },
    enabled: !!namespace && !!name,
    placeholderData: keepPreviousData,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Service not found
      </div>
    );
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'LoadBalancer': return 'bg-purple-500';
      case 'NodePort': return 'bg-blue-500';
      case 'ClusterIP': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Network className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">{service.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{service.namespace}</span>
              <Badge className={getTypeColor(service.type_)}>{service.type_}</Badge>
            </div>
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cluster IP</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono">{service.cluster_ip || 'None'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">External IPs</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono">
              {service.external_ips.length > 0 ? service.external_ips.join(', ') : 'None'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ports</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{service.ports.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ports" className="w-full">
        <TabsList>
          <TabsTrigger value="ports">Ports</TabsTrigger>
          <TabsTrigger value="selector">Selector</TabsTrigger>
          <TabsTrigger value="labels">Labels</TabsTrigger>
        </TabsList>

        <TabsContent value="ports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Service Ports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {service.ports.map((port, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{port.protocol}</Badge>
                      <span className="font-mono">
                        {port.name ? `${port.name}: ` : ''}
                        {port.port} → {port.target_port}
                      </span>
                    </div>
                    {port.node_port && (
                      <Badge variant="secondary">NodePort: {port.node_port}</Badge>
                    )}
                  </div>
                ))}
                {service.ports.length === 0 && (
                  <p className="text-muted-foreground">No ports defined</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="selector" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pod Selector</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(service.selector).map(([key, value]) => (
                  <Badge key={key} variant="outline" className="font-mono text-xs">
                    {key}={value}
                  </Badge>
                ))}
                {Object.keys(service.selector).length === 0 && (
                  <p className="text-muted-foreground">No selector defined</p>
                )}
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
                {Object.entries(service.labels).map(([key, value]) => (
                  <Badge key={key} variant="outline" className="font-mono text-xs">
                    {key}={value}
                  </Badge>
                ))}
                {Object.keys(service.labels).length === 0 && (
                  <p className="text-muted-foreground">No labels</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Annotations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(service.annotations).map(([key, value]) => (
                  <div key={key} className="rounded-lg border p-2">
                    <p className="text-xs font-medium text-muted-foreground">{key}</p>
                    <p className="font-mono text-sm break-all">{value}</p>
                  </div>
                ))}
                {Object.keys(service.annotations).length === 0 && (
                  <p className="text-muted-foreground">No annotations</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
