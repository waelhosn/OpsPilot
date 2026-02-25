"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SuggestAlternativesResponse } from "@/lib/api/types";

export type CalendarDialogValues = {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  startTime: string;
  endTime: string;
  location: string;
  category: string;
  color: string;
  isRepeating?: boolean;
  repeatingType?: "daily" | "weekly" | "monthly";
  invitees?: string[];
};

type EventCalendarApiAdapter = {
  createEvent: (values: CalendarDialogValues) => Promise<void>;
  updateEvent: (eventId: string, values: CalendarDialogValues) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  getEventInvitees?: (eventId: string) => Promise<string[]>;
  generateDescription?: (values: CalendarDialogValues, hint?: string) => Promise<string>;
  checkConflicts?: (values: CalendarDialogValues) => Promise<SuggestAlternativesResponse>;
};

const EventCalendarApiContext = createContext<EventCalendarApiAdapter | null>(null);

export function EventCalendarApiProvider({
  value,
  children
}: {
  value: EventCalendarApiAdapter;
  children: ReactNode;
}): JSX.Element {
  return <EventCalendarApiContext.Provider value={value}>{children}</EventCalendarApiContext.Provider>;
}

export function useEventCalendarApi(): EventCalendarApiAdapter | null {
  return useContext(EventCalendarApiContext);
}
