import { useState, useCallback } from "react";
import { usePicisaService } from "../../context/AppContext";
import { Modal } from "./Modal";
import { t } from "../strings";
import type { Bug } from "../../../shared/types/types";

export function BugWidget() {
  const service = usePicisaService();
  const [showModal, setShowModal] = useState(false);
  const [description, setDescription] = useState("");
  const [tooltip, setTooltip] = useState("");

  const handleSubmit = useCallback(async () => {
    if (!description.trim() || !service) return;
    await service.addBug(description);
    setDescription("");
    setShowModal(false);
  }, [description, service]);

  const handleMouseEnter = useCallback(async () => {
    if (!service) return;
    setTooltip(t("Loading bugs..."));
    const bugs = ((await service.getBugs()) ?? []) as Bug[];
    const text = bugs.map((b) => `${t(b.status)}: ${b.description}`).join("\n");
    setTooltip(text || t("No bugs"));
  }, [service]);

  return (
    <>
      <button
        className="bug-widget-button"
        onClick={() => setShowModal(true)}
        onMouseEnter={handleMouseEnter}
        title={tooltip}
      >
        <img src="resources/images/bug.png" alt={t("Report a bug")} />
      </button>

      <Modal
        title={t("What is the bug?")}
        visible={showModal}
        onClose={() => setShowModal(false)}
        buttons={[
          { label: t("Cancel"), value: "cancel" },
          { label: t("Ok"), value: "ok", primary: true },
        ]}
        onButton={(val) => {
          if (val === "ok") handleSubmit();
          else setShowModal(false);
        }}
      >
        <textarea
          className="bug-description-input"
          placeholder={t("Describe the bug")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          style={{ width: "100%" }}
          autoFocus
        />
      </Modal>
    </>
  );
}
