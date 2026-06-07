"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { LoadingButton } from "@/components/loading-button";
import {
  AnimatedTabs,
  AnimatedTabsContent,
  AnimatedTabsList,
  AnimatedTabsTrigger,
} from "@/components/ui/animated-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translateBackendError } from "@/lib/backend-errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast-utils";
import type { SyncSettings } from "@/types";

interface AccountPageProps {
  isOpen: boolean;
  onClose: () => void;
  subPage?: boolean;
}

type ConnectionStatus = "unknown" | "testing" | "connected" | "error";

export function AccountPage({ isOpen, onClose, subPage }: AccountPageProps) {
  const { t } = useTranslation();

  // Self-hosted server state. Loaded once when the dialog opens and persisted
  // via `save_sync_settings` so the rest of the app picks up the new URL/token
  // from `SettingsManager`.
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isSavingSelfHosted, setIsSavingSelfHosted] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("unknown");

  const hasConfig = Boolean(serverUrl && token);

  const loadSelfHostedSettings = useCallback(async () => {
    try {
      const settings = await invoke<SyncSettings>("get_sync_settings");
      setServerUrl(settings.sync_server_url ?? "");
      setToken(settings.sync_token ?? "");
      setConnectionStatus(
        settings.sync_server_url && settings.sync_token ? "unknown" : "unknown",
      );
    } catch (error) {
      console.error("Failed to load sync settings:", error);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadSelfHostedSettings();
    }
  }, [isOpen, loadSelfHostedSettings]);

  const handleTestConnection = useCallback(async () => {
    if (!serverUrl) {
      showErrorToast(t("sync.config.serverUrlRequired"));
      return;
    }
    setIsTestingConnection(true);
    setConnectionStatus("testing");
    try {
      const healthUrl = `${serverUrl.replace(/\/$/, "")}/health`;
      const response = await fetch(healthUrl);
      if (response.ok) {
        setConnectionStatus("connected");
        showSuccessToast(t("sync.config.connectionSuccess"));
      } else {
        setConnectionStatus("error");
        showErrorToast(t("sync.config.serverError"));
      }
    } catch {
      setConnectionStatus("error");
      showErrorToast(t("sync.config.connectFailed"));
    } finally {
      setIsTestingConnection(false);
    }
  }, [serverUrl, t]);

  const handleSaveSelfHosted = useCallback(async () => {
    setIsSavingSelfHosted(true);
    try {
      await invoke<SyncSettings>("save_sync_settings", {
        syncServerUrl: serverUrl || null,
        syncToken: token || null,
      });
      try {
        await invoke("restart_sync_service");
      } catch (e) {
        console.error("Failed to restart sync service:", e);
      }
      showSuccessToast(t("sync.config.settingsSaved"));
    } catch (error) {
      console.error("Failed to save sync settings:", error);
      // Use the structured backend-error translator so the cloud-vs-self-
      // hosted mutex (`SELF_HOSTED_REQUIRES_LOGOUT`) shows a clear message
      // instead of the generic "save failed" toast.
      showErrorToast(translateBackendError(t as never, error));
    } finally {
      setIsSavingSelfHosted(false);
    }
  }, [serverUrl, token, t]);

  const handleDisconnectSelfHosted = useCallback(async () => {
    setIsSavingSelfHosted(true);
    try {
      await invoke<SyncSettings>("save_sync_settings", {
        syncServerUrl: null,
        syncToken: null,
      });
      try {
        await invoke("restart_sync_service");
      } catch (e) {
        console.error("Failed to restart sync service:", e);
      }
      setServerUrl("");
      setToken("");
      setConnectionStatus("unknown");
      showSuccessToast(t("sync.config.disconnected"));
    } catch (error) {
      console.error("Failed to disconnect:", error);
      showErrorToast(t("sync.config.disconnectFailed"));
    } finally {
      setIsSavingSelfHosted(false);
    }
  }, [t]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose} subPage={subPage}>
      <DialogContent className="max-w-2xl flex flex-col">
        <div className="flex flex-col gap-4 p-4">
          <AnimatedTabs defaultValue="self-hosted">
            <AnimatedTabsList>
              <AnimatedTabsTrigger value="self-hosted">
                {t("account.tabs.selfHosted")}
              </AnimatedTabsTrigger>
            </AnimatedTabsList>

            <AnimatedTabsContent value="self-hosted" className="mt-4">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {t("account.selfHosted.title")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("account.selfHosted.description")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="self-hosted-server-url" className="text-xs">
                    {t("sync.serverUrl")}
                  </Label>
                  <Input
                    id="self-hosted-server-url"
                    type="url"
                    placeholder={t("sync.serverUrlPlaceholder")}
                    value={serverUrl}
                    onChange={(e) => {
                      setServerUrl(e.target.value);
                      setConnectionStatus("unknown");
                    }}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="self-hosted-token" className="text-xs">
                    {t("sync.token")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="self-hosted-token"
                      type={showToken ? "text" : "password"}
                      placeholder={t("sync.tokenPlaceholder")}
                      value={token}
                      onChange={(e) => {
                        setToken(e.target.value);
                        setConnectionStatus("unknown");
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowToken((v) => !v);
                      }}
                      aria-label={
                        showToken
                          ? t("common.aria.hideToken")
                          : t("common.aria.showToken")
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showToken ? (
                        <LuEyeOff className="size-3.5" />
                      ) : (
                        <LuEye className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {t("account.selfHosted.connectionStatus")}
                  </span>
                  {connectionStatus === "connected" && (
                    <Badge
                      variant="default"
                      className="text-success-foreground bg-success"
                    >
                      {t("sync.status.connected")}
                    </Badge>
                  )}
                  {connectionStatus === "error" && (
                    <Badge variant="destructive">
                      {t("sync.status.error")}
                    </Badge>
                  )}
                  {connectionStatus === "testing" && (
                    <Badge variant="secondary">
                      {t("sync.status.syncing")}
                    </Badge>
                  )}
                  {connectionStatus === "unknown" && (
                    <Badge variant="secondary">
                      {t("account.selfHosted.statusUnknown")}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <LoadingButton
                    size="sm"
                    variant="outline"
                    isLoading={isTestingConnection}
                    disabled={!serverUrl || isSavingSelfHosted}
                    onClick={() => void handleTestConnection()}
                    className="h-8 text-xs"
                  >
                    {t("account.selfHosted.testConnection")}
                  </LoadingButton>
                  <LoadingButton
                    size="sm"
                    isLoading={isSavingSelfHosted}
                    disabled={!serverUrl || !token || isTestingConnection}
                    onClick={() => void handleSaveSelfHosted()}
                    className="h-8 text-xs"
                  >
                    {t("common.buttons.save")}
                  </LoadingButton>
                  {hasConfig && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isSavingSelfHosted || isTestingConnection}
                      onClick={() => void handleDisconnectSelfHosted()}
                      className="h-8 text-xs"
                    >
                      {t("account.selfHosted.disconnect")}
                    </Button>
                  )}
                </div>
              </div>
            </AnimatedTabsContent>
          </AnimatedTabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
