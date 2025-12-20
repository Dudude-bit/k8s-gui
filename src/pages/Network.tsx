import { Routes, Route } from 'react-router-dom';
import { ServiceList } from '@/components/resources/ServiceList';
import { IngressList } from '@/components/resources/IngressList';
import { EndpointsList } from '@/components/resources/EndpointsList';

export function Network() {
  return (
    <Routes>
      <Route path="services" element={<ServiceList />} />
      <Route path="ingresses" element={<IngressList />} />
      <Route path="endpoints" element={<EndpointsList />} />
      <Route index element={<ServiceList />} />
    </Routes>
  );
}
