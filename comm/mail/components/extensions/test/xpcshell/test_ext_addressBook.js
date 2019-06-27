/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {ExtensionTestUtils} = ChromeUtils.import("resource://testing-common/ExtensionXPCShellUtils.jsm");
ExtensionTestUtils.init(this);

add_task(async function test_addressBooks() {
  async function background() {
    let firstBookId, secondBookId, newContactId;

    let events = [];
    for (let eventNamespace of ["addressBooks", "contacts", "mailingLists"]) {
      for (let eventName of ["onCreated", "onUpdated", "onDeleted", "onMemberAdded", "onMemberRemoved"]) {
        if (eventName in browser[eventNamespace]) {
          browser[eventNamespace][eventName].addListener((...args) => {
            events.push({ namespace: eventNamespace, name: eventName, args });
          });
        }
      }
    }

    let checkEvents = function(...expectedEvents) {
      browser.test.assertEq(expectedEvents.length, events.length, "Correct number of events");

      if (expectedEvents.length != events.length) {
        for (let event of events) {
          let args = event.args.join(", ");
          browser.test.log(`${event.namespace}.${event.name}(${args})`);
        }
        throw new Error("Wrong number of events, stopping.");
      }

      for (let [namespace, name, ...expectedArgs] of expectedEvents) {
        let event = events.shift();
        browser.test.assertEq(namespace, event.namespace, "Event namespace is correct");
        browser.test.assertEq(name, event.name, "Event type is correct");
        browser.test.assertEq(expectedArgs.length, event.args.length, "Argument count is correct");
        for (let i = 0; i < expectedArgs.length; i++) {
          if (typeof expectedArgs[i] == "object") {
            for (let k of Object.keys(expectedArgs[i])) {
              browser.test.assertEq(expectedArgs[i][k], event.args[i][k], `Property ${k} is correct`);
            }
          } else {
            browser.test.assertEq(expectedArgs[i], event.args[i], `Argument ${i + 1} is correct`);
          }
        }
        if (expectedEvents.length == 1) {
          return event.args;
        }
      }

      return null;
    };

    let awaitMessage = function(messageToSend, ...sendArgs) {
      return new Promise(resolve => {
        browser.test.onMessage.addListener(function listener(...args) {
          browser.test.onMessage.removeListener(listener);
          resolve(args);
        });
        if (messageToSend) {
          browser.test.sendMessage(messageToSend, ...sendArgs);
        }
      });
    };

    async function addressBookTest() {
      browser.test.log("Starting addressBookTest");
      let list = await browser.addressBooks.list();
      browser.test.assertEq(2, list.length);
      for (let b of list) {
        browser.test.assertEq(4, Object.keys(b).length);
        browser.test.assertEq(36, b.id.length);
        browser.test.assertEq("addressBook", b.type);
        browser.test.assertTrue("name" in b);
        browser.test.assertFalse(b.readOnly);
      }

      let completeList = await browser.addressBooks.list(true);
      browser.test.assertEq(2, completeList.length);
      for (let b of completeList) {
        browser.test.assertEq(6, Object.keys(b).length);
      }

      firstBookId = list[0].id;
      secondBookId = list[1].id;

      let firstBook = await browser.addressBooks.get(firstBookId);
      browser.test.assertEq(4, Object.keys(firstBook).length);

      let secondBook = await browser.addressBooks.get(secondBookId, true);
      browser.test.assertEq(6, Object.keys(secondBook).length);
      browser.test.assertTrue(Array.isArray(secondBook.contacts));
      browser.test.assertEq(0, secondBook.contacts.length);
      browser.test.assertTrue(Array.isArray(secondBook.mailingLists));
      browser.test.assertEq(0, secondBook.mailingLists.length);

      let newBookId = await browser.addressBooks.create({ name: "test name" });
      browser.test.assertEq(36, newBookId.length);
      checkEvents(["addressBooks", "onCreated", { type: "addressBook", id: newBookId }]);

      list = await browser.addressBooks.list();
      browser.test.assertEq(3, list.length);

      let newBook = await browser.addressBooks.get(newBookId);
      browser.test.assertEq(newBookId, newBook.id);
      browser.test.assertEq("addressBook", newBook.type);
      browser.test.assertEq("test name", newBook.name);

      await browser.addressBooks.update(newBookId, { name: "new name" });
      checkEvents(["addressBooks", "onUpdated", { type: "addressBook", id: newBookId }]);
      let updatedBook = await browser.addressBooks.get(newBookId);
      browser.test.assertEq("new name", updatedBook.name);

      list = await browser.addressBooks.list();
      browser.test.assertEq(3, list.length);

      await browser.addressBooks.delete(newBookId);
      checkEvents(["addressBooks", "onDeleted", newBookId]);

      list = await browser.addressBooks.list();
      browser.test.assertEq(2, list.length);

      for (let operation of ["get", "update", "delete"]) {
        let args = [newBookId];
        if (operation == "update") {
          args.push({ name: "" });
        }

        try {
          await browser.addressBooks[operation].apply(browser.addressBooks, args);
          browser.test.fail(`Calling ${operation} on a non-existent address book should throw`);
        } catch (ex) {
          browser.test.assertEq(
            `addressBook with id=${newBookId} could not be found.`,
            ex.message, `browser.addressBooks.${operation} threw exception`
          );
        }
      }

      browser.test.assertEq(0, events.length, "No events left unconsumed");
      browser.test.log("Completed addressBookTest");
    }

    async function contactsTest() {
      browser.test.log("Starting contactsTest");
      let contacts = await browser.contacts.list(firstBookId);
      browser.test.assertTrue(Array.isArray(contacts));
      browser.test.assertEq(0, contacts.length);

      newContactId = await browser.contacts.create(firstBookId, {
        FirstName: "first",
        LastName: "last",
      });
      browser.test.assertEq(36, newContactId.length);
      checkEvents(["contacts", "onCreated", { type: "contact", parentId: firstBookId, id: newContactId }]);

      contacts = await browser.contacts.list(firstBookId);
      browser.test.assertEq(1, contacts.length, "Contact added to first book.");
      browser.test.assertEq(contacts[0].id, newContactId);

      contacts = await browser.contacts.list(secondBookId);
      browser.test.assertEq(0, contacts.length, "Contact not added to second book.");

      let newContact = await browser.contacts.get(newContactId);
      browser.test.assertEq(4, Object.keys(newContact).length);
      browser.test.assertEq(newContactId, newContact.id);
      browser.test.assertEq(firstBookId, newContact.parentId);
      browser.test.assertEq("contact", newContact.type);
      browser.test.assertEq(3, Object.keys(newContact.properties).length);
      browser.test.assertEq("0", newContact.properties.PreferMailFormat);
      browser.test.assertEq("first", newContact.properties.FirstName);
      browser.test.assertEq("last", newContact.properties.LastName);

      await browser.contacts.update(newContactId, {
        PrimaryEmail: "first@last",
        LastName: null,
      });
      checkEvents(["contacts", "onUpdated", { type: "contact", parentId: firstBookId, id: newContactId }]);

      let updatedContact = await browser.contacts.get(newContactId);
      browser.test.assertEq(3, Object.keys(updatedContact.properties).length);
      browser.test.assertEq("0", updatedContact.properties.PreferMailFormat);
      browser.test.assertEq("first", updatedContact.properties.FirstName);
      browser.test.assertEq("first@last", updatedContact.properties.PrimaryEmail);
      browser.test.assertTrue(!("LastName" in updatedContact.properties));

      let fixedContactId = await browser.contacts.create(firstBookId, "this is a test", {
        FirstName: "a",
        LastName: "test",
      });
      browser.test.assertEq("this is a test", fixedContactId);
      checkEvents(["contacts", "onCreated", { type: "contact", parentId: firstBookId, id: "this is a test" }]);

      let fixedContact = await browser.contacts.get("this is a test");
      browser.test.assertEq("this is a test", fixedContact.id);

      await browser.contacts.delete("this is a test");
      checkEvents(["contacts", "onDeleted", firstBookId, "this is a test"]);

      try {
        await browser.contacts.create(firstBookId, newContactId, {
          FirstName: "uh",
          LastName: "oh",
        });
        browser.test.fail(`Adding a contact with a duplicate id should throw`);
      } catch (ex) {
        browser.test.assertEq(
          `Duplicate contact id: ${newContactId}`,
          ex.message, `browser.contacts.create threw exception`
        );
      }

      browser.test.assertEq(0, events.length, "No events left unconsumed");
      browser.test.log("Completed contactsTest");
    }

    async function mailingListsTest() {
      browser.test.log("Starting mailingListsTest");
      let mailingLists = await browser.mailingLists.list(firstBookId);
      browser.test.assertTrue(Array.isArray(mailingLists));
      browser.test.assertEq(0, mailingLists.length);

      let newMailingListId = await browser.mailingLists.create(firstBookId, { name: "name" });
      browser.test.assertEq(36, newMailingListId.length);
      checkEvents(
        ["mailingLists", "onCreated", { type: "mailingList", parentId: firstBookId, id: newMailingListId }]
      );

      mailingLists = await browser.mailingLists.list(firstBookId);
      browser.test.assertEq(1, mailingLists.length, "List added to first book.");

      mailingLists = await browser.mailingLists.list(secondBookId);
      browser.test.assertEq(0, mailingLists.length, "List not added to second book.");

      let newAddressList = await browser.mailingLists.get(newMailingListId);
      browser.test.assertEq(6, Object.keys(newAddressList).length);
      browser.test.assertEq(newMailingListId, newAddressList.id);
      browser.test.assertEq(firstBookId, newAddressList.parentId);
      browser.test.assertEq("mailingList", newAddressList.type);
      browser.test.assertEq("name", newAddressList.name);
      browser.test.assertEq("", newAddressList.nickName);
      browser.test.assertEq("", newAddressList.description);

      await browser.mailingLists.update(newMailingListId, {
        name: "name!",
        nickName: "nickname!",
        description: "description!",
      });
      checkEvents(
        ["mailingLists", "onUpdated", { type: "mailingList", parentId: firstBookId, id: newMailingListId }]
      );

      let updatedMailingList = await browser.mailingLists.get(newMailingListId);
      browser.test.assertEq("name!", updatedMailingList.name);
      browser.test.assertEq("nickname!", updatedMailingList.nickName);
      browser.test.assertEq("description!", updatedMailingList.description);

      await browser.mailingLists.addMember(newMailingListId, newContactId);
      checkEvents(
        ["mailingLists", "onMemberAdded", { type: "contact", parentId: newMailingListId, id: newContactId }]
      );

      let listMembers = await browser.mailingLists.listMembers(newMailingListId);
      browser.test.assertTrue(Array.isArray(listMembers));
      browser.test.assertEq(1, listMembers.length);

      let anotherContactId = await browser.contacts.create(firstBookId, {
        FirstName: "second",
        LastName: "last",
        PrimaryEmail: "em@il",
      });
      checkEvents(["contacts", "onCreated", { type: "contact", parentId: firstBookId, id: anotherContactId }]);

      await browser.mailingLists.addMember(newMailingListId, anotherContactId);
      checkEvents(
        ["mailingLists", "onMemberAdded", { type: "contact", parentId: newMailingListId, id: anotherContactId }]
      );

      listMembers = await browser.mailingLists.listMembers(newMailingListId);
      browser.test.assertEq(2, listMembers.length);

      await browser.contacts.delete(anotherContactId);
      checkEvents(
        ["contacts", "onDeleted", firstBookId, anotherContactId],
        ["mailingLists", "onMemberRemoved", newMailingListId, anotherContactId]
      );
      listMembers = await browser.mailingLists.listMembers(newMailingListId);
      browser.test.assertEq(1, listMembers.length);

      await browser.mailingLists.removeMember(newMailingListId, newContactId);
      checkEvents(
        ["mailingLists", "onMemberRemoved", newMailingListId, newContactId]
      );
      listMembers = await browser.mailingLists.listMembers(newMailingListId);
      browser.test.assertEq(0, listMembers.length);

      await browser.mailingLists.delete(newMailingListId);
      checkEvents(["mailingLists", "onDeleted", firstBookId, newMailingListId]);

      mailingLists = await browser.mailingLists.list(firstBookId);
      browser.test.assertEq(0, mailingLists.length);

      for (let operation of ["get", "update", "delete", "listMembers", "addMember", "removeMember"]) {
        let args = [newMailingListId];
        switch (operation) {
          case "update":
            args.push({ name: "" });
            break;
          case "addMember":
          case "removeMember":
            args.push(newContactId);
            break;
        }

        try {
          await browser.mailingLists[operation].apply(browser.mailingLists, args);
          browser.test.fail(`Calling ${operation} on a non-existent mailing list should throw`);
        } catch (ex) {
          browser.test.assertEq(
            `mailingList with id=${newMailingListId} could not be found.`,
            ex.message, `browser.mailingLists.${operation} threw exception`
          );
        }
      }

      browser.test.assertEq(0, events.length, "No events left unconsumed");
      browser.test.log("Completed mailingListsTest");
    }

    async function contactRemovalTest() {
      browser.test.log("Starting contactRemovalTest");
      await browser.contacts.delete(newContactId);
      checkEvents(["contacts", "onDeleted", firstBookId, newContactId]);

      for (let operation of ["get", "update", "delete"]) {
        let args = [newContactId];
        if (operation == "update") {
          args.push({});
        }

        try {
          await browser.contacts[operation].apply(browser.contacts, args);
          browser.test.fail(`Calling ${operation} on a non-existent contact should throw`);
        } catch (ex) {
          browser.test.assertEq(
            `contact with id=${newContactId} could not be found.`,
            ex.message, `browser.contacts.${operation} threw exception`
          );
        }
      }

      let contacts = await browser.contacts.list(firstBookId);
      browser.test.assertEq(0, contacts.length);

      browser.test.assertEq(0, events.length, "No events left unconsumed");
      browser.test.log("Completed contactRemovalTest");
    }

    async function outsideEventsTest() {
      browser.test.log("Starting outsideEventsTest");

      let [bookId, newBookPrefId] = await awaitMessage("outsideEventsTest", "createAddressBook");
      let [newBook] = checkEvents(["addressBooks", "onCreated", { type: "addressBook", id: bookId }]);
      browser.test.assertEq("external add", newBook.name);

      await awaitMessage("outsideEventsTest", "updateAddressBook", newBookPrefId);
      let [updatedBook] = checkEvents(["addressBooks", "onUpdated", { type: "addressBook", id: bookId }]);
      browser.test.assertEq("external edit", updatedBook.name);

      await awaitMessage("outsideEventsTest", "deleteAddressBook", newBookPrefId);
      checkEvents(["addressBooks", "onDeleted", bookId]);

      let [parentId1, contactId] = await awaitMessage("outsideEventsTest", "createContact");
      let [newContact] = checkEvents(
        ["contacts", "onCreated", { type: "contact", parentId: parentId1, id: contactId }]
      );
      browser.test.assertEq("external", newContact.properties.FirstName);
      browser.test.assertEq("add", newContact.properties.LastName);

      await awaitMessage("outsideEventsTest", "updateContact", contactId);
      let [updatedContact] = checkEvents(
        ["contacts", "onUpdated", { type: "contact", parentId: parentId1, id: contactId }]
      );
      browser.test.assertEq("external", updatedContact.properties.FirstName);
      browser.test.assertEq("edit", updatedContact.properties.LastName);

      let [parentId2, listId] = await awaitMessage("outsideEventsTest", "createMailingList");
      let [newList] = checkEvents(
        ["mailingLists", "onCreated", { type: "mailingList", parentId: parentId2, id: listId }]
      );
      browser.test.assertEq("external add", newList.name);

      await awaitMessage("outsideEventsTest", "updateMailingList", listId);
      let [updatedList] = checkEvents(
        ["mailingLists", "onUpdated", { type: "mailingList", parentId: parentId2, id: listId }]
      );
      browser.test.assertEq("external edit", updatedList.name);

      await awaitMessage("outsideEventsTest", "addMailingListMember", listId, contactId);
      checkEvents(
        ["mailingLists", "onMemberAdded", { type: "contact", parentId: listId, id: contactId }]
      );
      let listMembers = await browser.mailingLists.listMembers(listId);
      browser.test.assertEq(1, listMembers.length);

      await awaitMessage("outsideEventsTest", "removeMailingListMember", listId, contactId);
      checkEvents(
        ["mailingLists", "onMemberRemoved", listId, contactId]
      );

      await awaitMessage("outsideEventsTest", "deleteMailingList", listId);
      checkEvents(["mailingLists", "onDeleted", parentId2, listId]);

      await awaitMessage("outsideEventsTest", "deleteContact", contactId);
      checkEvents(["contacts", "onDeleted", parentId1, contactId]);

      browser.test.log("Completed outsideEventsTest");
    }

    await addressBookTest();
    await contactsTest();
    await mailingListsTest();
    await contactRemovalTest();
    await outsideEventsTest();

    browser.test.notifyPass("addressBooks");
  }

  let extension = ExtensionTestUtils.loadExtension({
    background,
    manifest: { permissions: ["addressBooks"] },
  });

  extension.onMessage("outsideEventsTest", (action, ...args) => {
    function findContact(id) {
      for (let child of parent.childCards) {
        if (child.UID == id) {
          return child;
        }
      }
      return null;
    }
    function findMailingList(id) {
      for (let list of parent.addressLists.enumerate()) {
        if (list.UID == id) {
          return list;
        }
      }
      return null;
    }

    let parent = MailServices.ab.directories.getNext().QueryInterface(Ci.nsIAbDirectory);
    switch (action) {
      case "createAddressBook": {
        const kPABDirectory = 2; // defined in nsDirPrefs.h
        let dirPrefId = MailServices.ab.newAddressBook("external add", "", kPABDirectory);
        let book = MailServices.ab.getDirectoryFromId(dirPrefId);
        extension.sendMessage(book.UID, dirPrefId);
        return;
      }
      case "updateAddressBook": {
        let book = MailServices.ab.getDirectoryFromId(args[0]);
        book.dirName = "external edit";
        extension.sendMessage();
        return;
      }
      case "deleteAddressBook": {
        let book = MailServices.ab.getDirectoryFromId(args[0]);
        MailServices.ab.deleteAddressBook(book.URI);
        extension.sendMessage();
        return;
      }

      case "createContact": {
        let contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
        contact.firstName = "external";
        contact.lastName = "add";
        contact.primaryEmail = "test@invalid";
        let newContact = parent.addCard(contact);
        extension.sendMessage(parent.UID, newContact.UID);
        return;
      }
      case "updateContact": {
        let contact = findContact(args[0]);
        if (contact) {
          contact.firstName = "external";
          contact.lastName = "edit";
          parent.modifyCard(contact);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "deleteContact": {
        let contact = findContact(args[0]);
        if (contact) {
          let cardArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
          cardArray.appendElement(contact);
          parent.deleteCards(cardArray);
          extension.sendMessage();
          return;
        }
        break;
      }

      case "createMailingList": {
        let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(Ci.nsIAbDirectory);
        list.isMailList = true;
        list.dirName = "external add";

        let newList = parent.addMailList(list);
        extension.sendMessage(parent.UID, newList.UID);
        return;
      }
      case "updateMailingList": {
        let list = findMailingList(args[0]);
        if (list) {
          list.dirName = "external edit";
          list.editMailListToDatabase(null);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "deleteMailingList": {
        let list = findMailingList(args[0]);
        if (list) {
          MailServices.ab.deleteAddressBook(list.URI);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "addMailingListMember": {
        let list = findMailingList(args[0]);
        let contact = findContact(args[1]);

        if (list && contact) {
          list.addCard(contact);
          equal(1, list.addressLists.Count());
          extension.sendMessage();
          return;
        }
        break;
      }
      case "removeMailingListMember": {
        let list = findMailingList(args[0]);
        let contact = findContact(args[1]);

        if (list && contact) {
          let cardArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
          cardArray.appendElement(contact);
          list.deleteCards(cardArray);
          equal(0, list.addressLists.Count());
          ok(findContact(args[1]), "Contact was not removed");
          extension.sendMessage();
          return;
        }
        break;
      }
    }
    throw new Error(`Message "${action}" passed to handler didn't do anything.`);
  });

  await extension.startup();
  await extension.awaitFinish("addressBooks");
  await extension.unload();
});

add_task(async function test_quickSearch() {
  async function background() {
    let book1 = await browser.addressBooks.create({ name: "book1" });
    let book2 = await browser.addressBooks.create({ name: "book2" });

    let book1contacts = {
      charlie: await browser.contacts.create(book1, { FirstName: "charlie" }),
      juliet: await browser.contacts.create(book1, { FirstName: "juliet" }),
      mike: await browser.contacts.create(book1, { FirstName: "mike" }),
      oscar: await browser.contacts.create(book1, { FirstName: "oscar" }),
      papa: await browser.contacts.create(book1, { FirstName: "papa" }),
      romeo: await browser.contacts.create(book1, { FirstName: "romeo" }),
      victor: await browser.contacts.create(book1, { FirstName: "victor" }),
    };

    let book2contacts = {
      bigBird: await browser.contacts.create(book2, { FirstName: "Big", LastName: "Bird" }),
      cookieMonster: await browser.contacts.create(book2, { FirstName: "Cookie", LastName: "Monster" }),
      elmo: await browser.contacts.create(book2, { FirstName: "Elmo" }),
      grover: await browser.contacts.create(book2, { FirstName: "Grover" }),
      oscarTheGrouch: await browser.contacts.create(book2, { FirstName: "Oscar", LastName: "The Grouch" }),
    };

    // A search string without a match in either book.
    let results = await browser.contacts.quickSearch(book1, "snuffleupagus");
    browser.test.assertEq(0, results.length);

    // A search string with a match in the book we're searching.
    results = await browser.contacts.quickSearch(book1, "mike");
    browser.test.assertEq(1, results.length);
    browser.test.assertEq(book1contacts.mike, results[0].id);

    // A search string with a match in the book we're not searching.
    results = await browser.contacts.quickSearch(book1, "elmo");
    browser.test.assertEq(0, results.length);

    // A search string with a match in both books.
    results = await browser.contacts.quickSearch(book1, "oscar");
    browser.test.assertEq(1, results.length);
    browser.test.assertEq(book1contacts.oscar, results[0].id);

    // A search string with a match in both books. Looking in all books.
    results = await browser.contacts.quickSearch("oscar");
    browser.test.assertEq(2, results.length);
    browser.test.assertEq(book1contacts.oscar, results[0].id);
    browser.test.assertEq(book2contacts.oscarTheGrouch, results[1].id);

    // No valid search strings.
    results = await browser.contacts.quickSearch("  ");
    browser.test.assertEq(0, results.length);

    await browser.addressBooks.delete(book1);
    await browser.addressBooks.delete(book2);

    browser.test.notifyPass("addressBooks");
  }

  let extension = ExtensionTestUtils.loadExtension({
    background,
    manifest: { permissions: ["addressBooks"] },
  });

  await extension.startup();
  await extension.awaitFinish("addressBooks");
  await extension.unload();
});
