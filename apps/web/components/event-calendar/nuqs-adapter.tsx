"use client";

import type { PropsWithChildren } from "react";
import { NuqsAdapter as NextAppNuqsAdapter } from "nuqs/adapters/next/app";

export function NuqsAdapter({ children }: PropsWithChildren): JSX.Element {
  return <NextAppNuqsAdapter>{children}</NextAppNuqsAdapter>;
}
