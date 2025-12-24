import { LoginForm } from "@/components/auth/LoginForm";
import { useLoginRedirect } from "@/hooks/useLoginRedirect";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function Login() {
  const { handleLoginSuccess, handleGoBack } = useLoginRedirect();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGoBack}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад
        </Button>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">K8s GUI</h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to access your Kubernetes clusters
          </p>
        </div>
        <LoginForm onSuccess={handleLoginSuccess} />
      </div>
    </div>
  );
}
