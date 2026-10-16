'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * List pagination. Every list endpoint already returns { page, pages, total };
 * before this component the UI just asked for a big limit and silently
 * truncated, so a buyer with 300 leads believed they had 100.
 */
export function Pagination({
  page,
  pages,
  total,
  onChange,
  label = 'items',
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  if (pages <= 1) {
    return (
      <div className="flex items-center justify-end border-t border-[color:var(--color-border)] px-4 py-2.5">
        <span className="text-xs muted tabular-nums">
          {total} {label}
        </span>
      </div>
    );
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-[color:var(--color-border)] px-4 py-2.5"
    >
      <span className="text-xs muted tabular-nums">
        Page {page} of {pages} · {total} {label}
      </span>

      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      </div>
    </nav>
  );
}
