'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SUPPORTED = ['pl', 'en'] as const;
type Lang = (typeof SUPPORTED)[number];

export function LangSwitcher() {
  const locale = useLocale() as Lang;
  const router = useRouter();
  const tCommon = useTranslations('common.language');
  const [pending, startTransition] = useTransition();

  const setLocale = (next: Lang) => {
    if (next === locale) return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label={tCommon('label')}
          disabled={pending}
        >
          <Languages className="h-4 w-4" />
          <span className="sr-only ml-1 text-xs uppercase">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {SUPPORTED.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => setLocale(lang)}
            className={lang === locale ? 'font-semibold' : ''}
          >
            <span className="mr-2 inline-block w-7 text-xs uppercase text-slate-500">
              {lang}
            </span>
            {tCommon(lang)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
