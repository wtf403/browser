"use client";

import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CloakConfig } from "@/types";

interface CloakConfigFormProps {
  config: CloakConfig;
  onConfigChange: (key: keyof CloakConfig, value: unknown) => void;
  className?: string;
  readOnly?: boolean;
}

export function CloakConfigForm({
  config,
  onConfigChange,
  className = "",
  readOnly = false,
}: CloakConfigFormProps) {
  const { t } = useTranslation();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* OS target */}
      <div className="space-y-2">
        <Label>{t("cloak.os_label", "Target OS")}</Label>
        <Select
          disabled={readOnly}
          value={config.os ?? ""}
          onValueChange={(v) => onConfigChange("os", v || undefined)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("cloak.os_auto", "Auto-detect")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="windows">Windows</SelectItem>
            <SelectItem value="macos">macOS</SelectItem>
            <SelectItem value="linux">Linux</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Fingerprint seed */}
      <div className="space-y-2">
        <Label>{t("cloak.fingerprint_seed_label", "Fingerprint Seed")}</Label>
        <Input
          type="number"
          disabled={readOnly || config.randomize_fingerprint_on_launch === true}
          value={config.fingerprint_seed ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onConfigChange(
              "fingerprint_seed",
              v === "" ? undefined : parseInt(v, 10),
            );
          }}
          placeholder={t(
            "cloak.fingerprint_seed_placeholder",
            "Leave blank for random",
          )}
        />
      </div>

      {/* Randomize fingerprint on launch */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="cloak-randomize"
          disabled={readOnly}
          checked={config.randomize_fingerprint_on_launch === true}
          onCheckedChange={(v) =>
            onConfigChange("randomize_fingerprint_on_launch", v === true)
          }
        />
        <Label htmlFor="cloak-randomize">
          {t(
            "cloak.randomize_fingerprint",
            "Randomize fingerprint on each launch",
          )}
        </Label>
      </div>

      {/* GeoIP */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="cloak-geoip"
          disabled={readOnly}
          checked={config.geoip === true}
          onCheckedChange={(v) => onConfigChange("geoip", v === true)}
        />
        <Label htmlFor="cloak-geoip">
          {t("cloak.geoip", "Auto-detect timezone/locale from proxy IP")}
        </Label>
      </div>

      {/* Humanize */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="cloak-humanize"
          disabled={readOnly}
          checked={config.humanize === true}
          onCheckedChange={(v) => onConfigChange("humanize", v === true)}
        />
        <Label htmlFor="cloak-humanize">
          {t("cloak.humanize", "Humanize mouse/keyboard interactions")}
        </Label>
      </div>
    </div>
  );
}
