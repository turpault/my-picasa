import { AppProvider } from "./context/AppContext";
import { SettingsProvider } from "./context/SettingsProvider";
import { CacheBustProvider } from "./context/CacheBustProvider";
import {
  AlbumsCacheProvider,
  ShortcutsCacheProvider,
  ContactsCacheProvider,
  ProjectsCacheProvider,
} from "./context/caches";
import { AppShell } from "./components/AppShell";

export function App() {
  return (
    <AppProvider>
      <SettingsProvider>
        <CacheBustProvider>
          <AlbumsCacheProvider>
            <ShortcutsCacheProvider>
              <ContactsCacheProvider>
                <ProjectsCacheProvider>
                  <AppShell />
                </ProjectsCacheProvider>
              </ContactsCacheProvider>
            </ShortcutsCacheProvider>
          </AlbumsCacheProvider>
        </CacheBustProvider>
      </SettingsProvider>
    </AppProvider>
  );
}
