'use client';

import { useState } from 'react';
import { useQueryStates, parseAsArrayOf, parseAsString } from 'nuqs';
import { Search, X, Repeat, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EventSearchDialog } from './event-search-dialog';
import { useShallow } from 'zustand/shallow';
import { useEventCalendarStore } from '@/hooks/use-event';
import type { Events } from '@/types/event';

type EventCalendarFiltersProps = {
  events: Events[];
};

export const EventCalendarFilters = ({ events }: EventCalendarFiltersProps) => {
  const { timeFormat, openEventDialog } = useEventCalendarStore(
    useShallow((state) => ({
      timeFormat: state.timeFormat,
      openEventDialog: state.openEventDialog,
    })),
  );
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [filters, setFilters] = useQueryStates({
    isRepeating: parseAsString.withDefault(''),
    repeatingTypes: parseAsArrayOf(parseAsString).withDefault([]),
    search: parseAsString.withDefault(''),
  });

  const getActiveFiltersCount = () => {
    let count = 0;
    count += filters.repeatingTypes.length;
    if (filters.isRepeating) count += 1;
    if (filters.search) count += 1;
    return count;
  };

  const toggleArrayFilter = (value: string) => {
    const currentArray = filters.repeatingTypes as string[];
    const newArray = currentArray.includes(value)
      ? currentArray.filter((item) => item !== value)
      : [...currentArray, value];

    setFilters({ repeatingTypes: newArray });
  };

  const updateSingleFilter = (key: keyof typeof filters, value: string) => {
    setFilters({ [key]: value });
  };

  const clearAllFilters = () => {
    setFilters({
      isRepeating: '',
      repeatingTypes: [],
      search: '',
    });
  };

  const clearSingleArrayFilter = (value: string) => {
    const currentArray = filters.repeatingTypes as string[];
    const newArray = currentArray.filter((item) => item !== value);
    setFilters({ repeatingTypes: newArray });
  };

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <div className="flex flex-col space-y-2 border-b px-4 pt-2 pb-2">
      <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
        <Button
          variant={filters.search ? 'default' : 'outline'}
          onClick={() => setSearchDialogOpen(true)}
          className="h-9 gap-2 px-4 text-sm font-medium transition-all"
        >
          <Search className="h-4 w-4" />
          Search Events
          {filters.search && (
            <Badge variant="secondary" className="ml-1">
              1
            </Badge>
          )}
        </Button>
        <Select
          value={filters.isRepeating}
          onValueChange={(value) => updateSingleFilter('isRepeating', value)}
        >
          <SelectTrigger className="h-9 w-[160px] gap-2 text-sm font-medium">
            <Repeat className="h-4 w-4" />
            <SelectValue placeholder="All Events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-sm">
              All Events
            </SelectItem>
            <SelectItem value="repeating" className="text-sm">
              Repeating Only
            </SelectItem>
            <SelectItem value="single" className="text-sm">
              Single Events
            </SelectItem>
          </SelectContent>
        </Select>
        {filters.isRepeating === 'repeating' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={
                  filters.repeatingTypes.length > 0 ? 'default' : 'outline'
                }
                size="sm"
                className="h-9 gap-2 px-4 text-sm font-medium transition-all"
              >
                <Clock className="h-4 w-4" />
                Repeat Types
                {filters.repeatingTypes.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {filters.repeatingTypes.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-4">
              <div className="space-y-3">
                <h4 className="text-muted-foreground text-sm font-medium">
                  Repeat Frequency
                </h4>
                <div className="space-y-3">
                  {['daily', 'weekly', 'monthly'].map((type) => (
                    <div key={type} className="flex items-center space-x-3">
                      <Checkbox
                        id={`repeat-${type}`}
                        checked={filters.repeatingTypes.includes(type)}
                        onCheckedChange={() => toggleArrayFilter(type)}
                      />
                      <Label
                        htmlFor={`repeat-${type}`}
                        className="cursor-pointer text-sm font-normal capitalize"
                      >
                        {type}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {activeFiltersCount > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm font-medium">
                {activeFiltersCount} active filter
                {activeFiltersCount > 1 ? 's' : ''}:
              </span>
              {filters.search && (
                <Badge
                  variant="outline"
                  className="h-7 gap-1.5 border-blue-200 bg-blue-50 px-2 py-1 text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <Search className="h-3 w-3" />
                  <span className="text-xs font-medium">
                    &quot;{filters.search}&quot;
                  </span>
                  <button
                    onClick={() => updateSingleFilter('search', '')}
                    className="ml-1 rounded-full p-0.5 transition-colors hover:bg-blue-200"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
              {filters.isRepeating && (
                <Badge
                  variant="outline"
                  className="h-7 gap-1.5 border-orange-200 bg-orange-50 px-2 py-1 text-orange-700 transition-colors hover:bg-orange-100"
                >
                  <Repeat className="h-3 w-3" />
                  <span className="text-xs font-medium">
                    {filters.isRepeating === 'repeating'
                      ? 'Repeating'
                      : 'Single'}
                  </span>
                  <button
                    onClick={() => updateSingleFilter('isRepeating', '')}
                    className="ml-1 rounded-full p-0.5 transition-colors hover:bg-orange-200"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              )}
              {filters.repeatingTypes.map((type) => (
                <Badge
                  key={`repeat-${type}`}
                  variant="outline"
                  className="h-7 gap-1.5 border-indigo-200 bg-indigo-50 px-2 py-1 text-indigo-700 transition-colors hover:bg-indigo-100"
                >
                  <Clock className="h-3 w-3" />
                  <span className="text-xs font-medium">{type}</span>
                  <button
                    onClick={() =>
                      clearSingleArrayFilter(type)
                    }
                    className="ml-1 rounded-full p-0.5 transition-colors hover:bg-indigo-200"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <Button
              variant="ghost"
              onClick={clearAllFilters}
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-muted border-muted-foreground/30 hover:border-muted-foreground/50 h-7 gap-1.5 border border-dashed px-3 text-xs font-medium transition-all"
            >
              <X className="h-3.5 w-3.5" />
              Clear All
            </Button>
          </>
        )}
      </div>
      <EventSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        events={events}
        searchQuery={filters.search}
        onSearchQueryChange={(query) => updateSingleFilter('search', query)}
        onEventSelect={openEventDialog}
        timeFormat={timeFormat}
      />
    </div>
  );
};
