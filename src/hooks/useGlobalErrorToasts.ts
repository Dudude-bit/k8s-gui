import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '@/components/ui/use-toast';

const DEDUPE_MS = 3000;

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export function useGlobalErrorToasts() {
  const { toast } = useToast();
  const lastErrorRef = useRef<{ message: string; time: number } | null>(null);

  useEffect(() => {
    const emitToast = (title: string, description?: string) => {
      const message = description || title;
      const now = Date.now();
      if (lastErrorRef.current) {
        const { message: prevMessage, time } = lastErrorRef.current;
        if (prevMessage === message && now - time < DEDUPE_MS) {
          return;
        }
      }
      lastErrorRef.current = { message, time: now };
      toast({
        title,
        description,
        variant: 'destructive',
      });
    };

    const onError = (event: ErrorEvent) => {
      const description = event.error?.message || event.message || 'Unknown error';
      emitToast('Unexpected error', description);
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const description = normalizeErrorMessage(event.reason);
      emitToast('Unhandled promise rejection', description);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    let unlisten: null | (() => void) = null;
    listen<{ code?: string; message?: string }>('app-error', (event) => {
      const code = event.payload.code ? ` (${event.payload.code})` : '';
      const description = event.payload.message || 'Unknown backend error';
      emitToast(`Backend error${code}`, description);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      if (unlisten) {
        unlisten();
      }
    };
  }, [toast]);
}
