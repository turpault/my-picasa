import { useState, useEffect, useCallback } from "react";
import { Modal } from "./Modal";
import { usePicisaService } from "../../context/AppContext";
import { t } from "../strings";
import type { FeatureFlags } from "../../../shared/types/feature-flags";

interface FeatureFlagsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FeatureFlagsModal({ visible, onClose }: FeatureFlagsModalProps) {
  const service = usePicisaService();
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !service) return;
    setError(null);
    service.getFeatureFlags().then(setFlags).catch((e) => setError(String(e)));
  }, [visible, service]);

  const toggleFlag = useCallback((name: string) => {
    setFlags((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        flags: {
          ...prev.flags,
          [name]: { ...prev.flags[name], enabled: !prev.flags[name].enabled },
        },
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!flags || !service) return;
    try {
      await service.updateFeatureFlags(flags);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  }, [flags, service, onClose]);

  return (
    <Modal
      title={t("Feature Flags")}
      visible={visible}
      onClose={onClose}
      buttons={[
        { label: t("Cancel"), value: "cancel" },
        { label: t("Save Changes"), value: "save", primary: true },
      ]}
      onButton={(val) => {
        if (val === "save") handleSave();
        else onClose();
      }}
    >
      {error && (
        <div className="w3-panel w3-red">
          <p>{error}</p>
        </div>
      )}
      {!flags && !error && <p>{t("Loading")}...</p>}
      {flags &&
        Object.entries(flags?.flags ?? {}).map(([name, flag]) => (
          <div key={name} className="w3-panel w3-border w3-round" style={{ padding: "8px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{name}</strong>
                <p className="w3-text-grey" style={{ margin: "4px 0 0" }}>
                  {flag.description}
                </p>
              </div>
              <label style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={flag.enabled}
                  onChange={() => toggleFlag(name)}
                />
              </label>
            </div>
          </div>
        ))}
    </Modal>
  );
}
