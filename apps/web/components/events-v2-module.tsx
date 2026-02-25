"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { format } from "date-fns";
import { CalendarClock, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
import { cn, formatDateTime, parseEmailList } from "@/lib/utils";

type EventsV2Props = {
  token: string;
  workspaceId: number;
  me: MeResponse;
};

type EventFormState = {
  title: string;
  date: string;
  start: string;
  end: string;
  location: string;
  description: string;
  status: EventOut["status"];
};

export function EventsV2Module({ token, workspaceId, me }: EventsV2Props): JSX.Element {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [calendarMode, setCalendarMode] = useState<"dayGridMonth" | "timeGridWeek" | "timeGridDay">("timeGridWeek");
  const [calendarDensity, setCalendarDensity] = useState<"compact" | "comfortable">("compact");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedEventDraftId, setSelectedEventDraftId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(true);

  const [createInvitees, setCreateInvitees] = useState("");
  const [createDescriptionHint, setCreateDescriptionHint] = useState("");
  const [createForm, setCreateForm] = useState<EventFormState>({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start: "09:00",
    end: "10:00",
    location: "",
    description: "",
    status: "upcoming"
  });

  const [nlPrompt, setNlPrompt] = useState("standup tomorrow 12pm invite wael@gmail.com");
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [draftInvitees, setDraftInvitees] = useState("");

  const [selectedEventDraft, setSelectedEventDraft] = useState<EventFormState>({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    start: "09:00",
    end: "10:00",
    location: "",
    description: "",
    status: "upcoming"
  });
  const [selectedDescriptionHint, setSelectedDescriptionHint] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteResponseLabel, setInviteResponseLabel] = useState("");
  const [inviteResponseStatus, setInviteResponseStatus] = useState<EventOut["status"]>("attending");
  const [invitesPage, setInvitesPage] = useState(1);
  const [invitesPageSize, setInvitesPageSize] = useState(5);

  const [conflictDate, setConflictDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [conflictStart, setConflictStart] = useState("09:00");
  const [conflictEnd, setConflictEnd] = useState("10:00");
  const [conflictResult, setConflictResult] = useState<SuggestAlternativesResponse | null>(null);

  const eventsQuery = useQuery({
    queryKey: ["events", workspaceId, query],
    queryFn: () =>
      apiRequest<EventOut[]>("/events", {
        token,
        workspaceId,
        params: { query }
      }),
    refetchInterval: 15_000
  });

  const events = eventsQuery.data ?? [];

  useEffect(() => {
    if (!events.length) {
      setSelectedEventId(null);
      setSelectedEventDraftId(null);
      return;
    }
    if (selectedEventId && events.some((event) => event.id === selectedEventId)) return;
    setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;

  useEffect(() => {
    if (!selectedEvent) return;
    if (selectedEventDraftId === selectedEvent.id) return;
    setSelectedEventDraftId(selectedEvent.id);
    setSelectedEventDraft({
      title: selectedEvent.title,
      date: format(new Date(selectedEvent.start_at), "yyyy-MM-dd"),
      start: format(new Date(selectedEvent.start_at), "HH:mm"),
      end: format(new Date(selectedEvent.end_at), "HH:mm"),
      location: selectedEvent.location ?? "",
      description: selectedEvent.description ?? "",
      status: selectedEvent.status
    });
    setConflictDate(format(new Date(selectedEvent.start_at), "yyyy-MM-dd"));
    setConflictStart(format(new Date(selectedEvent.start_at), "HH:mm"));
    setConflictEnd(format(new Date(selectedEvent.end_at), "HH:mm"));
  }, [selectedEvent, selectedEventDraftId]);

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
    if (inviteResponseLabel && actionableInvites.some((invite) => String(invite.id) === inviteResponseLabel)) return;
    setInviteResponseLabel(String(actionableInvites[0].id));
  }, [actionableInvites, inviteResponseLabel]);

  const createEvent = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest<EventOut>("/events", {
        method: "POST",
        token,
        workspaceId,
        body: payload
      }),
    onSuccess: (event) => {
      toast.success("Event created");
      queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
      setSelectedEventId(event.id);
      setSelectedEventDraftId(null);
      setIsCreateOpen(false);
      setCreateForm((prev) => ({ ...prev, title: "", location: "", description: "" }));
      setCreateInvitees("");
      setCreateDescriptionHint("");
      setDraft(null);
      setDraftInvitees("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create event")
  });

  const updateEvent = useMutation({
    mutationFn: (payload: Partial<EventOut>) =>
      apiRequest<EventOut>(`/events/${selectedEventId}`, {
        method: "PATCH",
        token,
        workspaceId,
        body: payload
      }),
    onSuccess: (event) => {
      toast.success("Event updated");
      queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
      setSelectedEventId(event.id);
      setSelectedEventDraftId(event.id);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update event")
  });

  const deleteEvent = useMutation({
    mutationFn: () =>
      apiRequest<{ message: string }>(`/events/${selectedEventId}`, {
        method: "DELETE",
        token,
        workspaceId
      }),
    onSuccess: () => {
      toast.success("Event deleted");
      setSelectedEventId(null);
      setSelectedEventDraftId(null);
      queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId] });
      setConflictResult(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete event")
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

  const sendInvite = useMutation({
    mutationFn: () =>
      apiRequest<EventInviteOut>(`/events/${selectedEventId}/invite`, {
        method: "POST",
        token,
        workspaceId,
        body: { email: inviteEmail }
      }),
    onSuccess: () => {
      toast.success("Invite sent");
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId, selectedEventId] });
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
    onSuccess: () => {
      toast.success("Response saved");
      queryClient.invalidateQueries({ queryKey: ["event-invites", workspaceId, selectedEventId] });
      queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to respond")
  });

  const checkConflicts = useMutation({
    mutationFn: () =>
      apiRequest<SuggestAlternativesResponse>("/events/suggest-alternatives", {
        method: "POST",
        token,
        workspaceId,
        body: {
          start_at: `${conflictDate}T${conflictStart}:00`,
          end_at: `${conflictDate}T${conflictEnd}:00`
        }
      }),
    onSuccess: (response) => {
      setConflictResult(response);
      toast.success("Conflict analysis ready");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Conflict check failed")
  });

  const generateDescription = useMutation({
    mutationFn: async (target: "create" | "selected") => {
      if (target === "create") {
        const response = await apiRequest<EventDescriptionResponse>("/events/generate-description", {
          method: "POST",
          token,
          workspaceId,
          body: {
            title: createForm.title.trim() || "New Event",
            start_at: `${createForm.date}T${createForm.start}:00`,
            end_at: `${createForm.date}T${createForm.end}:00`,
            location: createForm.location,
            description: createDescriptionHint.trim() || createForm.description
          }
        });
        return { target, response };
      }

      if (!selectedEvent) {
        throw new Error("Select an event first");
      }

      const response = await apiRequest<EventDescriptionResponse>("/events/generate-description", {
        method: "POST",
        token,
        workspaceId,
        body: {
          title: selectedEventDraft.title.trim() || selectedEvent.title,
          start_at: `${selectedEventDraft.date}T${selectedEventDraft.start}:00`,
          end_at: `${selectedEventDraft.date}T${selectedEventDraft.end}:00`,
          location: selectedEventDraft.location,
          description: selectedDescriptionHint.trim() || selectedEventDraft.description
        }
      });
      return { target, response };
    },
    onSuccess: ({ target, response }) => {
      const description = response.description.trim();
      if (target === "create") {
        setCreateForm((prev) => ({ ...prev, description }));
      } else {
        setSelectedEventDraft((prev) => ({ ...prev, description }));
      }
      toast.success("Description draft generated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to generate description")
  });

  function onCreateManualEvent(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!createForm.title.trim()) return;
    createEvent.mutate({
      title: createForm.title.trim(),
      start_at: `${createForm.date}T${createForm.start}:00`,
      end_at: `${createForm.date}T${createForm.end}:00`,
      location: createForm.location,
      description: createForm.description,
      status: createForm.status,
      invitees: parseEmailList(createInvitees)
    });
  }

  function onCreateDraftEvent(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!draft) return;
    createEvent.mutate({
      title: draft.title,
      start_at: draft.start_at,
      end_at: draft.end_at,
      location: draft.location || "",
      description: draft.description || "",
      status: "upcoming",
      invitees: parseEmailList(draftInvitees)
    });
  }

  function onUpdateSelectedEvent(): void {
    if (!selectedEvent) return;
    if (!selectedEventDraft.title.trim()) {
      toast.error("Event title is required");
      return;
    }

    updateEvent.mutate({
      title: selectedEventDraft.title.trim(),
      start_at: `${selectedEventDraft.date}T${selectedEventDraft.start}:00`,
      end_at: `${selectedEventDraft.date}T${selectedEventDraft.end}:00`,
      location: selectedEventDraft.location,
      description: selectedEventDraft.description,
      status: selectedEventDraft.status
    });
  }

  const selectedInvitees =
    (invitesQuery.data ?? []).map((invite) => invite.invited_user_email).join(", ") || "No invitees yet";

  return (
    <div className="space-y-4">
      <section className="panel p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Events Planner v2</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Calendar-first scheduling workbench</h3>
            <p className="text-sm text-slate-500">
              Manage events directly from calendar context with inline editing, invites, and AI drafting.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setIsCreateOpen((value) => !value)}
            >
              <CalendarClock className="h-4 w-4" />
              {isCreateOpen ? "Hide create" : "New event"}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={() => eventsQuery.refetch()}
              disabled={eventsQuery.isFetching}
            >
              {eventsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr),180px,160px]">
          <label className="text-sm font-medium text-slate-700">
            Search events
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="standup, planning, demo..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            View
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={calendarMode}
              onChange={(event) => setCalendarMode(event.target.value as typeof calendarMode)}
            >
              <option value="timeGridDay">Day</option>
              <option value="timeGridWeek">Week</option>
              <option value="dayGridMonth">Month</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Density
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              value={calendarDensity}
              onChange={(event) => setCalendarDensity(event.target.value as typeof calendarDensity)}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </label>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),420px]">
        <section
          className={cn(
            "panel overflow-hidden p-3",
            calendarDensity === "compact" ? "calendar-compact" : "calendar-comfortable"
          )}
        >
          <FullCalendar
            key={`${calendarMode}-${calendarDensity}`}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={calendarMode}
            nowIndicator
            height={calendarDensity === "compact" ? 720 : 820}
            displayEventTime={calendarMode !== "dayGridMonth"}
            dayMaxEventRows={calendarDensity === "compact" ? 2 : 4}
            dayMaxEvents={calendarDensity === "compact" ? 2 : 4}
            expandRows={calendarDensity !== "compact"}
            eventTimeFormat={{
              hour: "numeric",
              minute: "2-digit",
              meridiem: "short"
            }}
            events={events.map((event) => ({
              id: String(event.id),
              title: event.title,
              start: event.start_at,
              end: event.end_at,
              color:
                event.status === "attending"
                  ? "#2f855a"
                  : event.status === "maybe"
                    ? "#b7791f"
                    : event.status === "declined"
                      ? "#b83280"
                      : "#24778f"
            }))}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay"
            }}
            eventDidMount={(info) => {
              const eventId = Number(info.event.id);
              const raw = events.find((event) => event.id === eventId);
              if (!raw) return;
              info.el.setAttribute(
                "title",
                `${raw.title} | ${formatDateTime(raw.start_at)} - ${formatDateTime(raw.end_at)} | ${raw.location || "No location"}`
              );
            }}
            eventClick={(clickInfo) => {
              const nextId = Number(clickInfo.event.id);
              if (Number.isFinite(nextId)) {
                setSelectedEventId(nextId);
              }
            }}
            dateClick={(dateInfo) => {
              setCreateForm((prev) => ({
                ...prev,
                date: dateInfo.dateStr.slice(0, 10),
                start: "09:00",
                end: "10:00"
              }));
              setIsCreateOpen(true);
            }}
          />
        </section>

        <div className="space-y-4">
          {isCreateOpen ? (
            <section className="panel p-4">
              <h4 className="text-sm font-semibold text-slate-900">Create Event</h4>
              <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onCreateManualEvent}>
                <label className="text-sm text-slate-700 sm:col-span-2">
                  Title
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={createForm.title}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Date
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={createForm.date}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, date: event.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Status
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={createForm.status}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, status: event.target.value as EventOut["status"] }))
                    }
                  >
                    <option value="upcoming">upcoming</option>
                    <option value="attending">attending</option>
                    <option value="maybe">maybe</option>
                    <option value="declined">declined</option>
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  Start
                  <input
                    type="time"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={createForm.start}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, start: event.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm text-slate-700">
                  End
                  <input
                    type="time"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={createForm.end}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, end: event.target.value }))}
                    required
                  />
                </label>
                <label className="text-sm text-slate-700 sm:col-span-2">
                  Location
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={createForm.location}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, location: event.target.value }))}
                  />
                </label>
                <label className="text-sm text-slate-700 sm:col-span-2">
                  Description
                  <div className="mt-1 grid gap-2 sm:grid-cols-[1fr,auto]">
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      value={createDescriptionHint}
                      onChange={(event) => setCreateDescriptionHint(event.target.value)}
                      placeholder="Optional AI guidance"
                    />
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 disabled:opacity-60"
                      onClick={() => generateDescription.mutate("create")}
                      disabled={generateDescription.isPending}
                    >
                      {generateDescription.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      AI draft
                    </button>
                  </div>
                  <textarea
                    className="mt-2 h-20 w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={createForm.description}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
                <label className="text-sm text-slate-700 sm:col-span-2">
                  Invite emails (comma separated)
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={createInvitees}
                    onChange={(event) => setCreateInvitees(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={createEvent.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white sm:col-span-2 disabled:opacity-60"
                >
                  {createEvent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Create event
                </button>
              </form>
            </section>
          ) : null}

          <section className="panel p-4">
            <h4 className="text-sm font-semibold text-slate-900">Selected Event Workbench</h4>
            {!selectedEvent ? (
              <p className="mt-3 text-sm text-slate-500">Select an event in the calendar to manage it.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedEvent.title} • {formatDateTime(selectedEvent.start_at)}
                </p>
                <p className="text-xs text-slate-500">Invitees: {selectedInvitees}</p>
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onUpdateSelectedEvent();
                  }}
                >
                  <label className="text-sm text-slate-700 sm:col-span-2">
                    Event
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      value={selectedEventId ?? ""}
                      onChange={(event) => setSelectedEventId(Number(event.target.value))}
                    >
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.title} | {formatDateTime(event.start_at)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-slate-700 sm:col-span-2">
                    Title
                    <input
                      value={selectedEventDraft.title}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      onChange={(event) =>
                        setSelectedEventDraft((prev) => ({ ...prev, title: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Date
                    <input
                      type="date"
                      value={selectedEventDraft.date}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      onChange={(event) =>
                        setSelectedEventDraft((prev) => ({ ...prev, date: event.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Status
                    <select
                      value={selectedEventDraft.status}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      onChange={(event) =>
                        setSelectedEventDraft((prev) => ({
                          ...prev,
                          status: event.target.value as EventOut["status"]
                        }))
                      }
                    >
                      <option value="upcoming">upcoming</option>
                      <option value="attending">attending</option>
                      <option value="maybe">maybe</option>
                      <option value="declined">declined</option>
                    </select>
                  </label>
                  <label className="text-sm text-slate-700">
                    Start
                    <input
                      type="time"
                      value={selectedEventDraft.start}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      onChange={(event) =>
                        setSelectedEventDraft((prev) => ({ ...prev, start: event.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    End
                    <input
                      type="time"
                      value={selectedEventDraft.end}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      onChange={(event) =>
                        setSelectedEventDraft((prev) => ({ ...prev, end: event.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm text-slate-700 sm:col-span-2">
                    Location
                    <input
                      value={selectedEventDraft.location}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      onChange={(event) =>
                        setSelectedEventDraft((prev) => ({ ...prev, location: event.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm text-slate-700 sm:col-span-2">
                    Description
                    <div className="mt-1 grid gap-2 sm:grid-cols-[1fr,auto]">
                      <input
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        value={selectedDescriptionHint}
                        onChange={(event) => setSelectedDescriptionHint(event.target.value)}
                        placeholder="Optional AI guidance"
                      />
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 disabled:opacity-60"
                        onClick={() => generateDescription.mutate("selected")}
                        disabled={generateDescription.isPending}
                      >
                        {generateDescription.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        AI draft
                      </button>
                    </div>
                    <textarea
                      value={selectedEventDraft.description}
                      className="mt-2 h-20 w-full rounded-xl border border-slate-300 px-3 py-2"
                      onChange={(event) =>
                        setSelectedEventDraft((prev) => ({ ...prev, description: event.target.value }))
                      }
                    />
                  </label>
                  <div className="flex gap-2 sm:col-span-2">
                    <button
                      type="submit"
                      disabled={updateEvent.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {updateEvent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEvent.mutate()}
                      disabled={deleteEvent.isPending}
                      className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>

          <section className="panel p-4">
            <h4 className="text-sm font-semibold text-slate-900">Invitations</h4>
            <div className="mt-3 flex gap-2">
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
                Invite
              </button>
            </div>

            <div className="mt-3 max-h-40 overflow-auto rounded-xl border border-slate-200">
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
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
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
                  Save response
                </button>
              </div>
            ) : null}
          </section>

          <section className="panel p-4">
            <h4 className="text-sm font-semibold text-slate-900">Conflict + Create With AI</h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={conflictDate}
                onChange={(event) => setConflictDate(event.target.value)}
              />
              <input
                type="time"
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={conflictStart}
                onChange={(event) => setConflictStart(event.target.value)}
              />
              <input
                type="time"
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={conflictEnd}
                onChange={(event) => setConflictEnd(event.target.value)}
              />
            </div>
            <button
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              onClick={() => checkConflicts.mutate()}
              disabled={checkConflicts.isPending}
            >
              {checkConflicts.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Check conflicts
            </button>

            {conflictResult ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                <p>Has conflict: {String(conflictResult.has_conflict)}</p>
                <p>Conflicts: {conflictResult.conflicts.length}</p>
                <p>Alternatives: {conflictResult.suggestions.length}</p>
              </div>
            ) : null}

            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Natural-language draft</p>
              <textarea
                className="mt-2 h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={nlPrompt}
                onChange={(event) => setNlPrompt(event.target.value)}
              />
              <button
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => generateDraft.mutate()}
                disabled={generateDraft.isPending || !nlPrompt.trim()}
              >
                {generateDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Create with AI
              </button>

              {draft ? (
                <form className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={onCreateDraftEvent}>
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
                    disabled={createEvent.isPending}
                  >
                    {createEvent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Create from draft
                  </button>
                </form>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
