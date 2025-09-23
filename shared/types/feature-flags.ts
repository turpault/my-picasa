export interface FeatureFlag {
  enabled: boolean;
  description: string;
}

export interface FeatureFlags {
  version: string;
  flags: Record<string, FeatureFlag>;
}

export interface FeatureFlagConfig {
  [key: string]: FeatureFlag;
}
