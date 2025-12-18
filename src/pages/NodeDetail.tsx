import { useParams } from 'react-router-dom';

export function NodeDetail() {
  const { name } = useParams();
  
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Node: {name}</h1>
      <p className="text-muted-foreground">
        Node details page - under construction
      </p>
    </div>
  );
}
