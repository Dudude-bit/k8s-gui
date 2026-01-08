import { Routes, Route } from "react-router-dom";
import { ResourceType, toPlural } from "@/lib/resource-registry";
import { ServiceList } from "@/components/resources/ServiceList";
import { IngressList } from "@/components/resources/IngressList";
import { EndpointsList } from "@/components/resources/EndpointsList";

export function Network() {
  return (
    <Routes>
      <Route path={toPlural(ResourceType.Service)} element={<ServiceList />} />
      <Route path={toPlural(ResourceType.Ingress)} element={<IngressList />} />
      <Route path="endpoints" element={<EndpointsList />} />
      <Route index element={<ServiceList />} />
    </Routes>
  );
}
