import { useParams } from 'react-router-dom';

export function ServiceDetail() {
  const { namespace, name } = useParams();
  
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Service: {name}</h1>
      <p className="text-muted-foreground">Namespace: {namespace}</p>
      <p className="text-muted-foreground">
        Service details page - under construction
      </p>
    </div>
  );
}
