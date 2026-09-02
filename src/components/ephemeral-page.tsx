"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuCopy, LuGhost, LuPlay, LuSquare } from "react-icons/lu";
import { translateBackendError } from "@/lib/backend-errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast-utils";
import type { BrowserProfile, StoredProxy } from "@/types";
import { LoadingButton } from "./loading-button";
import { AnimatedSwitch } from "./ui/animated-switch";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface EphemeralSessionLaunchResult {
  profile_id: string;
  name: string;
  cdp_port: number;
  proxy_id: string;
  proxy_name: string;
  headless: boolean;
  proxy_ip?: string;
  started_at: number;
}

const CDP_PORTS: Record<string, number> = {};

export function EphemeralPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<BrowserProfile[]>([]);
  const [proxies, setProxies] = useState<StoredProxy[]>([]);
  const [headless, setHeadless] = useState(true);
  const [url, setUrl] = useState("");
  const [launching, setLaunching] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const list = await invoke<BrowserProfile[]>("list_ephemeral_sessions");
      setSessions(list);
    } catch (err) {
      console.error("Failed to list ephemeral sessions:", err);
    }
  }, []);

  const loadProxies = useCallback(async () => {
    try {
      const list = await invoke<StoredProxy[]>("get_stored_proxies");
      setProxies(list);
    } catch (err) {
      console.error("Failed to load proxies:", err);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    loadProxies();
    const un = listen("profiles-changed", () => {
      loadSessions();
    });
    return () => {
      un.then((f) => f());
    };
  }, [loadSessions, loadProxies]);

  const proxyNameFor = useCallback(
    (id?: string) => {
      if (!id) return null;
      return proxies.find((p) => p.id === id)?.name ?? id;
    },
    [proxies],
  );

  const handleLaunch = useCallback(async () => {
    setLaunching(true);
    try {
      const info = await invoke<EphemeralSessionLaunchResult>(
        "launch_ephemeral_session",
        {
          headless,
          url: url.trim() || undefined,
        },
      );
      CDP_PORTS[info.profile_id] = info.cdp_port;
      showSuccessToast(
        t("ephemeralSessions.toast.launched", {
          name: info.name,
          port: info.cdp_port,
          proxy: info.proxy_name,
        }),
      );
      setUrl("");
      await loadSessions();
    } catch (err) {
      showErrorToast(translateBackendError(t, err));
    } finally {
      setLaunching(false);
    }
  }, [headless, url, t, loadSessions]);

  const handleStop = useCallback(
    async (profileId: string) => {
      setStoppingId(profileId);
      try {
        await invoke("stop_ephemeral_session", { profileId });
        const name =
          sessions.find((s) => s.id === profileId)?.name ?? profileId;
        delete CDP_PORTS[profileId];
        showSuccessToast(t("ephemeralSessions.toast.stopped", { name }));
        await loadSessions();
      } catch (err) {
        showErrorToast(translateBackendError(t, err));
      } finally {
        setStoppingId(null);
      }
    },
    [sessions, t, loadSessions],
  );

  const handleCopyCdp = useCallback(
    async (profileId: string) => {
      const port = CDP_PORTS[profileId];
      if (!port) {
        showErrorToast(t("ephemeralSessions.status.stopped"));
        return;
      }
      const cdpUrl = `http://127.0.0.1:${port}/json`;
      try {
        await navigator.clipboard.writeText(cdpUrl);
        showSuccessToast(t("ephemeralSessions.toast.cdpCopied"));
      } catch {
        showErrorToast(cdpUrl);
      }
    },
    [t],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-4 pb-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <LuGhost className="size-5" />
            {t("ephemeralSessions.title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("ephemeralSessions.description")}
          </p>
        </header>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("ephemeralSessions.urlPlaceholder")}
              className="h-8 max-w-xs flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !launching) handleLaunch();
              }}
            />
            <div className="flex items-center gap-2">
              <AnimatedSwitch
                id="ephemeral-headless"
                checked={headless}
                onCheckedChange={setHeadless}
              />
              <Label
                htmlFor="ephemeral-headless"
                className="text-xs font-medium"
              >
                {t("ephemeralSessions.headless")}
              </Label>
            </div>
            <LoadingButton
              variant="default"
              size="sm"
              onClick={handleLaunch}
              isLoading={launching}
              className="h-8"
            >
              {!launching && <LuPlay className="size-3.5" />}
              {launching
                ? t("ephemeralSessions.launching")
                : t("ephemeralSessions.launch")}
            </LoadingButton>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t("ephemeralSessions.headlessHint")}
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card/50 py-12">
            <LuGhost className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {t("ephemeralSessions.empty")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("ephemeralSessions.emptyHint")}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    {t("ephemeralSessions.column.name")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t("ephemeralSessions.column.proxy")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t("ephemeralSessions.column.cdpPort")}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t("ephemeralSessions.column.status")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("ephemeralSessions.actions.stop")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const running = s.process_id != null;
                  const port = CDP_PORTS[s.id];
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {proxyNameFor(s.proxy_id) ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {port ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            running
                              ? "inline-flex items-center gap-1 text-success"
                              : "inline-flex items-center gap-1 text-muted-foreground"
                          }
                        >
                          <span
                            className={
                              running
                                ? "size-1.5 rounded-full bg-success"
                                : "size-1.5 rounded-full bg-muted-foreground/50"
                            }
                          />
                          {running
                            ? t("ephemeralSessions.status.running")
                            : t("ephemeralSessions.status.stopped")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => handleCopyCdp(s.id)}
                            disabled={!port}
                            aria-label={t("ephemeralSessions.actions.copyCdp")}
                          >
                            <LuCopy className="size-3.5" />
                          </Button>
                          <LoadingButton
                            variant="destructive"
                            size="sm"
                            className="h-7"
                            isLoading={stoppingId === s.id}
                            onClick={() => handleStop(s.id)}
                          >
                            {!stoppingId && <LuSquare className="size-3" />}
                            {stoppingId === s.id
                              ? t("ephemeralSessions.actions.stopping")
                              : t("ephemeralSessions.actions.stop")}
                          </LoadingButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
