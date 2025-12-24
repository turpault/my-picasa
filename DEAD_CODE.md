# Dead Code Enumeration

## 1. `queueNotification` function
**Location**: `server/services/walker/internal/worker-thread.ts` (line 20)
**Issue**: Imported but not exported from `server/rpc/fileAndFolders.ts`
**Status**: Used in 4 places in worker-thread.ts but function doesn't exist
**Fix**: Should be replaced with direct `events.emit()` calls (which is the pattern already used elsewhere)

**References**:
- `server/services/walker/internal/worker-thread.ts:20` - import
- `server/services/walker/internal/worker-thread.ts:76` - usage
- `server/services/walker/internal/worker-thread.ts:93` - usage  
- `server/services/walker/internal/worker-thread.ts:114` - usage
- `server/services/walker/internal/worker-thread.ts:360` - usage

## 2. `getPersonAlbums` wrapper function
**Location**: `server/rpc/rpcFunctions/albumUtils.ts` (line 39-41)
**Issue**: Unnecessary wrapper that just calls `getPersonsAlbums()`
**Status**: Still used in `server/rpc/my-picasa.ts`, but could be replaced with direct call
**Note**: Not strictly dead, but redundant indirection

## 3. Type mismatch: `Contact` with `count` field
**Location**: `server/services/faces/queries.ts` (line 37-45)
**Issue**: Returns Contact objects with `count` field, but Contact type definition may not match usage
**Status**: Contact type in `shared/types/types.ts` does include `count` field (line 500), so this is actually valid

## Notes
- `buildPersonsList` was successfully removed (grep shows it in contacts.ts but reading the file shows it's not there - likely already cleaned up)
- All imports from deleted `albumTypes/` folder appear to have been updated
