/**
 * Run favorite-exporter worker: export all starred entries to favorites folder.
 */
import { getEntriesDatabase } from "../../entries/internal/database";
import { exportAllMissing } from "./export-favorites";

export async function runFavoriteExporterWorker(): Promise<void> {
  getEntriesDatabase();
  await exportAllMissing();
}
