"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import {
  EventCalendarApiProvider,
  type CalendarDialogValues
} from "@/components/event-calendar/event-calendar-api-context";
import { EventCalendar } from "@/components/event-calendar/event-calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useEventCalendarStore } from "@/hooks/use-event";
import { apiRequest } from "@/lib/api/client";
import { TablePagination, paginateItems, getTotalPages } from "@/components/table-pagination";
import type {
  EventDescriptionResponse,
  EventDraft,
  EventInviteOut,
  EventOut,
  MeResponse,
  SuggestAlternativesResponse
} from "@/lib/api/types";
import type { Events as ExternalCalendarEvent } from "@/types/event";
import { formatDateTime, parseEmailList } from "@/lib/utils";

type EventsV2ExternalProps = {
  token: string;
  workspaceId: number;
  me: MeResponse;
};

type EventUpdatePayload = Partial<EventOut> & { invitees?: string[] };

function statusColor(status: EventOut["status"]): string {
  if (status === "attending") return "green";
  if (status === "maybe") return "yellow";
  if (status === "declined") return "pink";
  return "blue";
}

function toLocalDateTimeValue(date: Date, time: string): string {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  const normalized = new Date(date);
  normalized.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return `${format(normalized, "yyyy-MM-dd")}T${time}:00`;
}

function toDialogValueDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

export function EventsV2ExternalModule({ token, workspaceId, me }: EventsV2ExternalProps): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [isDraftDialogOpen, setIsDraftDialogOpen] = useState(false);
  const [isEventOpsDialogOpen, setIsEventOpsDialogOpen] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteResponseLabel, setInviteResponseLabel] = useState("");
  const [inviteResponseStatus, setInviteResponseStatus] = useState<EventOut["status"]>("attending");
  const [invitesPage, setInvitesPage] = useState(1);
  const [invitesPageSize, setInvitesPageSize] = useState(5);

  const [nlPrompt, setNlPrompt] = useState("standup tomorrow 12pm invite wael@gmail.com");
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [draftInvitees, setDraftInvitees] = useState("");

  const calendarSelectedEventId = useEventCalendarStore((state) => state.selectedEvent?.id ?? null);

  const eventsQuery = useQuery({
    queryKey: ["events", workspaceId],
    queryFn: () =>
      apiRequest<EventOut[]>("/events", {
        token,
        workspaceId
      }),
    refetchInterval: 15_000
  });

  const events = eventsQuery.data ?? [];

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  useEffect(() => {
    if (!events.length) {
      setSelectedEventId(null);
      return;
    }
    if (selectedEventId && events.some((event) => event.id === selectedEventId)) return;
    setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!calendarSelectedEventId) return;
    const nextId = Number(calendarSelectedEventId);
    if (!Number.isFinite(nextId)) return;
    setSelectedEventId(nextId);
  }, [calendarSelectedEventId]);

  const invitesQuery = useQuery({
    queryKey: ["event-invites", workspaceId, selectedEventId],
    queryFn: () =>
      apiRequest<EventInviteOut[]>(`/events/${selectedEventId}/invites`, {
        token,
        workspaceId
      }),
    enabled: Boolean(selectedEventId),
    refetchInterval: selectedEventId ? 15_000 : false
  });
  const invites = invitesQuery.data ?? [];
  const paginatedInvites = useMemo(
    () => paginateItems(invites, invitesPage, invitesPageSize),
    [invites, invitesPage, invitesPageSize]
  );
  const totalInvitePages = getTotalPages(invites.length, invitesPageSize);

  useEffect(() => {
    if (invitesPage > totalInvitePages) {
      setInvitesPage(totalInvitePages);
    }
  }, [invitesPage, totalInvitePages]);

  useEffect(() => {
    setInvitesPage(1);
  }, [selectedEventId]);

  const actionableInvites = useMemo(() => {
    const invites = invitesQuery.data ?? [];
    return invites.filter(
      (invite) => invite.invited_user_email === me.email || invite.invited_user_id === me.id
    );
  }, [invitesQuery.data, me.email, me.id]);

  useEffect(() => {
    if (!actionableInvites.length) {
      setInviteResponseLabel("");
      return;
    }
    if (inviteResponseLabel && actionableInvites.some((invite) => String(invite.id) === inviteResponseLabel)) {
      return;
    }
    setInviteResponseLabel(String(actionableInvites[0].id));
  }, [actionableInvites, inviteResponseLabel]);

  const createEventMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest<EventOut>("/events", {
        method: "POST",
        token,
        workspaceId,
        body: payload
      }),
    onSuccess: async (event) => {
      setSelectedEventId(event.id);
      await queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId] });
    }
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ eventId, payload }: { eventId: number; payload: EventUpdatePayload }) =>
      apiRequest<EventOut>(`/events/${eventId}`, {
        method: "PATCH",
        token,
        workspaceId,
        body: payload
      }),
    onSuccess: async (event) => {
      setSelectedEventId(event.id);
      await queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId, event.id] });
    }
  });

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: number) =>
      apiRequest<{ message: string }>(`/events/${eventId}`, {
        method: "DELETE",
        token,
        workspaceId
      }),
    onSuccess: async (_, eventId) => {
      if (selectedEventId === eventId) {
        setSelectedEventId(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId] });
    }
  });

  const sendInvite = useMutation({
    mutationFn: () =>
      apiRequest<EventInviteOut>(`/events/${selectedEventId}/invite`, {
        method: "POST",
        token,
        workspaceId,
        body: { email: inviteEmail }
      }),
    onSuccess: async () => {
      toast.success("Invite sent");
      setInviteEmail("");
      await queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId, selectedEventId] });
      await queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to send invite")
  });

  const respondInvite = useMutation({
    mutationFn: () =>
      apiRequest<EventInviteOut>("/events/invites/respond", {
        method: "POST",
        token,
        workspaceId,
        body: {
          invite_id: Number(inviteResponseLabel),
          status: inviteResponseStatus
        }
      }),
    onSuccess: async () => {
      toast.success("Response saved");
      await queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId, selectedEventId] });
      await queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to respond")
  });

  const generateDraft = useMutation({
    mutationFn: () =>
      apiRequest<EventDraft>("/events/nl-create", {
        method: "POST",
        token,
        workspaceId,
        body: { prompt: nlPrompt }
      }),
    onSuccess: (response) => {
      setDraft(response);
      setDraftInvitees(response.invitees.join(","));
      toast.success("Draft generated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to parse prompt")
  });

  async function onCreateDraftEvent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!draft) return;

    try {
      await createEventMutation.mutateAsync({
        title: draft.title,
        start_at: draft.start_at,
        end_at: draft.end_at,
        location: draft.location || "",
        description: draft.description || "",
        status: "upcoming",
        invitees: parseEmailList(draftInvitees)
      });
      setDraft(null);
      setDraftInvitees("");
      setIsDraftDialogOpen(false);
      toast.success("Draft event created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create event from draft");
    }
  }

  const calendarApi = useMemo(
    () => ({
      createEvent: async (values: CalendarDialogValues) => {
        const title = values.title.trim();
        if (!title) {
          throw new Error("Event title is required");
        }

        await createEventMutation.mutateAsync({
          title,
          start_at: toLocalDateTimeValue(values.startDate, values.startTime),
          end_at: toLocalDateTimeValue(values.endDate, values.endTime),
          location: values.location,
          description: values.description,
          status: "upcoming",
          invitees: values.invitees ?? []
        });
      },
      updateEvent: async (eventId: string, values: CalendarDialogValues) => {
        const parsedId = Number(eventId);
        if (!Number.isFinite(parsedId)) {
          throw new Error("Invalid event id");
        }

        await updateEventMutation.mutateAsync({
          eventId: parsedId,
          payload: {
            title: values.title.trim(),
            start_at: toLocalDateTimeValue(values.startDate, values.startTime),
            end_at: toLocalDateTimeValue(values.endDate, values.endTime),
            location: values.location,
            description: values.description,
            invitees: values.invitees ?? []
          }
        });
      },
      deleteEvent: async (eventId: string) => {
        const parsedId = Number(eventId);
        if (!Number.isFinite(parsedId)) {
          throw new Error("Invalid event id");
        }

        await deleteEventMutation.mutateAsync(parsedId);
      },
      getEventInvitees: async (eventId: string) => {
        const parsedId = Number(eventId);
        if (!Number.isFinite(parsedId)) {
          return [];
        }
        const response = await apiRequest<EventInviteOut[]>(`/events/${parsedId}/invites`, {
          token,
          workspaceId
        });
        return response.map((invite) => invite.invited_user_email);
      },
      generateDescription: async (values: CalendarDialogValues, hint?: string) => {
        const response = await apiRequest<EventDescriptionResponse>("/events/generate-description", {
          method: "POST",
          token,
          workspaceId,
          body: {
            title: values.title.trim() || "New Event",
            start_at: toLocalDateTimeValue(values.startDate, values.startTime),
            end_at: toLocalDateTimeValue(values.endDate, values.endTime),
            location: values.location,
            description: hint?.trim() || values.description || ""
          }
        });

        return response.description;
      },
      checkConflicts: async (values: CalendarDialogValues) => {
        return apiRequest<SuggestAlternativesResponse>("/events/suggest-alternatives", {
          method: "POST",
          token,
          workspaceId,
          body: {
            start_at: toLocalDateTimeValue(values.startDate, values.startTime),
            end_at: toLocalDateTimeValue(values.endDate, values.endTime)
          }
        });
      }
    }),
    [createEventMutation, deleteEventMutation, token, updateEventMutation, workspaceId]
  );

  const mappedEvents = useMemo<ExternalCalendarEvent[]>(
    () =>
      events.map((event) => {
        const start = toDialogValueDate(event.start_at);
        const end = toDialogValueDate(event.end_at);
        return {
          id: String(event.id),
          title: event.title,
          description: event.description || "",
          startDate: start,
          endDate: end,
          startTime: format(start, "HH:mm"),
          endTime: format(end, "HH:mm"),
          isRepeating: false,
          repeatingType: null,
          location: event.location || "",
          category: "operations",
          color: statusColor(event.status),
          createdAt: start,
          updatedAt: end
        };
      }),
    [events]
  );

  return (
    <div className="space-y-4">
      <section className="panel p-4 md:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Events Planner</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Calendar wired to backend</h3>
          <p className="text-sm text-slate-500">
            Use package search from the calendar toolbar. Add Event, Create with AI, Event Ops, and Refresh are available together in the action row.
          </p>
        </div>
      </section>

      <section className="panel p-3">
        <EventCalendarApiProvider value={calendarApi}>
          <EventCalendar
            events={mappedEvents}
            initialDate={new Date()}
            toolbarActions={
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => eventsQuery.refetch()}
                  disabled={eventsQuery.isFetching}
                >
                  {eventsQuery.isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </button>
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setIsDraftDialogOpen(true)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Create with AI
                </button>
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => setIsEventOpsDialogOpen(true)}
                  disabled={events.length === 0}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Event Ops
                </button>
              </div>
            }
          />
        </EventCalendarApiProvider>
      </section>

      <Dialog open={isDraftDialogOpen} onOpenChange={setIsDraftDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Event With AI</DialogTitle>
            <DialogDescription>Create an event draft from natural language and save it directly.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <textarea
              className="h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={nlPrompt}
              onChange={(event) => setNlPrompt(event.target.value)}
              placeholder="i have a standup meeting tomorrow at 12pm with wael@gmail.com"
            />
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => generateDraft.mutate()}
              disabled={generateDraft.isPending || !nlPrompt.trim()}
            >
              {generateDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate draft
            </button>

            {draft ? (
              <form className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={onCreateDraftEvent}>
                <p className="text-sm font-semibold text-slate-900">{draft.title}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(draft.start_at)} - {formatDateTime(draft.end_at)}
                </p>
                <label className="block text-sm text-slate-700">
                  Invitees
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                    value={draftInvitees}
                    onChange={(event) => setDraftInvitees(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  disabled={createEventMutation.isPending}
                >
                  {createEventMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CalendarClock className="h-3.5 w-3.5" />
                  )}
                  Create from draft
                </button>
              </form>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEventOpsDialogOpen} onOpenChange={setIsEventOpsDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Event Operations</DialogTitle>
            <DialogDescription>Manage invitees and responses for the selected event.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <label className="block text-sm text-slate-700">
              Active event
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={selectedEventId ?? ""}
                onChange={(event) => setSelectedEventId(Number(event.target.value))}
                disabled={events.length === 0}
              >
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} | {formatDateTime(event.start_at)}
                  </option>
                ))}
              </select>
            </label>

            {!selectedEvent ? (
              <p className="text-sm text-slate-500">No event selected.</p>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">{selectedEvent.title}</p>
                  <p>{formatDateTime(selectedEvent.start_at)} - {formatDateTime(selectedEvent.end_at)}</p>
                  <p>{selectedEvent.location || "No location"}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    Status: {selectedEvent.status}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invite people</p>
                  <div className="flex gap-2">
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="invitee@email.com"
                    />
                    <button
                      className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      disabled={!inviteEmail.trim() || sendInvite.isPending || !selectedEvent}
                      onClick={() => sendInvite.mutate()}
                    >
                      {sendInvite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Invitee</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedInvites.map((invite) => (
                        <tr key={invite.id}>
                          <td className="px-3 py-2 text-slate-700">{invite.invited_user_email}</td>
                          <td className="px-3 py-2 text-slate-600">{invite.status}</td>
                        </tr>
                      ))}
                      {invites.length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-slate-500" colSpan={2}>
                            No invites yet
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  totalItems={invites.length}
                  currentPage={invitesPage}
                  pageSize={invitesPageSize}
                  onPageChange={setInvitesPage}
                  onPageSizeChange={(size) => {
                    setInvitesPageSize(size);
                    setInvitesPage(1);
                  }}
                  itemLabel="invites"
                />

                {actionableInvites.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Respond to your invite</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        value={inviteResponseLabel}
                        onChange={(event) => setInviteResponseLabel(event.target.value)}
                      >
                        {actionableInvites.map((invite) => (
                          <option key={invite.id} value={invite.id}>
                            {invite.invited_user_email} ({invite.status})
                          </option>
                        ))}
                      </select>

                      <select
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        value={inviteResponseStatus}
                        onChange={(event) => setInviteResponseStatus(event.target.value as EventOut["status"])}
                      >
                        <option value="attending">attending</option>
                        <option value="maybe">maybe</option>
                        <option value="declined">declined</option>
                      </select>
                    </div>

                    <button
                      className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={!inviteResponseLabel || respondInvite.isPending}
                      onClick={() => respondInvite.mutate()}
                    >
                      {respondInvite.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save response"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
