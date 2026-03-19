/**
 * Public API for favorite-exporter setup.
 * Main process uses this to register event listeners. Worker runs export logic.
 */
export { setupFavoriteExporter } from "./internal/export-favorites";
