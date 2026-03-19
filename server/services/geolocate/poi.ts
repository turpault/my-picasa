/**
 * Public API for POI database (poi.db) - lifecycle and access.
 * Main process uses this for init, close, and stats. Worker uses internal/ directly.
 */
export { closePoiDb, getPoiDb } from "./internal/poi/poi-database";
export { initPOIDB } from "./internal/poi/ingest";
