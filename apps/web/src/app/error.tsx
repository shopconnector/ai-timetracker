'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">
            {error.message || 'An unexpected error occurred while loading the dashboard.'}
          </p>
          {error.digest && (
            <p className="text-xs text-slate-500 font-mono">Error ID: {error.digest}</p>
          )}
          <Button
            onClick={reset}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
