# Picisa Design Document

This document defines the architecture and design rules for the Picisa codebase. All changes must adhere to these rules.

## Architecture Overview

Picisa is a **Picasa replacement** built with TypeScript, Bun, and React. The codebase is split into three main layers:

```
client/     → Browser UI (React, web components)
server/     → Node/Bun backend (RPC, workers, image ops)
shared/     → Types, utilities, and transport used by both
```

### Layer Boundaries

- **Client** may import from `shared/` only. Never import from `server/`.
- **Server** may import from `shared/` and `server/`. Never import from `client/`.
- **Shared** must not import from `client/` or `server/`.

## Data Model & Persistence

### Picture Deletion

Pictures are **never deleted for real**. When the user triggers deletion, pictures are moved to a hidden folder instead of being removed from disk.

### Source of Truth

- **`.picasa.ini`** is the source of truth for any user edit (stars, captions, faces, etc.).
- **Databases** contain data derived from `.picasa.ini` and the pictures themselves.
- Databases may act as **write-through caches** of user edits and changes: writes go to `.picasa.ini` first, then the database is updated to stay in sync.

## Service Structure

Background services live under `server/services/<serviceName>/`:

```
server/services/<serviceName>/
  worker.ts           # Entry point; started by worker-manager
  queries.ts          # (optional) Public read-only API
  internal/           # Private implementation
    worker-thread.ts  # Heavy work runs here
    database.ts       # SQLite or other persistence
    <domain>/         # Domain-specific modules (e.g. poi/, face/)
```

### Rules

1. **Worker entry**: Each service has a `worker.ts` that is spawned via `Bun.spawn` and communicates via IPC (`process.send`). Parent uses `Bun.spawn([process.execPath, workerPath], { ipc, env })`.
2. **Internal visibility**: Code in `internal/` is implementation detail. Only `worker.ts`, `queries.ts`, and RPC handlers should import from `internal/`.
3. **Database access**: Databases live in `internal/` (e.g. `internal/database.ts`, `internal/poi/poi-database.ts`). Use `getXxxDb()` or `getXxxDatabaseReadOnly()` singletons.
4. **Cross-service imports**: Prefer RPC or events over direct imports. If a service needs another, import only its public API (`queries.ts` or exported functions from the service root).

### Worker Service Reader/Writer Split

Each worker service (faces, geolocate, search, favorite-exporter) has two separate components:

| Component | Purpose | Location | Used by |
|-----------|---------|----------|---------|
| **Reader** | Runs database queries only. Read-only access. | `queries.ts`, `internal/database.ts` (read path) | Main process **only** |
| **Writer** | Runs the process and writes to the database (or filesystem for favorite-exporter). May use reader for queries. | `worker.ts`, `internal/worker-database.ts`, `internal/run-*-worker.ts`, `internal/worker-thread.ts`, `internal/export-favorites.ts` | Child process only (Bun.spawn) |

**Rules:**
- The main process **only** accesses the reader component.
- The reader component **never** imports from: `worker-database`, `run-*-worker`, `worker-thread` (writer logic), or `worker.ts`.
- The writer may import from the reader (e.g. `getGeoPOI` from geolocate queries).

## RPC Layer

- RPC handlers live in `server/rpc/` and `server/rpc/rpcFunctions/`.
- Client calls via `getService()` from `client/rpc/connect`.
- Service definitions use `ServiceMap` with `imports`, `functions`, and `constants`.
- Keep RPC handlers thin: delegate to services, operations, or `internal/` modules.

## Naming Conventions

| Kind | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `face-db-reader.ts`, `poi-database.ts` |
| Types/Interfaces | PascalCase | `AlbumEntry`, `GeoPOI` |
| Functions | camelCase | `getPicasaFeatures`, `addFaceRectToEntry` |
| Constants | camelCase or UPPER_SNAKE | `imagesRoot`, `POI_TYPE` |
| Database tables | snake_case | `processed_files`, `poi` |

## Import Rules

1. **Absolute vs relative**: Prefer relative imports. Use `shared/` paths when crossing into shared (e.g. `../../shared/types/types`).
2. **Barrel files**: Use `index.ts` for re-exports when a folder has multiple public entry points.
3. **No circular imports**: Ensure no cycles between modules. Services should not import each other in a cycle.

## Type Safety

- Shared types live in `shared/types/types.ts` and related files.
- Use explicit types for function parameters and return values.
- Avoid `any`; use `unknown` or proper types when type is uncertain.
- Domain types (e.g. `Face`, `Contact`, `GeoPOI`) are defined in `shared/types/`.

## Error Handling

- Use `shared/types/exceptions.ts` for custom error types when needed.
- Log errors with context before rethrowing.
- Avoid empty `catch` blocks.

## Database Conventions

- Use Bun's `Database` from `bun:sqlite` for SQLite.
- Schema migrations: check for column/table existence before altering; log migrations.
- Use prepared statements for parameterized queries.
- Close database connections on process exit (e.g. `closePoiDb()` in `process.on("exit")`).

## Testing

- Test files: `*.spec.ts` or `*.spec.tsx` next to source or in `dist/test/`.
- Generated test scripts go in `testing_scripts/` (not committed).

## Build & Runtime

- Build: `bun run build` (runs `scripts/build.ts`).
- Dev: `bun run dev` or `bun --hot server/index.ts`.
- Public assets: `public/`; built output: `public/dist/`.

---

**When in doubt, follow existing patterns in the codebase and keep changes minimal and consistent.**
