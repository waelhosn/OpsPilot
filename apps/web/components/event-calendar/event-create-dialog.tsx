'use client';

import { Button } from '@/components/ui/button';
import { useEventCalendarStore } from '@/hooks/use-event';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { EventDetailsForm } from './event-detail-form';
import { createEventSchema } from '@/lib/validations';
import { EVENT_DEFAULTS } from '@/constants/calendar-constant';
import { useShallow } from 'zustand/shallow';
import { toast } from 'sonner';
import { getLocaleFromCode } from '@/lib/event';
import { useEventCalendarApi } from './event-calendar-api-context';
import { formatDateTime, parseEmailList } from '@/lib/utils';
import type { SuggestAlternativesResponse } from '@/lib/api/types';

type EventFormValues = z.infer<typeof createEventSchema>;

const DEFAULT_FORM_VALUES: EventFormValues = {
  title: '',
  description: '',
  startDate: new Date(),
  endDate: new Date(),
  category: EVENT_DEFAULTS.CATEGORY,
  startTime: EVENT_DEFAULTS.START_TIME,
  endTime: EVENT_DEFAULTS.END_TIME,
  location: '',
  color: EVENT_DEFAULTS.COLOR,
  isRepeating: false,
};

export default function EventCreateDialog() {
  const {
    isQuickAddDialogOpen,
    closeQuickAddDialog,
    locale,
    quickAddData,
  } = useEventCalendarStore(
    useShallow((state) => ({
      isQuickAddDialogOpen: state.isQuickAddDialogOpen,
      closeQuickAddDialog: state.closeQuickAddDialog,
      locale: state.locale,
      quickAddData: state.quickAddData,
    })),
  );
  const form = useForm<EventFormValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: 'onChange',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [inviteesInput, setInviteesInput] = useState('');
  const [descriptionHint, setDescriptionHint] = useState('');
  const [conflictResult, setConflictResult] = useState<SuggestAlternativesResponse | null>(null);
  const localeObj = getLocaleFromCode(locale);
  const calendarApi = useEventCalendarApi();

  const handleSubmit = async (formValues: EventFormValues) => {
    setIsSubmitting(true);
    try {
      if (calendarApi) {
        await calendarApi.createEvent({
          ...formValues,
          invitees: parseEmailList(inviteesInput),
        });
        toast.success('Event created');
        closeQuickAddDialog();
        setInviteesInput('');
        setDescriptionHint('');
        setConflictResult(null);
        return;
      }
      toast.success('DEMO: Create event UI triggered', {
        description:
          'Override this handler to implement actual event creation. Connect to your backend or state management.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create event';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isQuickAddDialogOpen && quickAddData.date) {
      form.reset({
        ...DEFAULT_FORM_VALUES,
        startDate: quickAddData.date,
        endDate: quickAddData.date,
        startTime: quickAddData.startTime,
        endTime: quickAddData.endTime,
      });
      setInviteesInput('');
      setDescriptionHint('');
      setConflictResult(null);
    }
  }, [isQuickAddDialogOpen, quickAddData, form]);

  const handleGenerateDescription = async () => {
    if (!calendarApi?.generateDescription) {
      toast.info('AI description is unavailable in demo mode');
      return;
    }

    setIsGeneratingDescription(true);
    try {
      const values = form.getValues();
      const generated = await calendarApi.generateDescription(
        values,
        descriptionHint.trim() || undefined,
      );
      form.setValue('description', generated, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      toast.success('Description drafted');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate description';
      toast.error(message);
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleCheckConflicts = async () => {
    if (!calendarApi?.checkConflicts) {
      toast.info('Conflict check is unavailable in demo mode');
      return;
    }

    setIsCheckingConflicts(true);
    try {
      const values = form.getValues();
      const result = await calendarApi.checkConflicts(values);
      setConflictResult(result);
      toast.success('Conflict analysis ready');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to check conflicts';
      toast.error(message);
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  const applySuggestion = (startAt: string, endAt: string) => {
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('Invalid suggestion time');
      return;
    }

    form.setValue('startDate', start, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    form.setValue('endDate', end, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    form.setValue('startTime', format(start, 'HH:mm'), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    form.setValue('endTime', format(end, 'HH:mm'), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    toast.success('Applied suggested time');
  };

  return (
    <Dialog
      open={isQuickAddDialogOpen}
      onOpenChange={(open) => !open && closeQuickAddDialog()}
      modal={false}
    >
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Add New Event</DialogTitle>
          <DialogDescription>
            Fill in the event details to add it to the calendar
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[500px] w-full">
          <EventDetailsForm
            form={form}
            onSubmit={handleSubmit}
            locale={localeObj}
            showCategoryAndColor={false}
            descriptionSlot={
              <div className="mt-2 space-y-2">
                <input
                  className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
                  value={descriptionHint}
                  onChange={(event) => setDescriptionHint(event.target.value)}
                  placeholder="Optional AI hint: agenda, audience, objective"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 gap-2 text-xs"
                  onClick={handleGenerateDescription}
                  disabled={isGeneratingDescription}
                >
                  {isGeneratingDescription ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI Description
                </Button>
              </div>
            }
            scheduleSlot={
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Conflict Check
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Validates this event time and proposes alternatives.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 h-8 gap-2 text-xs"
                  onClick={handleCheckConflicts}
                  disabled={isCheckingConflicts}
                >
                  {isCheckingConflicts ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Check Conflicts
                </Button>

                {conflictResult ? (
                  <div className="mt-3 space-y-2 text-xs text-slate-700">
                    <p>Has conflict: {String(conflictResult.has_conflict)}</p>
                    {conflictResult.conflicts.length > 0 ? (
                      <div>
                        <p className="font-semibold">Conflicting events</p>
                        <ul className="mt-1 space-y-1">
                          {conflictResult.conflicts.slice(0, 3).map((event) => (
                            <li key={event.id}>
                              {event.title} ({formatDateTime(event.start_at)})
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {conflictResult.suggestions.length > 0 ? (
                      <div>
                        <p className="font-semibold">Suggested slots</p>
                        <div className="mt-1 space-y-2">
                          {conflictResult.suggestions.slice(0, 3).map((suggestion) => (
                            <div
                              key={`${suggestion.start_at}-${suggestion.end_at}`}
                              className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5"
                            >
                              <div>
                                <p>{formatDateTime(suggestion.start_at)} - {formatDateTime(suggestion.end_at)}</p>
                                {suggestion.reason ? (
                                  <p className="text-[11px] text-slate-500">{suggestion.reason}</p>
                                ) : null}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => applySuggestion(suggestion.start_at, suggestion.end_at)}
                              >
                                Use this slot
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            }
            extraFields={
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Invitees (comma separated)
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm"
                  value={inviteesInput}
                  onChange={(event) => setInviteesInput(event.target.value)}
                  placeholder="alice@company.com, bob@company.com"
                />
              </div>
            }
          />
        </ScrollArea>
        <DialogFooter className="mt-2">
          <Button
            onClick={form.handleSubmit(handleSubmit)}
            className="cursor-pointer"
            disabled={isSubmitting}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Saving' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
