import { $ } from "../lib/dom";
import { featureFlagService } from "../lib/feature-flags";
import { FeatureFlags, FeatureFlag } from "../../shared/types/feature-flags";

export function makeFeatureFlagsModal(): _$ {
  const modal = $(`
    <div id="feature-flags-modal" class="w3-modal" style="display: none;">
      <div class="w3-modal-content w3-card-4" style="max-width: 600px; margin-top: 50px;">
        <header class="w3-container w3-theme">
          <span class="w3-button w3-display-topright" id="close-feature-flags-modal">&times;</span>
          <h2>Feature Flags</h2>
        </header>
        <div class="w3-container" id="feature-flags-content">
          <p>Loading feature flags...</p>
        </div>
        <footer class="w3-container w3-theme">
          <button class="w3-button w3-green" id="save-feature-flags">Save Changes</button>
          <button class="w3-button w3-grey" id="cancel-feature-flags">Cancel</button>
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
      $("#feature-flags-content").html(`
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

    $("#feature-flags-content").html(`
      <div class="w3-panel">
        <p>Toggle feature flags on or off. Changes will be saved to the configuration file.</p>
      </div>
      ${flagsHtml}
    `);
  }

  // Event handlers - set up after modal is created
  function setupEventHandlers() {
    modal.find("#close-feature-flags-modal").on("click", () => {
      modal.hide();
    });

    modal.find("#cancel-feature-flags").on("click", () => {
      if (originalFlags) {
        currentFlags = JSON.parse(JSON.stringify(originalFlags));
        renderFeatureFlags();
      }
      modal.hide();
    });

    modal.find("#save-feature-flags").on("click", async () => {
      if (!currentFlags) return;

      try {
        // Update flags based on toggle states
        const toggles = modal.find(".feature-flag-toggle");
        toggles.forEach((toggle: HTMLInputElement) => {
          const flagName = toggle.getAttribute("data-flag-name");
          if (flagName && currentFlags) {
            currentFlags.flags[flagName].enabled = toggle.checked;
          }
        });

        // Save changes
        await featureFlagService.updateFeatureFlags(currentFlags);
        
        // Show success message
        modal.find("#feature-flags-content").prepend(`
          <div class="w3-panel w3-green w3-display-container">
            <span class="w3-button w3-display-topright" onclick="this.parentElement.style.display='none'">&times;</span>
            <p>Feature flags updated successfully!</p>
          </div>
        `);

        // Update original flags
        originalFlags = JSON.parse(JSON.stringify(currentFlags));
        
        // Hide modal after a short delay
        setTimeout(() => {
          modal.hide();
        }, 1500);

      } catch (error) {
        console.error("Error saving feature flags:", error);
        modal.find("#feature-flags-content").prepend(`
          <div class="w3-panel w3-red">
            <p>Error saving feature flags: ${error}</p>
          </div>
        `);
      }
    });

    // Close modal when clicking outside
    modal.on("click", (e) => {
      if (e.target === modal.get()[0]) {
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
