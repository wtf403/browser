import { Controller } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SyncService } from "./sync.service.js";

@Controller("v1/internal")
export class InternalController {
  private readonly internalKey: string | undefined;

  constructor(
    private readonly syncService: SyncService,
    private readonly configService: ConfigService,
  ) {
    this.internalKey = this.configService.get<string>("INTERNAL_KEY");
  }

  // /cleanup-excess-profiles endpoint removed - profile limits are now unlimited
}
