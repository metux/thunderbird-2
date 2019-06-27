/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

const AB_WINDOW_TYPE = "mail:addressbook";
const AB_WINDOW_URI = "chrome://messenger/content/addressbook/addressbook.xul";

const kPABDirectory = 2; // defined in nsDirPrefs.h

// nsIAbCard.idl contains a list of properties that Thunderbird uses. Extensions are not
// restricted to using only these properties, but the following properties cannot
// be modified by an extension.
const hiddenProperties = [
  "DbRowID", "LowercasePrimaryEmail", "LastModifiedDate",
  "PopularityIndex", "RecordKey", "UID",
];

/**
 * Cache of items in the address book "tree".
 *
 * @implements {nsIAbListener}
 * @implements {nsIObserver}
 */
var addressBookCache = new class extends EventEmitter {
  constructor() {
    super();
    this.listenerCount = 0;
    this.flush();
  }
  _makeContactNode(contact, parent) {
    contact.QueryInterface(Ci.nsIAbCard);
    return {
      id: contact.UID,
      parentId: parent.UID,
      type: "contact",
      item: contact,
    };
  }
  _makeDirectoryNode(directory, parent = null) {
    directory.QueryInterface(Ci.nsIAbDirectory);
    let node = {
      id: directory.UID,
      type: directory.isMailList ? "mailingList" : "addressBook",
      item: directory,
    };
    if (parent) {
      node.parentId = parent.UID;
    }
    return node;
  }
  _populateListContacts(mailingList) {
    mailingList.contacts = new Map();
    for (let contact of mailingList.item.addressLists.enumerate()) {
      let newNode = this._makeContactNode(contact, mailingList.item);
      mailingList.contacts.set(newNode.id, newNode);
    }
  }
  getListContacts(mailingList) {
    if (!mailingList.contacts) {
      this._populateListContacts(mailingList);
    }
    return [...mailingList.contacts.values()];
  }
  _populateContacts(addressBook) {
    addressBook.contacts = new Map();
    for (let contact of addressBook.item.childCards) {
      if (!contact.isMailList) {
        let newNode = this._makeContactNode(contact, addressBook.item);
        this._contacts.set(newNode.id, newNode);
        addressBook.contacts.set(newNode.id, newNode);
      }
    }
  }
  getContacts(addressBook) {
    if (!addressBook.contacts) {
      this._populateContacts(addressBook);
    }
    return [...addressBook.contacts.values()];
  }
  _populateMailingLists(parent) {
    parent.mailingLists = new Map();
    for (let mailingList of parent.item.addressLists.enumerate()) {
      let newNode = this._makeDirectoryNode(mailingList, parent.item);
      this._mailingLists.set(newNode.id, newNode);
      parent.mailingLists.set(newNode.id, newNode);
    }
  }
  getMailingLists(parent) {
    if (!parent.mailingLists) {
      this._populateMailingLists(parent);
    }
    return [...parent.mailingLists.values()];
  }
  get addressBooks() {
    if (!this._addressBooks) {
      this._addressBooks = new Map();
      for (let tld of MailServices.ab.directories) {
        if (!tld.readOnly) {
          this._addressBooks.set(tld.UID, this._makeDirectoryNode(tld));
        }
      }
    }
    return this._addressBooks;
  }
  flush() {
    this._contacts = new Map();
    this._mailingLists = new Map();
    this._addressBooks = null;
  }
  findAddressBookById(id) {
    let addressBook = this.addressBooks.get(id);
    if (addressBook) {
      return addressBook;
    }
    throw new ExtensionUtils.ExtensionError(`addressBook with id=${id} could not be found.`);
  }
  findMailingListById(id) {
    if (this._mailingLists.has(id)) {
      return this._mailingLists.get(id);
    }
    for (let addressBook of this.addressBooks.values()) {
      if (!addressBook.mailingLists) {
        this._populateMailingLists(addressBook);
        if (addressBook.mailingLists.has(id)) {
          return addressBook.mailingLists.get(id);
        }
      }
    }
    throw new ExtensionUtils.ExtensionError(`mailingList with id=${id} could not be found.`);
  }
  findContactById(id, bookHint) {
    if (this._contacts.has(id)) {
      return this._contacts.get(id);
    }
    if (bookHint && !bookHint.contacts) {
      this._populateContacts(bookHint);
      if (bookHint.contacts.has(id)) {
        return bookHint.contacts.get(id);
      }
    }
    for (let addressBook of this.addressBooks.values()) {
      if (!addressBook.contacts) {
        this._populateContacts(addressBook);
        if (addressBook.contacts.has(id)) {
          return addressBook.contacts.get(id);
        }
      }
    }
    throw new ExtensionUtils.ExtensionError(`contact with id=${id} could not be found.`);
  }
  convert(node, complete) {
    if (node === null) {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(i => this.convert(i, complete));
    }

    let copy = {};
    for (let key of ["id", "parentId", "type"]) {
      if (key in node) {
        copy[key] = node[key];
      }
    }

    if (complete) {
      if (node.type == "addressBook") {
        copy.mailingLists = this.convert(this.getMailingLists(node), true);
        copy.contacts = this.convert(this.getContacts(node), true);
      }
      if (node.type == "mailingList") {
        copy.contacts = this.convert(this.getListContacts(node), true);
      }
    }

    switch (node.type) {
      case "addressBook":
        copy.name = node.item.dirName;
        copy.readOnly = node.item.readOnly;
        break;
      case "contact": {
        copy.properties = {};
        for (let property of node.item.properties) {
          if (!hiddenProperties.includes(property.name)) {
            switch (property.value) {
            case undefined:
            case null:
            case "":
              // If someone sets a property to one of these values,
              // the property will be deleted from the database.
              // However, the value still appears in the notification,
              // so we ignore it here.
              continue;
            }
            // WebExtensions complains if we use numbers.
            copy.properties[property.name] = "" + property.value;
          }
        }
        break;
      }
      case "mailingList":
        copy.name = node.item.dirName;
        copy.nickName = node.item.listNickName;
        copy.description = node.item.description;
        break;
    }

    return copy;
  }

  // nsIAbListener
  onItemAdded(parent, item) {
    parent.QueryInterface(Ci.nsIAbDirectory);

    if (item instanceof Ci.nsIAbDirectory) {
      item.QueryInterface(Ci.nsIAbDirectory);
      if (item.isMailList) {
        let newNode = this._makeDirectoryNode(item, parent);
        if (this._addressBooks && this._addressBooks.has(parent.UID) && this._addressBooks.get(parent.UID).mailingLists) {
          this._addressBooks.get(parent.UID).mailingLists.set(newNode.id, newNode);
          this._mailingLists.set(newNode.id, newNode);
        }
        this.emit("mailing-list-created", newNode);
      } else if (!item.readOnly) {
        let newNode = this._makeDirectoryNode(item);
        if (this._addressBooks) {
          this._addressBooks.set(newNode.id, newNode);
        }
        this.emit("address-book-created", newNode);
      }
    } else if (item instanceof Ci.nsIAbCard) {
      item.QueryInterface(Ci.nsIAbCard);
      if (!item.isMailList && parent.isMailList) {
        let newNode = this._makeContactNode(item, parent);
        if (this._mailingLists.has(parent.UID) && this._mailingLists.get(parent.UID).contacts) {
          this._mailingLists.get(parent.UID).contacts.set(newNode.id, newNode);
        }
        this.emit("mailing-list-member-added", newNode);
      }
    }
  }
  // nsIAbListener
  onItemRemoved(parent, item) {
    parent = parent.QueryInterface(Ci.nsIAbDirectory);

    if (item instanceof Ci.nsIAbDirectory) {
      item.QueryInterface(Ci.nsIAbDirectory);
      if (item.isMailList) {
        this._mailingLists.delete(item.UID);
        if (this._addressBooks && this._addressBooks.has(parent.UID) && this._addressBooks.get(parent.UID).mailingLists) {
          this._addressBooks.get(parent.UID).mailingLists.delete(item.UID);
        }
        this.emit("mailing-list-deleted", parent, item);
      } else if (!item.readonly) {
        if (this._addressBooks && this._addressBooks.has(item.UID)) {
          if (this._addressBooks.get(item.UID).contacts) {
            for (let id of this._addressBooks.get(item.UID).contacts.keys()) {
              this._contacts.delete(id);
            }
          }
          if (this._addressBooks.get(item.UID).mailingLists) {
            for (let id of this._addressBooks.get(item.UID).mailingLists.keys()) {
              this._mailingLists.delete(id);
            }
          }
          this._addressBooks.delete(item.UID);
        }
        this.emit("address-book-deleted", item);
      }
    } else if (item instanceof Ci.nsIAbCard) {
      item.QueryInterface(Ci.nsIAbCard);
      if (!item.isMailList) {
        if (parent.isMailList) {
          if (this._mailingLists.has(parent.UID)) {
            if (this._mailingLists.get(parent.UID).contacts) {
              this._mailingLists.get(parent.UID).contacts.delete(item.UID);
            }
          }
          this.emit("mailing-list-member-removed", parent, item);
        } else {
          this._contacts.delete(item.UID);
          if (this._addressBooks && this._addressBooks.has(parent.UID)) {
            if (this._addressBooks.get(parent.UID).contacts) {
              this._addressBooks.get(parent.UID).contacts.delete(item.UID);
            }
          }
          this.emit("contact-deleted", parent, item);
        }
      }
    }
  }
  // nsIAbListener
  onItemPropertyChanged(item, property, oldValue, newValue) {
    if (item instanceof Ci.nsIAbDirectory) {
      item.QueryInterface(Ci.nsIAbDirectory);
      if (!item.isMailList) {
        this.emit("address-book-updated", this._makeDirectoryNode(item));
      }
    }
  }

  // nsIObserver
  observe(subject, topic, data) {
    switch (topic) {
      case "addrbook-contact-created": {
        let parentNode = this.findAddressBookById(data);
        let newNode = this._makeContactNode(subject, parentNode.item);
        if (this._addressBooks.has(data) && this._addressBooks.get(data).contacts) {
          this._addressBooks.get(data).contacts.set(newNode.id, newNode);
          this._contacts.set(newNode.id, newNode);
        }
        this.emit("contact-created", newNode);
        break;
      }
      case "addrbook-contact-updated": {
        let parentNode = this.findAddressBookById(data);
        let newNode = this._makeContactNode(subject, parentNode.item);
        if (this._addressBooks.has(data) && this._addressBooks.get(data).contacts) {
          this._addressBooks.get(data).contacts.set(newNode.id, newNode);
          this._contacts.set(newNode.id, newNode);
        }
        if (this._addressBooks.has(data) && this._addressBooks.get(data).mailingLists) {
          for (let mailingList of this._addressBooks.get(data).mailingLists.values()) {
            if (mailingList.contacts && mailingList.contacts.has(newNode.id)) {
              mailingList.contacts.get(newNode.id).item = subject;
            }
          }
        }
        this.emit("contact-updated", newNode);
        break;
      }
      case "addrbook-list-updated": {
        subject.QueryInterface(Ci.nsIAbDirectory);
        this.emit("mailing-list-updated", this.findMailingListById(subject.UID));
        break;
      }
      case "addrbook-list-member-added": {
        let parentNode = this.findMailingListById(data);
        let newNode = this._makeContactNode(subject, parentNode.item);
        if (this._mailingLists.has(data) && this._mailingLists.get(data).contacts) {
          this._mailingLists.get(data).contacts.set(newNode.id, newNode);
        }
        this.emit("mailing-list-member-added", newNode);
        break;
      }
    }
  }

  incrementListeners() {
    this.listenerCount++;
    if (this.listenerCount == 1) {
      MailServices.ab.addAddressBookListener(this, Ci.nsIAbListener.all);
      Services.obs.addObserver(this, "addrbook-contact-created");
      Services.obs.addObserver(this, "addrbook-contact-updated");
      Services.obs.addObserver(this, "addrbook-list-updated");
      Services.obs.addObserver(this, "addrbook-list-member-added");
    }
  }
  decrementListeners() {
    this.listenerCount--;
    if (this.listenerCount == 0) {
      MailServices.ab.removeAddressBookListener(this);
      Services.obs.removeObserver(this, "addrbook-contact-created");
      Services.obs.removeObserver(this, "addrbook-contact-updated");
      Services.obs.removeObserver(this, "addrbook-list-updated");
      Services.obs.removeObserver(this, "addrbook-list-member-added");

      this.flush();
    }
  }
};

this.addressBook = class extends ExtensionAPI {
  onShutdown() {
    addressBookCache.decrementListeners();
  }

  getAPI(context) {
    addressBookCache.incrementListeners();

    return {
      addressBooks: {
        async openUI() {
          let topWindow = Services.wm.getMostRecentWindow(AB_WINDOW_TYPE);
          if (!topWindow) {
            topWindow = Services.ww.openWindow(
              null, AB_WINDOW_URI, "_blank",
              "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar", null
            );
          }
          if (topWindow.document.readyState != "complete") {
            await new Promise((resolve) => {
              topWindow.addEventListener("load", resolve, { once: true });
            });
          }
          topWindow.focus();
        },
        async closeUI() {
          for (let win of Services.wm.getEnumerator(AB_WINDOW_TYPE)) {
            win.close();
          }
        },

        list(complete = false) {
          return addressBookCache.convert([...addressBookCache.addressBooks.values()], complete);
        },
        get(id, complete = false) {
          return addressBookCache.convert(addressBookCache.findAddressBookById(id), complete);
        },
        create({ name }) {
          let dirName = MailServices.ab.newAddressBook(name, "", kPABDirectory);
          let directory = MailServices.ab.getDirectoryFromId(dirName);
          return directory.UID;
        },
        update(id, { name }) {
          let node = addressBookCache.findAddressBookById(id);
          node.item.dirName = name;
        },
        delete(id) {
          let node = addressBookCache.findAddressBookById(id);
          MailServices.ab.deleteAddressBook(node.item.URI);
        },

        onCreated: new EventManager({
          context,
          name: "addressBooks.onCreated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("address-book-created", listener);
            return () => {
              addressBookCache.off("address-book-created", listener);
            };
          },
        }).api(),
        onUpdated: new EventManager({
          context,
          name: "addressBooks.onUpdated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("address-book-updated", listener);
            return () => {
              addressBookCache.off("address-book-updated", listener);
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "addressBooks.onDeleted",
          register: fire => {
            let listener = (event, item) => {
              fire.sync(item.UID);
            };

            addressBookCache.on("address-book-deleted", listener);
            return () => {
              addressBookCache.off("address-book-deleted", listener);
            };
          },
        }).api(),
      },
      contacts: {
        list(parentId) {
          let parentNode = addressBookCache.findAddressBookById(parentId);
          return addressBookCache.convert(addressBookCache.getContacts(parentNode), false);
        },
        quickSearch(parentId, searchString) {
          const {
            getSearchTokens,
            getModelQuery,
            generateQueryURI,
          } = ChromeUtils.import("resource:///modules/ABQueryUtils.jsm");

          let searchWords = getSearchTokens(searchString);
          if (searchWords.length == 0) {
            return [];
          }
          let searchFormat = getModelQuery("mail.addr_book.quicksearchquery.format");

          let results = [];
          let booksToSearch;
          if (parentId == null) {
            booksToSearch = [...addressBookCache.addressBooks.values()];
          } else {
            booksToSearch = [addressBookCache.findAddressBookById(parentId)];
          }
          for (let book of booksToSearch) {
            let searchURI = book.item.URI + generateQueryURI(searchFormat, searchWords);
            for (let contact of MailServices.ab.getDirectory(searchURI).childCards) {
              results.push(addressBookCache.findContactById(contact.UID, book));
            }
          }

          return addressBookCache.convert(results, false);
        },
        get(id) {
          return addressBookCache.convert(addressBookCache.findContactById(id), false);
        },
        create(parentId, id, properties) {
          let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
          for (let [name, value] of Object.entries(properties)) {
            if (!hiddenProperties.includes(name)) {
              card.setProperty(name, value);
            }
          }
          if (id) {
            let duplicateExists = false;
            try {
              // Second argument is only a hint, all address books are checked.
              addressBookCache.findContactById(id, parentId);
              duplicateExists = true;
            } catch (ex) {
              // Do nothing. We want this to throw because no contact was found.
            }
            if (duplicateExists) {
              throw new ExtensionError(`Duplicate contact id: ${id}`);
            }
            card.UID = id;
          }
          let parentNode = addressBookCache.findAddressBookById(parentId);
          let newCard = parentNode.item.addCard(card);
          return newCard.UID;
        },
        update(id, properties) {
          let node = addressBookCache.findContactById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);

          for (let [name, value] of Object.entries(properties)) {
            if (!hiddenProperties.includes(name)) {
              node.item.setProperty(name, value);
            }
          }
          parentNode.item.modifyCard(node.item);
        },
        delete(id) {
          let node = addressBookCache.findContactById(id);
          let parentNode = addressBookCache.findAddressBookById(node.parentId);

          let cardArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
          cardArray.appendElement(node.item);
          parentNode.item.deleteCards(cardArray);
        },

        onCreated: new EventManager({
          context,
          name: "contacts.onCreated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("contact-created", listener);
            return () => {
              addressBookCache.off("contact-created", listener);
            };
          },
        }).api(),
        onUpdated: new EventManager({
          context,
          name: "contacts.onUpdated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("contact-updated", listener);
            return () => {
              addressBookCache.off("contact-updated", listener);
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "contacts.onDeleted",
          register: fire => {
            let listener = (event, parent, item) => {
              fire.sync(parent.UID, item.UID);
            };

            addressBookCache.on("contact-deleted", listener);
            return () => {
              addressBookCache.off("contact-deleted", listener);
            };
          },
        }).api(),
      },
      mailingLists: {
        list(parentId) {
          let parentNode = addressBookCache.findAddressBookById(parentId);
          return addressBookCache.convert(addressBookCache.getMailingLists(parentNode), false);
        },
        get(id) {
          return addressBookCache.convert(addressBookCache.findMailingListById(id), false);
        },
        create(parentId, { name, nickName, description }) {
          let mailList = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(Ci.nsIAbDirectory);
          mailList.isMailList = true;
          mailList.dirName = name;
          mailList.listNickName = (nickName === null) ? "" : nickName;
          mailList.description = (description === null) ? "" : description;

          let parentNode = addressBookCache.findAddressBookById(parentId);
          let newMailList = parentNode.item.addMailList(mailList);
          return newMailList.UID;
        },
        update(id, { name, nickName, description }) {
          let node = addressBookCache.findMailingListById(id);
          node.item.dirName = name;
          node.item.listNickName = (nickName === null) ? "" : nickName;
          node.item.description = (description === null) ? "" : description;
          node.item.editMailListToDatabase(null);
        },
        delete(id) {
          let node = addressBookCache.findMailingListById(id);
          MailServices.ab.deleteAddressBook(node.item.URI);
        },

        listMembers(id) {
          let node = addressBookCache.findMailingListById(id);
          return addressBookCache.convert(addressBookCache.getListContacts(node), false);
        },
        addMember(id, contactId) {
          let node = addressBookCache.findMailingListById(id);
          let contactNode = addressBookCache.findContactById(contactId);
          node.item.addCard(contactNode.item);
        },
        removeMember(id, contactId) {
          let node = addressBookCache.findMailingListById(id);
          let contactNode = addressBookCache.findContactById(contactId);

          let cardArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
          cardArray.appendElement(contactNode.item);
          node.item.deleteCards(cardArray);
        },

        onCreated: new EventManager({
          context,
          name: "mailingLists.onCreated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("mailing-list-created", listener);
            return () => {
              addressBookCache.off("mailing-list-created", listener);
            };
          },
        }).api(),
        onUpdated: new EventManager({
          context,
          name: "mailingLists.onUpdated",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("mailing-list-updated", listener);
            return () => {
              addressBookCache.off("mailing-list-updated", listener);
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "mailingLists.onDeleted",
          register: fire => {
            let listener = (event, parent, item) => {
              fire.sync(parent.UID, item.UID);
            };

            addressBookCache.on("mailing-list-deleted", listener);
            return () => {
              addressBookCache.off("mailing-list-deleted", listener);
            };
          },
        }).api(),
        onMemberAdded: new EventManager({
          context,
          name: "mailingLists.onMemberAdded",
          register: fire => {
            let listener = (event, node) => {
              fire.sync(addressBookCache.convert(node));
            };

            addressBookCache.on("mailing-list-member-added", listener);
            return () => {
              addressBookCache.off("mailing-list-member-added", listener);
            };
          },
        }).api(),
        onMemberRemoved: new EventManager({
          context,
          name: "mailingLists.onMemberRemoved",
          register: fire => {
            let listener = (event, parent, item) => {
              fire.sync(parent.UID, item.UID);
            };

            addressBookCache.on("mailing-list-member-removed", listener);
            return () => {
              addressBookCache.off("mailing-list-member-removed", listener);
            };
          },
        }).api(),
      },
    };
  }
};
