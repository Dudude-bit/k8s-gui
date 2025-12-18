import { Routes, Route } from 'react-router-dom';
import { ServiceList } from '@/components/resources/ServiceList';

export function Network() {
  return (
    <Routes>
      <Route path="services" element={<ServiceList />} />
      <Route path="ingresses" element={<PlaceholderPage title="Ingresses" />} />
      <Route path="endpoints" element={<PlaceholderPage title="Endpoints" />} />
      <Route index element={<ServiceList />} />
    </Routes>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">
        This page is under construction.
      </p>
    </div>
  );
}
