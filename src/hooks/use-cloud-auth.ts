import type { CloudUser } from "@/types";

interface CloudAuthState {
  user: CloudUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function useCloudAuth(): CloudAuthState {
  return {
    user: null,
    isLoggedIn: false,
    isLoading: false,
    logout: async () => {},
    refreshProfile: async () => {},
  };
}
