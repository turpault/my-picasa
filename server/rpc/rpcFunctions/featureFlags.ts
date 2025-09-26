import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { imagesRoot } from "../../utils/constants";
import { FeatureFlags } from "../../../shared/types/feature-flags";

let cachedFeatureFlags: FeatureFlags | null = null;
let lastModified: number = 0;

function loadFeatureFlags(): FeatureFlags {
  const featureFlagsPath = join(imagesRoot, "feature-flags.json");
  
  try {
    if (!existsSync(featureFlagsPath)) {
      console.warn(`Feature flags file not found at ${featureFlagsPath}, using default configuration`);
      return getDefaultFeatureFlags();
    }

    const stats = require("fs").statSync(featureFlagsPath);
    const currentModified = stats.mtime.getTime();

    // Return cached version if file hasn't changed
    if (cachedFeatureFlags && currentModified === lastModified) {
      return cachedFeatureFlags;
    }

    const fileContent = readFileSync(featureFlagsPath, "utf8");
    const featureFlags: FeatureFlags = JSON.parse(fileContent);
    
    // Validate the structure
    if (!featureFlags.version || !featureFlags.flags) {
      throw new Error("Invalid feature flags structure");
    }

    // Cache the result
    cachedFeatureFlags = featureFlags;
    lastModified = currentModified;

    console.info(`Loaded feature flags from ${featureFlagsPath}`);
    return featureFlags;
  } catch (error) {
    console.error(`Error loading feature flags: ${error}`);
    return getDefaultFeatureFlags();
  }
}

function getDefaultFeatureFlags(): FeatureFlags {
  return {
    version: "1.0.0",
    flags: {
      enableNewUI: {
        enabled: false,
        description: "Enable the new user interface components"
      },
      enableAdvancedFilters: {
        enabled: false,
        description: "Enable advanced image filtering options"
      },
      enableBatchProcessing: {
        enabled: true,
        description: "Enable batch processing of multiple images"
      },
      enableCloudSync: {
        enabled: false,
        description: "Enable cloud synchronization features"
      },
      enableExperimentalFeatures: {
        enabled: false,
        description: "Enable experimental and beta features"
      }
    }
  };
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  return loadFeatureFlags();
}

export async function isFeatureEnabled(flagName: string): Promise<boolean> {
  const featureFlags = await getFeatureFlags();
  return featureFlags.flags[flagName]?.enabled || false;
}

export async function updateFeatureFlags(flags: FeatureFlags): Promise<void> {
  const featureFlagsPath = join(imagesRoot, "feature-flags.json");
  
  try {
    // Validate the structure
    if (!flags.version || !flags.flags) {
      throw new Error("Invalid feature flags structure");
    }

    // Write the updated flags to file
    const flagsJson = JSON.stringify(flags, null, 2);
    writeFileSync(featureFlagsPath, flagsJson, "utf8");
    
    // Clear cache to force reload
    cachedFeatureFlags = null;
    lastModified = 0;
    
    console.info(`Updated feature flags at ${featureFlagsPath}`);
  } catch (error) {
    console.error(`Error updating feature flags: ${error}`);
    throw error;
  }
}
