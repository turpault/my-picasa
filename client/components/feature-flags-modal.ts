import { $, _$ } from "../lib/dom";
import { featureFlagService } from "../lib/feature-flags";
import { FeatureFlags, FeatureFlag } from "../../shared/types/feature-flags";

export function makeFeatureFlagsModal(): _$ {
  const modal = $(`
    <div id="feature-flags-modal" class="w3-modal" style="display: none;">
      <div class="w3-modal-content w3-card-4" style="max-width: 600px; margin-top: 50px;">
        <header class="w3-container w3-theme">
          <span class="w3-button w3-display-topright close-feature-flags-modal">&times;</span>
          <h2>Feature Flags</h2>
        </header>
        <div class="w3-container feature-flags-content">
          <p>Loading feature flags...</p>
        </div>
        <footer class="w3-container w3-theme">
          <button class="w3-button w3-green save-feature-flags">Save Changes</button>
          <button class="w3-button w3-grey cancel-feature-flags">Cancel</button>
        </footer>
      </div>
    </div>
  `);

  let currentFlags: FeatureFlags | null = null;
  let originalFlags: FeatureFlags | null = null;

  // Load and display feature flags
  async function loadFeatureFlags() {
    try {
      currentFlags = await featureFlagService.getAllFeatureFlags();
      originalFlags = JSON.parse(JSON.stringify(currentFlags)); // Deep copy
      renderFeatureFlags();
    } catch (error) {
      console.error("Error loading feature flags:", error);
      $(".feature-flags-content", modal).innerHTML(`
        <div class="w3-panel w3-red">
          <p>Error loading feature flags: ${error}</p>
        </div>
      `);
    }
  }

  function renderFeatureFlags() {
    if (!currentFlags) return;

    const flagsHtml = Object.entries(currentFlags.flags).map(([flagName, flag]) => `
      <div class="w3-panel w3-border w3-round">
        <div class="w3-row">
          <div class="w3-col" style="width: 70%">
            <h4>${flagName}</h4>
            <p class="w3-text-grey">${flag.description}</p>
          </div>
          <div class="w3-col" style="width: 30%; text-align: right; padding-top: 10px;">
            <label class="w3-switch">
              <input type="checkbox" 
                     class="feature-flag-toggle" 
                     data-flag-name="${flagName}" 
                     ${flag.enabled ? 'checked' : ''}>
              <span class="w3-slider w3-round"></span>
            </label>
          </div>
        </div>
      </div>
    `).join('');

    $(".feature-flags-content", modal).innerHTML(`
      <div class="w3-panel">
        <p>Toggle feature flags on or off. Changes will be saved to the configuration file.</p>
      </div>
      ${flagsHtml}
    `);
  }

  // Event handlers - set up after modal is created
  function setupEventHandlers() {
    $(".close-feature-flags-modal", modal).on("click", () => {
      modal.hide();
    });

    $(".cancel-feature-flags", modal).on("click", () => {
      if (originalFlags) {
        currentFlags = JSON.parse(JSON.stringify(originalFlags));
        renderFeatureFlags();
      }
      modal.hide();
    });

    $(".save-feature-flags", modal).on("click", async () => {
      if (!currentFlags) return;

      try {
        // Update flags based on toggle states
        const toggles = modal.all(".feature-flag-toggle");
        toggles.forEach((toggle: _$) => {
          const flagName = toggle.attr("data-flag-name");
          if (flagName && currentFlags) {
            currentFlags.flags[flagName].enabled = (toggle.get() as HTMLInputElement).checked;
          }
        });

        // Save changes
        await featureFlagService.updateFeatureFlags(currentFlags);
        
        // Show success message
        const contentDiv = $(".feature-flags-content", modal);
        const successMsg = $(`
          <div class="w3-panel w3-green w3-display-container">
            <span class="w3-button w3-display-topright" onclick="this.parentElement.style.display='none'">&times;</span>
            <p>Feature flags updated successfully!</p>
          </div>
        `);
        contentDiv.get().insertBefore(successMsg.get(), contentDiv.get().firstChild);

        // Update original flags
        originalFlags = JSON.parse(JSON.stringify(currentFlags));
        
        // Hide modal after a short delay
        setTimeout(() => {
          modal.hide();
        }, 1500);

      } catch (error) {
        console.error("Error saving feature flags:", error);
        const contentDiv = $(".feature-flags-content", modal);
        const errorMsg = $(`
          <div class="w3-panel w3-red">
            <p>Error saving feature flags: ${error}</p>
          </div>
        `);
        contentDiv.get().insertBefore(errorMsg.get(), contentDiv.get().firstChild);
      }
    });

    // Close modal when clicking outside
    modal.on("click", (e) => {
      if (e.target === modal.get()) {
        modal.hide();
      }
    });

    // Load flags when modal is shown
    modal.on("show", loadFeatureFlags);
  }

  // Set up event handlers after modal is created
  setupEventHandlers();

  return modal;
}
