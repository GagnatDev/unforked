import { startServer } from "./bootstrap.js";
import { logger } from "./logger.js";

// Production entry point. Commit 3 runs migrations here before startServer().
startServer().catch((err: unknown) => {
  logger.error(err, "failed to start backend");
  process.exit(1);
});
