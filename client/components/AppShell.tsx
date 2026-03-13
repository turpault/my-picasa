import { useEffect, useCallback, useRef, useState } from "react";
import { useAppEmitter, type TabKind } from "../context/AppContext";
import { t } from "./strings";
import { GalleryPage } from "./pages/GalleryPage";
import { MosaicPage } from "./pages/MosaicPage";
import { SlideshowPage } from "./pages/SlideshowPage";

type TabDescriptor = {
  id: string;
  kind: TabKind;
  label: string;
  data?: any;
};

function BrowserPage() {
  return <div className="fill">{t("Browser")}</div>;
}

function EditorPage({ entry }: { entry: any }) {
  return <div className="fill">Editor: {entry?.name}</div>;
}

function makeBrowserTab(): TabDescriptor {
  return {
    id: crypto.randomUUID(),
    kind: "Browser",
    label: t("Browser"),
  };
}

export function AppShell() {
  const appEmitter = useAppEmitter();
  const [tabs, setTabs] = useState<TabDescriptor[]>(() => [makeBrowserTab()]);
  const [activeIndex, setActiveIndex] = useState(0);
  const tabsRef = useRef(tabs);
  const activeIndexRef = useRef(activeIndex);

  tabsRef.current = tabs;
  activeIndexRef.current = activeIndex;

  const closeTabAt = useCallback((index: number) => {
    setTabs((prev) => {
      if (prev[index]?.kind === "Browser") return prev;
      const next = prev.filter((_, i) => i !== index);
      const currentActive = activeIndexRef.current;
      if (index <= currentActive) {
        setActiveIndex(Math.max(0, currentActive - 1));
      }
      return next;
    });
  }, []);

  const selectBrowserAndCloseCurrent = useCallback(() => {
    const browserIdx = tabsRef.current.findIndex((t) => t.kind === "Browser");
    const current = activeIndexRef.current;
    if (browserIdx >= 0) setActiveIndex(browserIdx);
    if (current !== browserIdx) closeTabAt(current);
  }, [closeTabAt]);

  useEffect(() => {
    const off: Array<() => void> = [];

    off.push(
      appEmitter.on("edit", ({ entry }) => {
        setTabs((prev) => {
          const tab: TabDescriptor = {
            id: crypto.randomUUID(),
            kind: "Editor",
            label: entry.name,
            data: { entry },
          };
          const next = [...prev, tab];
          setActiveIndex(next.length - 1);
          return next;
        });
      }),
    );

    off.push(
      appEmitter.on("gallery", ({ initialList, initialIndex }) => {
        setTabs((prev) => {
          const tab: TabDescriptor = {
            id: crypto.randomUUID(),
            kind: "Gallery",
            label: t("Gallery"),
            data: { initialList, initialIndex },
          };
          const next = [...prev, tab];
          setActiveIndex(next.length - 1);
          return next;
        });
      }),
    );

    off.push(
      appEmitter.on("mosaic", ({ initialList }) => {
        const name = prompt(t("Mosaic Name"), t("New mosaic"));
        if (!name) return;
        setTabs((prev) => {
          const tab: TabDescriptor = {
            id: crypto.randomUUID(),
            kind: "Mosaic",
            label: name,
            data: { project: { name, entries: initialList } },
          };
          const next = [...prev, tab];
          setActiveIndex(next.length - 1);
          return next;
        });
      }),
    );

    off.push(
      appEmitter.on("slideshow", ({ initialList }) => {
        const name = prompt(t("Slideshow Name"), t("Slideshow"));
        if (!name) return;
        setTabs((prev) => {
          const tab: TabDescriptor = {
            id: crypto.randomUUID(),
            kind: "Slideshow",
            label: name,
            data: { project: { name, entries: initialList } },
          };
          const next = [...prev, tab];
          setActiveIndex(next.length - 1);
          return next;
        });
      }),
    );

    off.push(
      appEmitter.on("returnToBrowser", () => {
        selectBrowserAndCloseCurrent();
      }),
    );

    return () => off.forEach((fn) => fn());
  }, [appEmitter, selectBrowserAndCloseCurrent]);

  useEffect(() => {
    function onKeyUp(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      appEmitter.emit("keyDown", {
        code: e.code,
        key: e.key,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        preventDefault: () => e.preventDefault(),
      });
    }
    document.addEventListener("keyup", onKeyUp);
    return () => document.removeEventListener("keyup", onKeyUp);
  }, [appEmitter]);

  const activeTab = tabs[activeIndex];

  function renderPage(tab: TabDescriptor) {
    switch (tab.kind) {
      case "Browser":
        return <BrowserPage />;
      case "Editor":
        return <EditorPage entry={tab.data.entry} />;
      case "Gallery":
        return (
          <GalleryPage
            initialList={tab.data.initialList}
            initialIndex={tab.data.initialIndex}
            onClose={() => closeTabAt(activeIndex)}
          />
        );
      case "Mosaic":
        return (
          <MosaicPage
            project={tab.data.project}
            onClose={() => closeTabAt(activeIndex)}
          />
        );
      case "Slideshow":
        return (
          <SlideshowPage
            project={tab.data.project}
            onClose={() => closeTabAt(activeIndex)}
          />
        );
      default:
        return <div>{t("Not implemented yet")}</div>;
    }
  }

  return (
    <div className="fill">
      <div className="w3-bar main-tab-bar">
        <div className="underline-bar"></div>
        <div className="tabs">
          {tabs.map((tab, idx) => (
            <a
              key={tab.id}
              className={`tab-button${idx === activeIndex ? " tab-button-highlight" : ""}`}
              onClick={() => setActiveIndex(idx)}
            >
              <span className="label">{tab.label}</span>
              {tab.kind !== "Browser" && (
                <span
                  className="remove-tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTabAt(idx);
                  }}
                >
                  &times;
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
      <div className="workarea">{activeTab && renderPage(activeTab)}</div>
    </div>
  );
}
