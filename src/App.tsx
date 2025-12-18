import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { ClusterOverview } from '@/pages/ClusterOverview';
import { Workloads } from '@/pages/Workloads';
import { Network } from '@/pages/Network';
import { Storage } from '@/pages/Storage';
import { Configuration } from '@/pages/Configuration';
import { Nodes } from '@/pages/Nodes';
import { Events } from '@/pages/Events';
import { Helm } from '@/pages/Helm';
import { Settings } from '@/pages/Settings';
import { PodDetail } from '@/pages/PodDetail';
import { DeploymentDetail } from '@/pages/DeploymentDetail';
import { ServiceDetail } from '@/pages/ServiceDetail';
import { NodeDetail } from '@/pages/NodeDetail';
import { Toaster } from '@/components/ui/toaster';
import { useThemeStore } from '@/stores/themeStore';

export default function App() {
  const { theme } = useThemeStore();

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ClusterOverview />} />
          <Route path="workloads/*" element={<Workloads />} />
          <Route path="network/*" element={<Network />} />
          <Route path="storage/*" element={<Storage />} />
          <Route path="configuration/*" element={<Configuration />} />
          <Route path="nodes" element={<Nodes />} />
          <Route path="nodes/:name" element={<NodeDetail />} />
          <Route path="events" element={<Events />} />
          <Route path="helm" element={<Helm />} />
          <Route path="settings" element={<Settings />} />
          <Route path="pod/:namespace/:name" element={<PodDetail />} />
          <Route path="deployment/:namespace/:name" element={<DeploymentDetail />} />
          <Route path="service/:namespace/:name" element={<ServiceDetail />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
