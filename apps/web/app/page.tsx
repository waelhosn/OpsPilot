"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-context";

export default function IndexPage(): null {
  const router = useRouter();
  const { token, isHydrating } = useAuth();

  useEffect(() => {
    if (isHydrating) return;
    if (token) {
      router.replace("/app");
    } else {
      router.replace("/login");
    }
  }, [token, isHydrating, router]);

  return null;
}
