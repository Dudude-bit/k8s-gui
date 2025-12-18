import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Box,
  Network,
  Server,
  FileText,
  Settings,
  Activity,
  Package,
  LayoutDashboard,
} from 'lucide-react';

const quickActions = [
  { icon: LayoutDashboard, label: 'Go to Overview', path: '/', category: 'Navigation' },
  { icon: Box, label: 'Go to Pods', path: '/workloads/pods', category: 'Navigation' },
  { icon: Box, label: 'Go to Deployments', path: '/workloads/deployments', category: 'Navigation' },
  { icon: Network, label: 'Go to Services', path: '/network/services', category: 'Navigation' },
  { icon: Server, label: 'Go to Nodes', path: '/nodes', category: 'Navigation' },
  { icon: FileText, label: 'Go to ConfigMaps', path: '/configuration/configmaps', category: 'Navigation' },
  { icon: FileText, label: 'Go to Secrets', path: '/configuration/secrets', category: 'Navigation' },
  { icon: Activity, label: 'Go to Events', path: '/events', category: 'Navigation' },
  { icon: Package, label: 'Go to Helm', path: '/helm', category: 'Navigation' },
  { icon: Settings, label: 'Go to Settings', path: '/settings', category: 'Navigation' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      navigate(path);
      setOpen(false);
    },
    [navigate]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search resources, actions, or navigate..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {quickActions
            .filter((action) => action.category === 'Navigation')
            .map((action) => (
              <CommandItem
                key={action.path}
                onSelect={() => handleSelect(action.path)}
              >
                <action.icon className="mr-2 h-4 w-4" />
                {action.label}
              </CommandItem>
            ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => setOpen(false)}>
            <Box className="mr-2 h-4 w-4" />
            Create Pod
          </CommandItem>
          <CommandItem onSelect={() => setOpen(false)}>
            <Box className="mr-2 h-4 w-4" />
            Create Deployment
          </CommandItem>
          <CommandItem onSelect={() => setOpen(false)}>
            <Network className="mr-2 h-4 w-4" />
            Create Service
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
