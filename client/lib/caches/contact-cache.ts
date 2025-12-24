import { buildEmitter, Emitter } from "../../../shared/lib/event";
import { Contact } from "../../../shared/types/types";
import { getService } from "../../rpc/connect";
import { events as serverEvents } from "../../../shared/server-events";

export type ContactCacheEvent = {
  contactsChanged: { contacts: Contact[] };
  personImagesChanged: { person: Contact };
};

export class ContactCache {
  private contacts: Contact[] = [];
  public readonly emitter: Emitter<ContactCacheEvent>;

  constructor() {
    this.emitter = buildEmitter<ContactCacheEvent>();
  }

  async init() {
    await this.refresh();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    serverEvents.on("personImagesChanged", async ({ person }) => {
      await this.refresh();
      this.emitter.emit("personImagesChanged", { person });
    });
    
    // Also refresh on album changes to catch any contact list changes
    serverEvents.on("albumAdded", async () => {
      await this.refresh();
    });
    serverEvents.on("albumUpdated", async () => {
      await this.refresh();
    });
    serverEvents.on("albumRemoved", async () => {
      await this.refresh();
    });
    serverEvents.on("albumEntryAdded", async () => {
      await this.refresh();
    });
    serverEvents.on("albumEntryRemoved", async () => {
      await this.refresh();
    });
    serverEvents.on("albumEntryUpdated", async () => {
      await this.refresh();
    });
  }

  async refresh() {
    const s = await getService();
    this.contacts = await s.getContacts();
    this.emitter.emit("contactsChanged", { contacts: this.contacts });
  }

  getContacts(): Contact[] {
    return [...this.contacts];
  }
}

let cacheInstance: ContactCache | undefined;

export function getContactCache(): ContactCache {
  if (!cacheInstance) {
    cacheInstance = new ContactCache();
  }
  return cacheInstance;
}
