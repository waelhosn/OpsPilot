'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { DeleteAlert } from '@/components/event-calendar/ui/delete-alert';
import { FormFooter } from '@/components/event-calendar/ui/form-footer';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ensureDate } from '@/lib/date';
import { useEventCalendarStore } from '@/hooks/use-event';
import { eventFormSchema } from '@/lib/validations';
import { EventDetailsForm } from './event-detail-form';
import { toast } from 'sonner';
import { useShallow } from 'zustand/shallow';
import { getLocaleFromCode } from '@/lib/event';
import { useEventCalendarApi } from './event-calendar-api-context';
import { Button } from '../ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { parseEmailList } from '@/lib/utils';

const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '10:00';
const DEFAULT_COLOR = 'bg-red-600';
const DEFAULT_CATEGORY = 'workshop';

type EventFormValues = z.infer<typeof eventFormSchema>;

const DEFAULT_FORM_VALUES: EventFormValues = {
  title: '',
  description: '',
  startDate: new Date(),
  endDate: new Date(),
  category: DEFAULT_CATEGORY,
  startTime: DEFAULT_START_TIME,
  endTime: DEFAULT_END_TIME,
  location: '',
  color: DEFAULT_COLOR,
};

function useIsMounted() {
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  return isMounted;
}

export default function EventDialog() {
  const {
    locale,
    selectedEvent,
    isDialogOpen,
    closeEventDialog,
  } = useEventCalendarStore(
    useShallow((state) => ({
      locale: state.locale,
      selectedEvent: state.selectedEvent,
      isDialogOpen: state.isDialogOpen,
      closeEventDialog: state.closeEventDialog,
    })),
  );
  const localeObj = getLocaleFromCode(locale);
  const calendarApi = useEventCalendarApi();

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isLoadingInvitees, setIsLoadingInvitees] = useState(false);
  const [descriptionHint, setDescriptionHint] = useState('');
  const [inviteesInput, setInviteesInput] = useState('');
  const isMounted = useIsMounted();

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: 'onChange',
  });

  useEffect(() => {
    if (selectedEvent) {
      try {
        const startDate = ensureDate(selectedEvent.startDate);
        const endDate = ensureDate(selectedEvent.endDate);

        form.reset({
          title: selectedEvent.title || '',
          description: selectedEvent.description || '',
          startDate,
          endDate,
          category: selectedEvent.category || DEFAULT_CATEGORY,
          startTime: selectedEvent.startTime || DEFAULT_START_TIME,
          endTime: selectedEvent.endTime || DEFAULT_END_TIME,
          location: selectedEvent.location || '',
          color: selectedEvent.color,
        });
      } catch (error) {
        console.error('Error resetting form with event data:', error);
      }
    }
  }, [selectedEvent, form]);

  useEffect(() => {
    setDescriptionHint('');
    setInviteesInput('');
  }, [selectedEvent?.id]);

  useEffect(() => {
    let active = true;
    async function loadInvitees() {
      if (!selectedEvent?.id || !calendarApi?.getEventInvitees) return;
      setIsLoadingInvitees(true);
      try {
        const invitees = await calendarApi.getEventInvitees(selectedEvent.id);
        if (active) {
          setInviteesInput(invitees.join(', '));
        }
      } catch {
        if (active) {
          setInviteesInput('');
        }
      } finally {
        if (active) {
          setIsLoadingInvitees(false);
        }
      }
    }
    loadInvitees();
    return () => {
      active = false;
    };
  }, [selectedEvent?.id, calendarApi]);

  const handleUpdate = async (values: EventFormValues) => {
    if (!selectedEvent?.id) return;

    if (!calendarApi) {
      toast.success('DEMO: Update event UI triggered', {
        description:
          'Override this handler with your actual update logic. Requires connection to your data source.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await calendarApi.updateEvent(selectedEvent.id, {
        ...values,
        invitees: parseEmailList(inviteesInput),
      });
      toast.success('Event updated');
      closeEventDialog();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update event';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent?.id) return;

    if (!calendarApi) {
      toast.success('DEMO: Delete event UI triggered', {
        description:
          'Replace this placeholder with real deletion logic. Ensure proper data persistence.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await calendarApi.deleteEvent(selectedEvent.id);
      toast.success('Event deleted');
      closeEventDialog();
      setIsDeleteAlertOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete event';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  if (!isMounted) return null;

  return (
    <Dialog open={isDialogOpen} onOpenChange={closeEventDialog} modal={false}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Event Details</DialogTitle>
          <DialogDescription>
            Event details {selectedEvent?.title}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[350px] w-full sm:h-[500px]">
          <EventDetailsForm
            form={form}
            onSubmit={handleUpdate}
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
                {isLoadingInvitees ? (
                  <p className="text-xs text-slate-500">Loading current invitees...</p>
                ) : null}
              </div>
            }
          />
        </ScrollArea>
        <DialogFooter className="mt-2 flex flex-row">
          <DeleteAlert
            isOpen={isDeleteAlertOpen}
            onOpenChange={setIsDeleteAlertOpen}
            onConfirm={handleDeleteEvent}
          />
          <FormFooter
            onCancel={closeEventDialog}
            onSave={form.handleSubmit(handleUpdate)}
            isSubmitting={isSubmitting}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
