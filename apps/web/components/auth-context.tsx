"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api/client";
import type { MeResponse, Role } from "@/lib/api/types";
import {
  clearToken,
  clearWorkspaceId,
  getToken,
  getWorkspaceId,
  setToken as persistToken,
  setWorkspaceId as persistWorkspaceId
} from "@/lib/storage";

type AuthContextValue = {
  token: string | null;
  me: MeResponse | null;
  workspaceId: number | null;
  role: Role | null;
  isHydrating: boolean;
  isLoadingMe: boolean;
  setAuthToken: (token: string) => void;
  logout: () => void;
  setWorkspaceId: (workspaceId: number) => void;
  refreshMe: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const queryClient = useQueryClient();

  const [token, setToken] = useState<string | null>(null);
  const [workspaceId, setWorkspaceIdState] = useState<number | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    setToken(getToken());
    setWorkspaceIdState(getWorkspaceId());
    setIsHydrating(false);
  }, []);

  const meQuery = useQuery({
    queryKey: ["me", token],
    queryFn: async () => apiRequest<MeResponse>("/auth/me", { token }),
    enabled: Boolean(token),
    staleTime: 30_000
  });

  useEffect(() => {
    if (!meQuery.data?.workspaces?.length) return;
    if (workspaceId && meQuery.data.workspaces.some((ws) => ws.workspace_id === workspaceId)) return;

    const nextWorkspace = meQuery.data.workspaces[0].workspace_id;
    setWorkspaceIdState(nextWorkspace);
    persistWorkspaceId(nextWorkspace);
  }, [meQuery.data, workspaceId]);

  const setAuthToken = useCallback(
    (nextToken: string) => {
      setToken(nextToken);
      persistToken(nextToken);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    [queryClient]
  );

  const logout = useCallback(() => {
    setToken(null);
    setWorkspaceIdState(null);
    clearToken();
    clearWorkspaceId();
    queryClient.clear();
  }, [queryClient]);

  const setWorkspaceId = useCallback((nextWorkspaceId: number) => {
    setWorkspaceIdState(nextWorkspaceId);
    persistWorkspaceId(nextWorkspaceId);
  }, []);

  const refreshMe = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["me"] });
  }, [queryClient]);

  const role = useMemo<Role | null>(() => {
    if (!meQuery.data || !workspaceId) return null;
    const membership = meQuery.data.workspaces.find((workspace) => workspace.workspace_id === workspaceId);
    return membership?.role ?? null;
  }, [meQuery.data, workspaceId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      me: meQuery.data ?? null,
      workspaceId,
      role,
      isHydrating,
      isLoadingMe: meQuery.isLoading || meQuery.isFetching,
      setAuthToken,
      logout,
      setWorkspaceId,
      refreshMe
    }),
    [token, meQuery.data, workspaceId, role, isHydrating, meQuery.isLoading, meQuery.isFetching, setAuthToken, logout, setWorkspaceId, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
