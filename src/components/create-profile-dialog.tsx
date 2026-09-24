"use client";

import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { GoPlus } from "react-icons/go";
import { LuCheck, LuChevronsUpDown } from "react-icons/lu";
import { CloakConfigForm } from "@/components/cloak-config-form";
import { LoadingButton } from "@/components/loading-button";
import { ProxyFormDialog } from "@/components/proxy-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrowserDownload } from "@/hooks/use-browser-download";
import { useProxyEvents } from "@/hooks/use-proxy-events";
import { useVpnEvents } from "@/hooks/use-vpn-events";
import { cn } from "@/lib/utils";
import type { BrowserReleaseTypes, CloakConfig } from "@/types";

import { RippleButton } from "./ui/ripple";

type BrowserTypeString = "cloak";

interface CreateProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProfile: (profileData: {
    name: string;
    browserStr: BrowserTypeString;
    version: string;
    releaseType: string;
    proxyId?: string;
    vpnId?: string;
    cloakConfig?: CloakConfig;
    groupId?: string;
    extensionGroupId?: string;
    extensionIds?: string[];
    randomExtension?: boolean;
    ephemeral?: boolean;
    dnsBlocklist?: string;
    launchHook?: string;
    password?: string;
  }) => Promise<void>;
  selectedGroupId?: string;
}

export function CreateProfileDialog({
  isOpen,
  onClose,
  onCreateProfile,
  selectedGroupId,
}: CreateProfileDialogProps) {
  const { t } = useTranslation();
  const proxyListboxIdAntiDetect = useId();
  const [profileName, setProfileName] = useState("");
  const [selectedProxyId, setSelectedProxyId] = useState<string>();
  const [proxyPopoverOpen, setProxyPopoverOpen] = useState(false);
  const [dnsBlocklist, setDnsBlocklist] = useState<string>("");
  const [launchHook, setLaunchHook] = useState("");

  // CloakBrowser anti-detect states
  const [cloakConfig, setCloakConfig] = useState<CloakConfig>({
    geoip: true,
    humanize: true,
  });

  const updateCloakConfig = (key: keyof CloakConfig, value: unknown) => {
    setCloakConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Reset is folded into handleClose (Cloak is the only browser).

  const { storedProxies } = useProxyEvents();
  const { vpnConfigs } = useVpnEvents();
  const [showProxyForm, setShowProxyForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [ephemeral, setEphemeral] = useState(false);
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const PASSWORD_MIN_LEN = 8;
  const [selectedExtensionGroupId, setSelectedExtensionGroupId] =
    useState<string>();
  const [extensionGroups, setExtensionGroups] = useState<
    { id: string; name: string; extension_ids: string[] }[]
  >([]);
  const [allExtensions, setAllExtensions] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedExtensionIds, setSelectedExtensionIds] = useState<string[]>(
    [],
  );
  const [randomExtension, setRandomExtension] = useState(false);
  const [bundledExtensions, setBundledExtensions] = useState<
    {
      canary_id: string;
      name: string;
      version: string;
      builtin: boolean;
      default_checked: boolean;
      installed_id: string | null;
    }[]
  >([]);

  useEffect(() => {
    if (isOpen) {
      void invoke<{ id: string; name: string; extension_ids: string[] }[]>(
        "list_extension_groups",
      )
        .then(setExtensionGroups)
        .catch(() => {
          setExtensionGroups([]);
        });
      void invoke<{ id: string; name: string }[]>("list_extensions")
        .then(setAllExtensions)
        .catch(() => {
          setAllExtensions([]);
        });
      void invoke<
        {
          canary_id: string;
          name: string;
          version: string;
          builtin: boolean;
          default_checked: boolean;
          installed_id: string | null;
        }[]
      >("list_bundled_extensions")
        .then((bundled) => {
          setBundledExtensions(bundled);
          // Pre-check bundled defaults (only additive, never unchecks user picks)
          const defaults = bundled
            .filter((b) => b.default_checked && b.installed_id)
            .map((b) => b.installed_id as string);
          if (defaults.length > 0) {
            setSelectedExtensionIds((prev) => [
              ...prev,
              ...defaults.filter((id) => !prev.includes(id)),
            ]);
          }
        })
        .catch(() => {
          setBundledExtensions([]);
        });
    }
  }, [isOpen]);
  const [releaseTypes, setReleaseTypes] = useState<BrowserReleaseTypes>();
  const [isLoadingReleaseTypes, setIsLoadingReleaseTypes] = useState(false);
  const [_releaseTypesError, setReleaseTypesError] = useState<string | null>(
    null,
  );
  const loadingBrowserRef = useRef<string | null>(null);

  // Use the browser download hook
  const {
    isBrowserDownloading,
    downloadBrowser,
    loadDownloadedVersions,
    downloadedVersionsMap,
  } = useBrowserDownload();

  const loadReleaseTypes = useCallback(
    async (browser: string) => {
      // Set loading state
      loadingBrowserRef.current = browser;
      setIsLoadingReleaseTypes(true);
      setReleaseTypesError(null);

      try {
        const rawReleaseTypes = await invoke<BrowserReleaseTypes>(
          "get_browser_release_types",
          { browserStr: browser },
        );

        await loadDownloadedVersions(browser);

        // Only update state if this browser is still the one we're loading
        if (loadingBrowserRef.current === browser) {
          const filtered: BrowserReleaseTypes = {};
          if (rawReleaseTypes.stable) filtered.stable = rawReleaseTypes.stable;
          setReleaseTypes(filtered);
          setReleaseTypesError(null);
        }
      } catch (error) {
        console.error(`Failed to load release types for ${browser}:`, error);

        // Fallback: still load downloaded versions and derive release type from them if possible
        try {
          const downloaded = await loadDownloadedVersions(browser);
          if (loadingBrowserRef.current === browser && downloaded.length > 0) {
            const latest = downloaded[0];
            const fallback: BrowserReleaseTypes = {};
            fallback.stable = latest;
            setReleaseTypes(fallback);
            setReleaseTypesError(null);
          } else if (loadingBrowserRef.current === browser) {
            // No downloaded versions and API failed - show error
            setReleaseTypesError(
              "Failed to fetch browser versions. Please check your internet connection and try again.",
            );
          }
        } catch (e) {
          console.error(
            `Failed to load downloaded versions for ${browser}:`,
            e,
          );
          if (loadingBrowserRef.current === browser) {
            setReleaseTypesError(
              "Failed to fetch browser versions. Please check your internet connection and try again.",
            );
          }
        }
      } finally {
        // Clear loading state only if we're still loading this browser
        if (loadingBrowserRef.current === browser) {
          loadingBrowserRef.current = null;
          setIsLoadingReleaseTypes(false);
        }
      }
    },
    [loadDownloadedVersions],
  );

  // Load data when dialog opens (Cloak only)
  useEffect(() => {
    if (isOpen) {
      void loadDownloadedVersions("cloak");
      void loadReleaseTypes("cloak");
    }
  }, [isOpen, loadReleaseTypes, loadDownloadedVersions]);

  // Helper function to get the best available version respecting rules
  const getBestAvailableVersion = useCallback(() => {
    if (!releaseTypes) return null;

    if (releaseTypes.stable) {
      return { version: releaseTypes.stable, releaseType: "stable" as const };
    }
    return null;
  }, [releaseTypes]);

  const getCreatableVersion = useCallback(() => {
    const bestVersion = getBestAvailableVersion();
    const browserDownloaded = downloadedVersionsMap.cloak ?? [];
    if (bestVersion && browserDownloaded.includes(bestVersion.version)) {
      return bestVersion;
    }
    if (browserDownloaded.length > 0) {
      const fallbackVersion = browserDownloaded[0];
      return {
        version: fallbackVersion,
        releaseType: "stable" as const,
      };
    }
    return null;
  }, [getBestAvailableVersion, downloadedVersionsMap]);

  const handleDownload = async () => {
    const bestVersion = getBestAvailableVersion();

    if (!bestVersion) {
      console.error("No version available for download");
      return;
    }

    try {
      await downloadBrowser("cloak", bestVersion.version);
    } catch (error) {
      console.error("Failed to download browser:", error);
    }
  };

  const handleCreate = async () => {
    if (!profileName.trim()) return;

    if (enablePassword && !ephemeral) {
      if (password.length < PASSWORD_MIN_LEN) {
        setPasswordError(
          t("profilePassword.errors.tooShort", { min: PASSWORD_MIN_LEN }),
        );
        return;
      }
      if (password !== passwordConfirm) {
        setPasswordError(t("profilePassword.errors.mismatch"));
        return;
      }
    }
    setPasswordError(null);

    setIsCreating(true);

    const isVpnSelection = selectedProxyId?.startsWith("vpn-") ?? false;
    const resolvedProxyId = isVpnSelection ? undefined : selectedProxyId;
    const resolvedVpnId =
      isVpnSelection && selectedProxyId ? selectedProxyId.slice(4) : undefined;

    const passwordToSet =
      enablePassword && !ephemeral && password.length >= PASSWORD_MIN_LEN
        ? password
        : undefined;
    try {
      // Cloak is the only creatable browser.
      const activeBrowser: BrowserTypeString = "cloak";
      let bestVersion = getCreatableVersion();
      if (!bestVersion) {
        // Auto-install on demand instead of leaving Create disabled.
        const toDownload = getBestAvailableVersion();
        if (!toDownload) {
          console.error(`No ${activeBrowser} version available`);
          return;
        }
        try {
          await downloadBrowser(activeBrowser, toDownload.version);
        } catch (e) {
          console.error(`Failed to auto-install ${activeBrowser}:`, e);
          return;
        }
        bestVersion = getCreatableVersion() ?? toDownload;
        if (!bestVersion) {
          console.error(`No ${activeBrowser} version available after download`);
          return;
        }
      }

      await onCreateProfile({
        name: profileName.trim(),
        browserStr: activeBrowser,
        version: bestVersion.version,
        releaseType: bestVersion.releaseType,
        proxyId: resolvedProxyId,
        vpnId: resolvedVpnId,
        cloakConfig: { ...cloakConfig },
        groupId:
          selectedGroupId && selectedGroupId !== "__all__"
            ? selectedGroupId
            : undefined,
        extensionGroupId: selectedExtensionGroupId,
        extensionIds: selectedExtensionIds,
        randomExtension,
        ephemeral,
        dnsBlocklist: dnsBlocklist || undefined,
        launchHook: launchHook.trim() || undefined,
        password: passwordToSet,
      });

      handleClose();
    } catch (error) {
      console.error("Failed to create profile:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    // Cancel any ongoing loading
    loadingBrowserRef.current = null;

    setProfileName("");
    setSelectedProxyId(undefined);
    setLaunchHook("");
    setReleaseTypes({});
    setIsLoadingReleaseTypes(false);
    setReleaseTypesError(null);
    setEphemeral(false);
    setSelectedExtensionGroupId(undefined);
    setSelectedExtensionIds([]);
    setRandomExtension(false);
    setEnablePassword(false);
    setPassword("");
    setPasswordConfirm("");
    setPasswordError(null);
    onClose();
  };

  // Check if Cloak is currently downloading
  const isCloakDownloading = isBrowserDownloading("cloak");

  const isCreateDisabled = useMemo(() => {
    if (!profileName.trim()) return true;
    if (isCloakDownloading) return true;
    if (isCreating) return true;
    // Allow Create when a best version exists even if not yet downloaded —
    // handleCreate auto-installs it on demand.
    if (!getBestAvailableVersion()) {
      if (!getCreatableVersion()) return true;
    }

    return false;
  }, [
    profileName,
    isCloakDownloading,
    getCreatableVersion,
    getBestAvailableVersion,
    isCreating,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] max-w-[min(48rem,calc(100%-4rem))] flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {t("createProfile.configureTitle", {
              browser: "CloakBrowser",
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 w-full flex-1 flex-col">
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="flex w-full flex-col items-center justify-center">
              <div className="w-full space-y-6 py-4">
                <div className="mt-0">
                  <div className="space-y-6">
                    {/* Profile Name */}
                    <div className="space-y-2">
                      <Label htmlFor="profile-name">
                        {t("createProfile.profileName")}
                      </Label>
                      <Input
                        id="profile-name"
                        value={profileName}
                        onChange={(e) => {
                          setProfileName(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !isCreateDisabled &&
                            !isCreating
                          ) {
                            void handleCreate();
                          }
                        }}
                        placeholder={t("createProfile.profileNamePlaceholder")}
                      />
                    </div>
                    {/* Ephemeral Option */}
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                      <div className="flex items-center gap-x-2">
                        <Checkbox
                          id="ephemeral"
                          checked={ephemeral}
                          onCheckedChange={(checked) => {
                            setEphemeral(checked === true);
                          }}
                        />
                        <Label htmlFor="ephemeral" className="font-medium">
                          {t("profiles.ephemeral")}
                        </Label>
                      </div>
                      <p className="ml-6 text-sm text-muted-foreground">
                        {t("profiles.ephemeralDescription")}
                      </p>
                    </div>
                    {/* Password Option */}
                    {!ephemeral && (
                      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                        <div className="flex items-center gap-x-2">
                          <Checkbox
                            id="enable-password"
                            checked={enablePassword}
                            onCheckedChange={(checked) => {
                              setEnablePassword(checked === true);
                              if (checked !== true) {
                                setPassword("");
                                setPasswordConfirm("");
                                setPasswordError(null);
                              }
                            }}
                          />
                          <Label
                            htmlFor="enable-password"
                            className="font-medium"
                          >
                            {t("createProfile.passwordProtect.label")}
                          </Label>
                        </div>
                        <p className="ml-6 text-sm text-muted-foreground">
                          {t("createProfile.passwordProtect.description")}
                        </p>
                        {enablePassword && (
                          <div className="ml-6 space-y-2">
                            <Input
                              type="password"
                              value={password}
                              onChange={(e) => {
                                setPassword(e.target.value);
                                setPasswordError(null);
                              }}
                              placeholder={t(
                                "profilePassword.fields.newPassword",
                              )}
                              autoComplete="new-password"
                            />
                            <Input
                              type="password"
                              value={passwordConfirm}
                              onChange={(e) => {
                                setPasswordConfirm(e.target.value);
                                setPasswordError(null);
                              }}
                              placeholder={t("profilePassword.fields.confirm")}
                              autoComplete="new-password"
                            />
                            {passwordError && (
                              <p className="text-sm text-destructive">
                                {passwordError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="space-y-6">
                      {isLoadingReleaseTypes && (
                        <div className="flex items-center gap-3 rounded-md border p-3">
                          <div className="size-4 animate-spin rounded-full border-2 border-muted/40 border-t-primary" />
                          <p className="text-sm text-muted-foreground">
                            {t("createProfile.version.fetching")}
                          </p>
                        </div>
                      )}
                      {!isLoadingReleaseTypes &&
                        !isCloakDownloading &&
                        !getCreatableVersion() &&
                        getBestAvailableVersion() && (
                          <div className="flex items-center gap-3">
                            <p className="flex-1 text-sm text-muted-foreground">
                              {t("createProfile.version.notDownloaded", {
                                browser: "CloakBrowser",
                              })}
                            </p>
                            <LoadingButton
                              isLoading={isCloakDownloading}
                              size="sm"
                              onClick={() => handleDownload()}
                            >
                              {t("createProfile.actions.download")}
                            </LoadingButton>
                          </div>
                        )}
                      {isCloakDownloading && (
                        <div className="rounded-md border p-3 text-sm text-muted-foreground">
                          {t("createProfile.version.downloading", {
                            browser: "CloakBrowser",
                            version: getBestAvailableVersion()?.version,
                          })}
                        </div>
                      )}
                      <CloakConfigForm
                        config={cloakConfig}
                        onConfigChange={updateCloakConfig}
                      />
                    </div>
                    {/* Proxy / VPN Selection - Always visible */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>{t("createProfile.proxy.title")}</Label>
                        <RippleButton
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowProxyForm(true);
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          <GoPlus className="mr-1 size-3" />{" "}
                          {t("createProfile.proxy.addProxy")}
                        </RippleButton>
                      </div>
                      {storedProxies.length > 0 || vpnConfigs.length > 0 ? (
                        <Popover
                          open={proxyPopoverOpen}
                          onOpenChange={setProxyPopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={proxyPopoverOpen}
                              aria-controls={proxyListboxIdAntiDetect}
                              className="w-full justify-between font-normal"
                            >
                              {(() => {
                                if (!selectedProxyId)
                                  return t("createProfile.proxy.noProxy");
                                if (selectedProxyId.startsWith("vpn-")) {
                                  const vpn = vpnConfigs.find(
                                    (v) => v.id === selectedProxyId.slice(4),
                                  );
                                  return vpn
                                    ? `WG — ${vpn.name}`
                                    : t("createProfile.proxy.noProxy");
                                }
                                const proxy = storedProxies.find(
                                  (p) => p.id === selectedProxyId,
                                );
                                return (
                                  proxy?.name ??
                                  t("createProfile.proxy.noProxy")
                                );
                              })()}
                              <LuChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            id={proxyListboxIdAntiDetect}
                            className="w-[240px] p-0"
                            sideOffset={8}
                          >
                            <Command>
                              <CommandInput
                                placeholder={t("createProfile.proxy.search")}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {t("createProfile.proxy.notFound")}
                                </CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="__none__"
                                    onSelect={() => {
                                      setSelectedProxyId(undefined);
                                      setProxyPopoverOpen(false);
                                    }}
                                  >
                                    <LuCheck
                                      className={cn(
                                        "mr-2 size-4",
                                        !selectedProxyId
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {t("common.labels.none")}
                                  </CommandItem>
                                  {storedProxies.map((proxy) => (
                                    <CommandItem
                                      key={proxy.id}
                                      value={proxy.name}
                                      onSelect={() => {
                                        setSelectedProxyId(proxy.id);
                                        setProxyPopoverOpen(false);
                                      }}
                                    >
                                      <LuCheck
                                        className={cn(
                                          "mr-2 size-4",
                                          selectedProxyId === proxy.id
                                            ? "opacity-100"
                                            : "opacity-0",
                                        )}
                                      />
                                      {proxy.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                                {vpnConfigs.length > 0 && (
                                  <CommandGroup heading="VPNs">
                                    {vpnConfigs.map((vpn) => (
                                      <CommandItem
                                        key={vpn.id}
                                        value={`vpn-${vpn.name}`}
                                        onSelect={() => {
                                          setSelectedProxyId(`vpn-${vpn.id}`);
                                          setProxyPopoverOpen(false);
                                        }}
                                      >
                                        <LuCheck
                                          className={cn(
                                            "mr-2 size-4",
                                            selectedProxyId === `vpn-${vpn.id}`
                                              ? "opacity-100"
                                              : "opacity-0",
                                          )}
                                        />
                                        <Badge
                                          variant="outline"
                                          className="mr-1 px-1 py-0 text-[10px] leading-tight"
                                        >
                                          WG
                                        </Badge>
                                        {vpn.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <div className="flex items-center gap-3 rounded-md border p-3 text-sm text-muted-foreground">
                          {t("createProfile.proxy.noProxiesAvailable")}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="launch-hook-url">
                        {t("createProfile.launchHook.label")}
                      </Label>
                      <Input
                        id="launch-hook-url"
                        value={launchHook}
                        onChange={(e) => {
                          setLaunchHook(e.target.value);
                        }}
                        placeholder={t("createProfile.launchHook.placeholder")}
                        disabled={isCreating}
                      />
                    </div>
                    {/* DNS Blocklist */}
                    <div className="space-y-2">
                      <Label>{t("dnsBlocklist.title")}</Label>
                      <Select
                        value={dnsBlocklist || "none"}
                        onValueChange={(val) => {
                          setDnsBlocklist(val === "none" ? "" : val);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("dnsBlocklist.none")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {t("dnsBlocklist.none")}
                          </SelectItem>
                          <SelectItem value="light">
                            {t("dnsBlocklist.light")}
                          </SelectItem>
                          <SelectItem value="normal">
                            {t("dnsBlocklist.normal")}
                          </SelectItem>
                          <SelectItem value="pro">
                            {t("dnsBlocklist.pro")}
                          </SelectItem>
                          <SelectItem value="pro_plus">
                            {t("dnsBlocklist.proPlus")}
                          </SelectItem>
                          <SelectItem value="ultimate">
                            {t("dnsBlocklist.ultimate")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Extension Group + per-extension checkboxes + random */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>{t("extensions.extensionGroup")}</Label>
                        <div className="flex gap-2">
                          <RippleButton
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              if (allExtensions.length === 0) return;
                              const idx = Math.floor(
                                Math.random() * allExtensions.length,
                              );
                              const pick = allExtensions[idx];
                              setSelectedExtensionIds((prev) =>
                                prev.includes(pick.id)
                                  ? prev
                                  : [...prev, pick.id],
                              );
                            }}
                          >
                            {t("common.buttons.random")}
                          </RippleButton>
                          <RippleButton
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              void invoke("import_canary_extensions").then(
                                () => {
                                  void invoke<
                                    {
                                      id: string;
                                      name: string;
                                      extension_ids: string[];
                                    }[]
                                  >("list_extension_groups").then(
                                    setExtensionGroups,
                                  );
                                  void invoke<{ id: string; name: string }[]>(
                                    "list_extensions",
                                  ).then(setAllExtensions);
                                },
                              );
                            }}
                          >
                            {t("extensions.importCanary")}
                          </RippleButton>
                        </div>
                      </div>
                      {extensionGroups.length > 0 && (
                        <Select
                          value={selectedExtensionGroupId ?? "none"}
                          onValueChange={(val) => {
                            setSelectedExtensionGroupId(
                              val === "none" ? undefined : val,
                            );
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t("profileInfo.values.none")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              {t("profileInfo.values.none")}
                            </SelectItem>
                            {extensionGroups.map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name} ({g.extension_ids.length})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {allExtensions.length > 0 && (
                        <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                          {bundledExtensions.length > 0 && (
                            <>
                              <p className="px-1 text-xs font-medium text-muted-foreground">
                                {t("extensions.bundled", "Bundled")}
                              </p>
                              {bundledExtensions.map((b) => (
                                <div
                                  key={b.canary_id}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <Checkbox
                                    id={`bundled-${b.canary_id}`}
                                    disabled={b.builtin}
                                    checked={
                                      b.builtin ||
                                      (b.installed_id !== null &&
                                        selectedExtensionIds.includes(
                                          b.installed_id,
                                        ))
                                    }
                                    onCheckedChange={(checked) => {
                                      if (!b.installed_id) return;
                                      const id = b.installed_id;
                                      setSelectedExtensionIds((prev) =>
                                        checked === true
                                          ? [...prev, id]
                                          : prev.filter((x) => x !== id),
                                      );
                                    }}
                                  />
                                  <Label htmlFor={`bundled-${b.canary_id}`}>
                                    {b.name}
                                  </Label>
                                  {b.builtin && (
                                    <Badge
                                      variant="outline"
                                      className="px-1 py-0 text-[10px] leading-tight"
                                    >
                                      {t("extensions.builtIn", "Built-in")}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                              <p className="px-1 pt-1 text-xs font-medium text-muted-foreground">
                                {t("extensions.optional", "Optional")}
                              </p>
                            </>
                          )}
                          {allExtensions
                            .filter(
                              (ext) =>
                                !bundledExtensions.some(
                                  (b) => b.installed_id === ext.id,
                                ),
                            )
                            .map((ext) => (
                              <div
                                key={ext.id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  id={`ext-${ext.id}`}
                                  checked={selectedExtensionIds.includes(
                                    ext.id,
                                  )}
                                  onCheckedChange={(checked) => {
                                    setSelectedExtensionIds((prev) =>
                                      checked === true
                                        ? [...prev, ext.id]
                                        : prev.filter((id) => id !== ext.id),
                                    );
                                  }}
                                />
                                <Label htmlFor={`ext-${ext.id}`}>
                                  {ext.name}
                                </Label>
                              </div>
                            ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Checkbox
                          id="random-extension"
                          checked={randomExtension}
                          onCheckedChange={(checked) => {
                            setRandomExtension(checked === true);
                          }}
                        />
                        <Label htmlFor="random-extension">
                          {t("extensions.randomEphemeral")}
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="shrink-0 border-t pt-4">
          <RippleButton variant="outline" onClick={handleClose}>
            {t("common.buttons.cancel")}
          </RippleButton>
          <LoadingButton
            onClick={handleCreate}
            isLoading={isCreating}
            disabled={isCreateDisabled}
          >
            {t("common.buttons.create")}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
      <ProxyFormDialog
        isOpen={showProxyForm}
        onClose={() => {
          setShowProxyForm(false);
        }}
      />
    </Dialog>
  );
}
