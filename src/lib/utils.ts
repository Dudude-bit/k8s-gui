import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

export function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  
  if (['running', 'ready', 'available', 'active', 'succeeded'].includes(statusLower)) {
    return 'text-green-500';
  } else if (['pending', 'waiting', 'progressing'].includes(statusLower)) {
    return 'text-blue-500';
  } else if (['warning', 'degraded'].includes(statusLower)) {
    return 'text-yellow-500';
  } else if (['error', 'failed', 'crashloopbackoff', 'evicted', 'oomkilled'].includes(statusLower)) {
    return 'text-red-500';
  } else if (['terminated', 'completed'].includes(statusLower)) {
    return 'text-gray-500';
  }
  
  return 'text-muted-foreground';
}

export function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const statusLower = status.toLowerCase();
  
  if (['running', 'ready', 'available', 'active', 'succeeded'].includes(statusLower)) {
    return 'default';
  } else if (['error', 'failed', 'crashloopbackoff', 'evicted', 'oomkilled'].includes(statusLower)) {
    return 'destructive';
  } else if (['pending', 'waiting', 'progressing'].includes(statusLower)) {
    return 'secondary';
  }
  
  return 'outline';
}
