export interface UserContext {
  mode: "self-hosted" | "cloud";
  prefix: string; // '' for self-hosted, 'users/{id}/' for cloud
  teamPrefix: string | null; // 'teams/{id}/' or null
  profileLimit: number; // Always 0 (unlimited) - profile limits removed
  teamProfileLimit: number; // Always 0 (unlimited) - profile limits removed
}
