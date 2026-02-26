import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Text } from '@tremor/react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, limit, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-tremor-border">
      <Text>{from}–{to} de {total}</Text>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="xs"
          icon={ChevronLeft}
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        />
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-xs text-tremor-content">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'primary' : 'secondary'}
              size="xs"
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </Button>
          )
        )}
        <Button
          variant="secondary"
          size="xs"
          icon={ChevronRight}
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
        />
      </div>
    </div>
  );
}
