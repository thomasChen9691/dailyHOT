// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import boardServer from "@aihot/board/server";
import llmGuardServer from "@aihot/llm-guard/server";

export const SERVER_MODULES: readonly ServerModule[] = [boardServer, llmGuardServer];
