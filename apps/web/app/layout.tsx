import type { Metadata } from "next";

import { NuqsAdapter } from "@/components/event-calendar/nuqs-adapter";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "OpsPilot Workspace",
  description: "Production UX dashboard for inventory and events"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <NuqsAdapter>{children}</NuqsAdapter>
        </Providers>
      </body>
    </html>
  );
}
