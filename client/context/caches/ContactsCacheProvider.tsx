import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { usePicisaService, useReconnectVersion } from "../AppContext";
import { events as serverEvents } from "../../../shared/server-events";
import type { Contact } from "../../../shared/types/types";

const ContactsCacheContext = createContext<Contact[]>([]);

export function ContactsCacheProvider({ children }: { children: ReactNode }) {
  const service = usePicisaService();
  const reconnectVersion = useReconnectVersion();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const fetchIdRef = useRef(0);

  const fetchContacts = useCallback(async () => {
    if (!service) return;
    const id = ++fetchIdRef.current;
    const result = await service.getContacts();
    if (id === fetchIdRef.current) {
      setContacts(result);
    }
  }, [service]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts, reconnectVersion]);

  useEffect(() => {
    const offs = [
      serverEvents.on("personImagesChanged", fetchContacts),
      serverEvents.on("albumEntryAdded", fetchContacts),
      serverEvents.on("albumEntryRemoved", fetchContacts),
    ];
    return () => offs.forEach((off) => off());
  }, [fetchContacts]);

  return (
    <ContactsCacheContext.Provider value={contacts}>
      {children}
    </ContactsCacheContext.Provider>
  );
}

export function useContacts(): Contact[] {
  return useContext(ContactsCacheContext);
}
