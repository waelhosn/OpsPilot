'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Loader2, Search } from 'lucide-react';
import { Input } from '../ui/input';
import { EventCard } from './ui/events';
import { Events, TimeFormatType } from '@/types/event';
import { ScrollArea } from '../ui/scroll-area';

interface EventSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: Events[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onEventSelect: (event: Events) => void;
  timeFormat: TimeFormatType;
}

const PAGE_SIZE = 20;

function buildSearchText(event: Events): string {
  return [
    event.title,
    event.description,
    event.location,
    event.category,
    event.startTime,
    event.endTime,
    event.startDate.toISOString(),
    event.endDate.toISOString(),
    event.repeatingType ?? '',
    event.isRepeating ? 'repeating' : 'single',
  ]
    .join(' ')
    .toLowerCase();
}

export const EventSearchDialog = ({
  open,
  onOpenChange,
  events,
  searchQuery,
  onSearchQueryChange,
  onEventSelect,
  timeFormat,
}: EventSearchDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const terms = useMemo(
    () => normalizedQuery.split(/\s+/).filter(Boolean),
    [normalizedQuery],
  );

  const filteredResults = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return events.filter((event) => {
      const haystack = buildSearchText(event);
      return terms.every((term) => haystack.includes(term));
    });
  }, [events, normalizedQuery, terms]);

  const searchResults = useMemo(
    () => filteredResults.slice(0, visibleCount),
    [filteredResults, visibleCount],
  );

  const totalCount = filteredResults.length;
  const hasMore = totalCount > visibleCount;

  useEffect(() => {
    if (!open) {
      setVisibleCount(PAGE_SIZE);
      setIsLoading(false);
      return;
    }

    setVisibleCount(PAGE_SIZE);

    if (normalizedQuery.length < 2) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 120);
    return () => clearTimeout(timer);
  }, [open, normalizedQuery]);

  const loadMore = () => {
    if (!hasMore || isLoading || normalizedQuery.length < 2) return;
    setVisibleCount((current) => current + PAGE_SIZE);
  };

  const showNoResult =
    normalizedQuery.length >= 2 && !isLoading && totalCount === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Search Events</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-hidden">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
            <Input
              placeholder="Search all fields: title, description, location, category, date, time..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="pl-10"
            />
          </div>

          {normalizedQuery.length >= 2 && !isLoading ? (
            <div className="text-muted-foreground text-sm">
              {totalCount > 0
                ? `Found ${totalCount} event${totalCount !== 1 ? 's' : ''} matching "${searchQuery.trim()}"`
                : `No events found matching "${searchQuery.trim()}"`}
            </div>
          ) : null}

          <ScrollArea className="h-[400px] flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-muted-foreground ml-2 text-sm">
                  Searching events...
                </span>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-2 pr-4">
                {searchResults.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={onEventSelect}
                    timeFormat={timeFormat}
                  />
                ))}
                {hasMore ? (
                  <div className="pt-4">
                    <button
                      onClick={loadMore}
                      disabled={isLoading}
                      className="hover:bg-muted/50 flex w-full items-center justify-center rounded-lg border p-3 text-sm transition-colors disabled:opacity-50"
                    >
                      Load more events
                    </button>
                  </div>
                ) : null}
              </div>
            ) : showNoResult ? (
              <div className="text-muted-foreground py-8 text-center">
                <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>No events found matching &quot;{searchQuery.trim()}&quot;</p>
                <p className="mt-1 text-xs">
                  Try title, location, description keywords, or date/time terms
                </p>
              </div>
            ) : (
              <div className="text-muted-foreground py-8 text-center">
                <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>Start typing to search events...</p>
                <p className="mt-1 text-xs">Enter at least 2 characters</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
