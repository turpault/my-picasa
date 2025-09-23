import { $ } from "../lib/dom";
import { featureFlagService } from "../lib/feature-flags";

export function makeFeatureFlagDemo(): HTMLElement {
  const container = $("div", { className: "feature-flag-demo" });
  
  // Create a simple demo that shows feature flag status
  const title = $("h3", { textContent: "Feature Flags Demo" });
  const statusContainer = $("div", { className: "feature-flag-status" });
  
  container.appendChild(title);
  container.appendChild(statusContainer);
  
  // Load and display feature flags
  loadAndDisplayFeatureFlags(statusContainer);
  
  return container;
}

async function loadAndDisplayFeatureFlags(container: HTMLElement) {
  try {
    const flags = await featureFlagService.getAllFeatureFlags();
    
    const versionInfo = $("p", { 
      textContent: `Feature Flags Version: ${flags.version}` 
    });
    container.appendChild(versionInfo);
    
    const flagsList = $("ul", { className: "feature-flags-list" });
    
    for (const [flagName, flag] of Object.entries(flags.flags)) {
      const listItem = $("li", { className: "feature-flag-item" });
      
      const status = flag.enabled ? "✅ Enabled" : "❌ Disabled";
      const flagText = $("span", { 
        textContent: `${flagName}: ${status}` 
      });
      
      const description = $("p", { 
        textContent: flag.description,
        className: "feature-flag-description"
      });
      
      listItem.appendChild(flagText);
      listItem.appendChild(description);
      flagsList.appendChild(listItem);
    }
    
    container.appendChild(flagsList);
    
  } catch (error) {
    const errorMsg = $("p", { 
      textContent: `Error loading feature flags: ${error}`,
      className: "error"
    });
    container.appendChild(errorMsg);
  }
}

// Example of how to conditionally show/hide features based on flags
export async function createConditionalFeature(flagName: string, createFeature: () => HTMLElement): Promise<HTMLElement | null> {
  const isEnabled = await featureFlagService.isFeatureEnabled(flagName);
  
  if (isEnabled) {
    return createFeature();
  }
  
  return null;
}

// Example usage:
// const newUIComponent = await createConditionalFeature("enableNewUI", () => {
//   return $("div", { textContent: "New UI Feature" });
// });
// if (newUIComponent) {
//   document.body.appendChild(newUIComponent);
// }
