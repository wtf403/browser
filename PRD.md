 Plan: Remove All Paid/Pro Features from Donut Browser

     Context

     Donut Browser is currently licensed under AGPL-3.0 but contains multiple paid/pro features that restrict functionality behind cloud subscriptions and commercial licensing. The user wants to strip out ALL paid components to create a fully free and open-source version without any subscription gates or commercial restrictions.

     Based on code analysis, the paid features are enforced through:
     1. Cloud authentication system - Checks subscription status against donutbrowser.com API
     2. Commercial trial system - 14-day trial for commercial use with expiration gates
     3. Profile limit enforcement - Restricts number of profiles for cloud users
     4. Feature gates - ~43 checks for has_active_paid_subscription() across the codebase
     5. MCP server restrictions - Browser automation and fingerprinting require paid subscription
     6. Sync limitations - Profile limits enforced in sync service
     7. Wayfern token system - Cross-OS fingerprinting requires paid subscription

     Critical Files to Modify

     Backend (Rust - src-tauri/src/)

     Remove entirely:
     - commercial_license.rs - 14-day trial system
     - cloud_auth.rs - Cloud authentication and subscription checking
     - team_lock.rs - Team profile locking (requires paid subscription)

     Modify to remove restrictions:
     - lib.rs - Remove commercial_license module, cloud auth Tauri commands
     - mcp_server.rs - Remove require_paid_subscription() calls (~26 instances)
     - api_server.rs - Remove subscription checks (~4 instances)
     - wayfern_manager.rs - Remove wayfern token/paid subscription checks
     - profile_importer.rs - Remove "requires Pro subscription" error for OS spoofing
     - sync/engine.rs - Remove profile limit enforcement
     - sync/subscription_manager.rs - Remove or stub subscription handling
     - settings_manager.rs - Remove first_launch_timestamp, commercial_trial_acknowledged fields
     - browser_runner.rs - Remove sync scheduler that checks paid subscription

     Sync Server (donut-sync/)

     Modify:
     - src/auth/user-context.interface.ts - Remove profileLimit, teamProfileLimit
     - src/auth/auth.guard.ts - Always set limits to 0 (unlimited)
     - src/sync/sync.service.ts - Remove checkProfileLimit(), cleanupExcessProfiles()
     - src/sync/internal.controller.ts - Remove /cleanup-excess-profiles endpoint

     Frontend (src/)

     Remove entirely:
     - components/commercial-trial-modal.tsx - Trial expiration modal
     - hooks/use-commercial-trial.ts - Trial status hook

     Modify:
     - app/page.tsx - Remove commercial trial modal, trial status checks
     - components/account-page.tsx - Remove cloud auth UI elements
     - components/settings-dialog.tsx - Remove commercial trial status display
     - components/sync-config-dialog.tsx - Remove profile limit display
     - components/welcome-dialog.tsx - Remove commercial/trial badge
     - types.ts - Remove CloudUser, CloudAuthState types
     - Translation files (all 9 locales) - Remove commercialTrial.*, account.* cloud-related keys

     Configuration Files

     Modify:
     - src-tauri/Cargo.toml - Review if any dependencies are exclusively for paid features
     - src-tauri/tauri.conf.json - Remove cloud auth Tauri commands if listed

     Implementation Approach

     Phase 1: Remove Cloud Authentication System

     1. Delete src-tauri/src/cloud_auth.rs entirely
     2. Remove all Tauri commands related to cloud auth from lib.rs:
       - cloud_device_login_start
       - cloud_device_login_poll
       - cloud_logout
       - get_cloud_user
       - refresh_cloud_profile
       - request_sync_token
       - create_cloud_location_proxy
       - get_cloud_locations
       - has_active_paid_subscription
     3. Remove cloud_auth module import and usage throughout codebase
     4. Remove CLOUD_AUTH static references

     Phase 2: Remove Commercial Trial System

     1. Delete src-tauri/src/commercial_license.rs entirely
     2. Remove Tauri commands from lib.rs:
       - get_commercial_trial_status
       - acknowledge_trial_expiration
       - has_acknowledged_trial_expiration
     3. Remove commercial_license module import
     4. Delete frontend components:
       - src/components/commercial-trial-modal.tsx
       - src/hooks/use-commercial-trial.ts
     5. Remove trial UI from app/page.tsx, settings-dialog.tsx, welcome-dialog.tsx

     Phase 3: Remove MCP Server Paid Gates

     1. In src-tauri/src/mcp_server.rs:
       - Delete require_paid_subscription() function
       - Remove ALL calls to require_paid_subscription() (~26 calls)
       - Remove ALL inline has_active_paid_subscription() checks (~7 checks)
       - Remove "requires Pro subscription" from tool descriptions
     2. Tools to unlock:
       - Browser automation (launch_profile, kill_profile)
       - Fingerprint management (get_fingerprint, update_fingerprint)
       - Extension management (list, create, delete, assign groups)
       - Synchronizer (real-time profile mirroring)
       - All browser interaction tools (10+ tools)

     Phase 4: Remove Team Lock System

     1. Delete src-tauri/src/team_lock.rs entirely
     2. Remove team lock acquisition/release calls from profile management
     3. Remove team-related checks and infrastructure

     Phase 5: Remove Profile Limits from Sync

     1. In donut-sync/src/sync/sync.service.ts:
       - Remove checkProfileLimit() method
       - Remove cleanupExcessProfiles() method
       - Remove profile limit checks from upload/batch operations
     2. In donut-sync/src/sync/internal.controller.ts:
       - Delete /cleanup-excess-profiles endpoint
     3. In donut-sync/src/auth/auth.guard.ts:
       - Always set profileLimit: 0 and teamProfileLimit: 0 (unlimited)
     4. In donut-sync/src/auth/user-context.interface.ts:
       - Keep fields but document as always 0 (unlimited)

     Phase 6: Remove Wayfern Token Restrictions

     1. In src-tauri/src/wayfern_manager.rs:
       - Remove wayfern token request code
       - Remove paid subscription checks for token
       - Allow Wayfern to launch without token (may reduce fingerprinting features)
     2. In src-tauri/src/profile_importer.rs:
       - Remove "requires Pro subscription" error for fingerprint OS spoofing
       - Allow all OS spoofing options

     Phase 7: Remove API Server Restrictions

     1. In src-tauri/src/api_server.rs:
       - Remove 4 instances of has_active_paid_subscription() checks
       - Unlock all REST API endpoints

     Phase 8: Clean Up Frontend

     1. Remove cloud auth UI:
       - Remove cloud login/logout flows from account page
       - Remove subscription status displays
       - Remove profile limit indicators
     2. Update types:
       - Remove CloudUser, CloudAuthState, ProfileLockInfo from types.ts
       - Remove cloud-related interfaces
     3. Remove hooks:
       - Delete use-cloud-auth.tsx (if exists)
       - Delete use-commercial-trial.ts

     Phase 9: Update Translations

     1. Create a Python script to remove keys from all 9 locale files:
       - commercialTrial.* (title, description, body, understandButton, failed, tryAgain)
       - account.* cloud-related keys (logged in, plan, subscription status)
       - settings.commercial.* (trial status displays)
       - welcome.license.commercialTitle, welcome.license.trialBadge, welcome.license.commercialDesc
     2. Run script to update all locales in parallel

     Phase 10: Update Settings Schema

     1. In src-tauri/src/settings_manager.rs:
       - Remove first_launch_timestamp: Option<u64> field
       - Remove commercial_trial_acknowledged: bool field
       - Keep other settings intact

     Phase 11: Remove Sync Scheduler Check

     1. In src-tauri/src/lib.rs setup code:
       - Remove conditional sync scheduler start based on has_active_paid_subscription()
       - Always start sync if configured (no subscription check)

     Verification Plan

     After all changes:

     1. Build verification:
     cd src-tauri
     cargo build --release
     cd ..
     pnpm install
     pnpm build
     2. Lint and format:
     pnpm format
     pnpm lint
     pnpm test 2>&1 | grep -E "test result|panicked|FAILED"
     3. Functional testing:
       - Launch the app and verify no trial/subscription dialogs appear
       - Test profile creation (no limits)
       - Test MCP server tools (no subscription gates)
       - Test sync with self-hosted server (no limits)
       - Test browser automation features
       - Test fingerprint editing
       - Test extension management
       - Verify Wayfern launches without token
     4. Code verification:
     # Should return 0 results:
     grep -r "has_active_paid_subscription" src-tauri/src/
     grep -r "require_paid_subscription" src-tauri/src/
     grep -r "commercial_license" src-tauri/src/
     grep -r "cloud_auth" src-tauri/src/
     grep -r "CLOUD_AUTH" src-tauri/src/
     grep -r "profileLimit" src/
     grep -r "commercialTrial" src/
     5. Documentation:
       - Update README.md to reflect that all features are free
       - Update CLAUDE.md to remove paid feature references
       - Add note about self-hosting being fully featured
