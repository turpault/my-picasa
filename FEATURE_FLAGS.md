# Feature Flags System

This document describes the feature flag system implemented in Picisa, which allows you to enable/disable features dynamically without code changes.

## Configuration

Feature flags are configured in a JSON file located at the root of your `imagesRoot` directory (typically `/Volumes/Photos/feature-flags.json`).

### Configuration File Format

```json
{
  "version": "1.0.0",
  "flags": {
    "enableNewUI": {
      "enabled": true,
      "description": "Enable the new user interface components"
    },
    "enableAdvancedFilters": {
      "enabled": false,
      "description": "Enable advanced image filtering options"
    },
    "enableBatchProcessing": {
      "enabled": true,
      "description": "Enable batch processing of multiple images"
    },
    "enableCloudSync": {
      "enabled": false,
      "description": "Enable cloud synchronization features"
    },
    "enableExperimentalFeatures": {
      "enabled": false,
      "description": "Enable experimental and beta features"
    }
  }
}
```

## Usage

### Server-Side

The server automatically loads feature flags from the configuration file and provides them via RPC.

```typescript
import { getFeatureFlags, isFeatureEnabled } from "./rpc/rpcFunctions/featureFlags";

// Get all feature flags
const flags = await getFeatureFlags();

// Check if a specific feature is enabled
const isNewUIEnabled = await isFeatureEnabled("enableNewUI");
```

### Client-Side

Use the feature flag service to check feature availability:

```typescript
import { featureFlagService } from "./lib/feature-flags";

// Check if a feature is enabled
const isEnabled = await featureFlagService.isFeatureEnabled("enableNewUI");

// Get all feature flags
const allFlags = await featureFlagService.getAllFeatureFlags();

// Check multiple flags at once
const flags = await featureFlagService.areFeaturesEnabled([
  "enableNewUI", 
  "enableAdvancedFilters"
]);
```

### Conditional Feature Rendering

Use the helper function to conditionally render features:

```typescript
import { createConditionalFeature } from "./components/feature-flag-demo";

const newUIComponent = await createConditionalFeature("enableNewUI", () => {
  return $("div", { textContent: "New UI Feature" });
});

if (newUIComponent) {
  document.body.appendChild(newUIComponent);
}
```

## Adding New Feature Flags

1. Add the flag to your `feature-flags.json` file
2. Use the flag in your code using the methods described above
3. The system will automatically pick up changes to the configuration file

## Caching

Feature flags are cached on the server side and will be reloaded when the configuration file is modified. The client-side service also caches flags to avoid unnecessary RPC calls.

## Error Handling

If the feature flags file is missing or invalid, the system will fall back to default values (all flags disabled except for core features like batch processing).

## TypeScript Support

The system includes full TypeScript support with proper type definitions in `shared/types/feature-flags.ts`.
