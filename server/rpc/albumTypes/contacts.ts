import Debug from "debug";

import {
  buildReadySemaphore,
  mergeObjects,
  setReady,
} from "../../../shared/lib/utils";
import { Contact } from "../../../shared/types/types";
import {
  getContactsFromAlbum,
  updateContactInAlbum,
} from "../rpcFunctions/picasa-ini";
import { getFolderAlbums } from "../../media";
const contacts = new Map<string, Contact>();
const contactsByContactKey = new Map<string, Contact>();

const debug = Debug("app:contacts");
const readyLabelKey = "contact-list-ready";
const ready = buildReadySemaphore(readyLabelKey);

export async function buildContactList() {
  const albums = await getFolderAlbums();
  for (const album of albums) {
    const contactsInFile = await getContactsFromAlbum(album);
    for (const [hash, contact] of Object.entries(contactsInFile)) {
      const updatedContact = mergeObjects(
        contactsByContactKey.get(contact.key),
        contact,
      );
      contactsByContactKey.set(contact.key, updatedContact);
      contacts.set(hash, updatedContact);
      // Update the contact in the album
      updateContactInAlbum(album, hash, contact);
    }
  }
  debug(`Contact list built : ${contacts.size} contacts`);
  setReady(readyLabelKey);
}

export async function getContactByContactKey(contactKey: string) {
  await ready;
  return contactsByContactKey.get(contactKey);
}
export async function getContactByHash(hash: string) {
  await ready;
  return contacts.get(hash);
}

export async function getContacts() {
  await ready;
  return Array.from(contacts.values());
}
