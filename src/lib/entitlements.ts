import type { CloudUser, Entitlements } from "@/types";

/**
 * All features are free. Returns maximum entitlements regardless of plan.
 */
export function getEntitlements(
  _user: CloudUser | null | undefined,
): Entitlements {
  return {
    active: true,
    browserAutomation: true,
    crossOsFingerprints: true,
    cloudBackup: true,
    teamCollaboration: true,
    profileLimit: 9999,
    requestsPerHour: 9999,
  };
}
