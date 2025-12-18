import { Routes, Route } from 'react-router-dom';

export function Storage() {
  return (
    <Routes>
      <Route path="pvs" element={<PlaceholderPage title="PersistentVolumes" />} />
      <Route path="pvcs" element={<PlaceholderPage title="PersistentVolumeClaims" />} />
      <Route path="classes" element={<PlaceholderPage title="StorageClasses" />} />
      <Route index element={<PlaceholderPage title="Storage" />} />
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
