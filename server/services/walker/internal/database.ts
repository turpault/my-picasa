/**
 * Walker database - re-exports from entries database.
 * The unified picisa_entries.db replaces picisa_walker.db (Phase 2).
 */
export {
  getWalkerDatabase,
  closeWalkerDatabase,
} from "../../entries/internal/database";
