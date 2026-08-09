import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local convenience only: pull in investor-analytics/.env (shared with the
// Python scripts) and dashboard/.env. Hosted builds inject env vars directly,
// so a missing dotenv must not take the build down.
try {
  const { config } = await import("dotenv");
  config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });
  config({ path: path.join(__dirname, "..", ".env"), quiet: true });
} catch {
  console.warn("[load-env] dotenv unavailable; relying on the ambient environment.");
}
