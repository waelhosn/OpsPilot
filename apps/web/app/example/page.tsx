import { EventCalendar } from "@/components/event-calendar/event-calendar";
import { SearchParams } from "nuqs";
import { searchParamsCache } from "@/lib/searchParams";
import { Suspense } from "react";
import { Events } from "@/types/event";
import Link from "next/link";

const dummyEvents: Events[] = [
    {
        id: "1",
        title: "Team Standup Harian",
        description: "Sinkronisasi harian untuk membahas progres dan hambatan.",
        startDate: new Date(),
        endDate: new Date(),
        startTime: "09:00",
        endTime: "09:30",
        isRepeating: true,
        repeatingType: "daily",
        location: "Virtual - Google Meet",
        category: "Pekerjaan",
        color: "red",
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: "2",
        title: "Deadline Proyek Alpha",
        description: "Pengumpulan akhir untuk Proyek Alpha.",
        startDate: new Date(new Date().setDate(new Date().getDate() + 2)),
        endDate: new Date(new Date().setDate(new Date().getDate() + 2)),
        startTime: "17:00",
        endTime: "17:30",
        isRepeating: false,
        repeatingType: null,
        location: "Platform Manajemen Proyek",
        category: "Proyek",
        color: "blue",
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: "3",
        title: "Review Mingguan",
        description: "Review minggu lalu dan perencanaan untuk minggu depan.",
        startDate: new Date(
            new Date().setDate(new Date().getDate() - new Date().getDay() + 5)
        ),
        endDate: new Date(
            new Date().setDate(new Date().getDate() - new Date().getDay() + 5)
        ),
        startTime: "15:00",
        endTime: "16:00",
        isRepeating: true,
        repeatingType: "weekly",
        location: "Ruang Konferensi B",
        category: "Pekerjaan",
        color: "yellow",
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: "4",
        title: "Janji Temu Dokter Gigi",
        description: "Pemeriksaan tahunan.",
        startDate: new Date(new Date().setDate(new Date().getDate() + 10)),
        endDate: new Date(new Date().setDate(new Date().getDate() + 10)),
        startTime: "11:00",
        endTime: "12:00",
        isRepeating: false,
        repeatingType: null,
        location: "Klinik Gigi Kota",
        category: "Pribadi",
        color: "purple",
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

interface DemoPageProps {
    searchParams: Promise<SearchParams>;
}

export default async function ExamplePage(props: DemoPageProps) {
    const searchParams = await props.searchParams;
    const search = searchParamsCache.parse(searchParams);

    const eventsResponse = {
        events: dummyEvents,
    };

    return (
        <div className='flex min-h-screen flex-col'>
            <header className='bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur'>
                <div className=' w-full mx-auto max-w-screen-2xl px-4 xl:px-6 flex h-16 items-center justify-between'>
                    <div className='flex items-center gap-2'>
                        <span className='text-xl font-semibold tracking-tight'>
                            Example Page
                        </span>
                    </div>
                </div>
            </header>
            <main className='flex-1 py-6'>
                <div className='container'>
                    <div className='bg-card overflow-hidden rounded-xl border shadow-sm'>
                        <Suspense
                            fallback={
                                <div className='flex h-[700px] items-center justify-center'>
                                    <div className='flex flex-col items-center gap-2'>
                                        <div className='border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent'></div>
                                        <p className='text-muted-foreground text-sm'>
                                            Loading calendar...
                                        </p>
                                    </div>
                                </div>
                            }
                        >
                            <EventCalendar
                                events={eventsResponse.events}
                                initialDate={search.date}
                            />
                        </Suspense>
                    </div>
                </div>
            </main>
            <footer className='border-t py-4'>
                <div className='container'>
                    <p className='text-muted-foreground text-center text-sm'>
                        This is a demo page for the calendar component. If
                        you're unsure how to use it,{" "}
                        <a
                            href='https://shadcn-event-calendar.vercel.app/docs/installation'
                            className='text-primary font-medium hover:underline'
                            target='_blank'
                            rel='noopener noreferrer'
                        >
                            check out the documentation
                        </a>
                        .
                    </p>
                </div>
            </footer>
        </div>
    );
}
