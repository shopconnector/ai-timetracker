'use client';

import { useSidebar } from '@/lib/providers/SidebarProvider';
import { cn } from '@/lib/utils';

export function MainContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <main
      className={cn(
        'pt-16 transition-all duration-300',
        isCollapsed ? 'ml-16' : 'ml-64'
      )}
    >
      <div className="p-6">{children}</div>
    </main>
  );
}
