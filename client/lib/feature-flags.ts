import { FeatureFlags, FeatureFlag } from "../../shared/types/feature-flags";
import { PicisaClient } from "../rpc/generated-rpc/PicisaClient";

class FeatureFlagService {
  private featureFlags: FeatureFlags | null = null;
  private client: PicisaClient | null = null;
  private loadingPromise: Promise<FeatureFlags> | null = null;

  setClient(client: PicisaClient) {
    this.client = client;
  }

  async loadFeatureFlags(): Promise<FeatureFlags> {
    if (this.featureFlags) {
      return this.featureFlags;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    if (!this.client) {
      throw new Error("Feature flag client not initialized");
    }

    this.loadingPromise = this.client.getFeatureFlags().then((flags: FeatureFlags) => {
      this.featureFlags = flags;
      this.loadingPromise = null;
      return flags;
    });

    return this.loadingPromise;
  }

  async isFeatureEnabled(flagName: string): Promise<boolean> {
    const flags = await this.loadFeatureFlags();
    return flags.flags[flagName]?.enabled || false;
  }

  async getFeatureFlag(flagName: string): Promise<FeatureFlag | null> {
    const flags = await this.loadFeatureFlags();
    return flags.flags[flagName] || null;
  }

  async getAllFeatureFlags(): Promise<FeatureFlags> {
    return this.loadFeatureFlags();
  }

  // Helper method to check multiple flags at once
  async areFeaturesEnabled(flagNames: string[]): Promise<Record<string, boolean>> {
    const flags = await this.loadFeatureFlags();
    const result: Record<string, boolean> = {};
    
    for (const flagName of flagNames) {
      result[flagName] = flags.flags[flagName]?.enabled || false;
    }
    
    return result;
  }

  // Clear cache to force reload on next access
  clearCache() {
    this.featureFlags = null;
    this.loadingPromise = null;
  }
}

// Export a singleton instance
export const featureFlagService = new FeatureFlagService();
