import { Routes, Route } from 'react-router-dom';
import { ConfigMapList } from '@/components/resources/ConfigMapList';
import { SecretList } from '@/components/resources/SecretList';

export function Configuration() {
  return (
    <Routes>
      <Route path="configmaps" element={<ConfigMapList />} />
      <Route path="secrets" element={<SecretList />} />
      <Route index element={<ConfigMapList />} />
    </Routes>
  );
}
