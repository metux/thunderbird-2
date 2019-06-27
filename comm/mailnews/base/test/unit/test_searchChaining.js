/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test of chaining of search scopes in a search session. In particular,
//  Bug 541969 made us not search an imap folder if the search scope before it
// there was an empty local folder.

// main test

/* import-globals-from ../../../test/resources/messageGenerator.js */
load("../../../resources/messageGenerator.js");

var {
  IMAPPump,
  setupIMAPPump,
  teardownIMAPPump,
} = ChromeUtils.import("resource://testing-common/mailnews/IMAPpump.js");
var {
  imapMessage,
} = ChromeUtils.import("resource://testing-common/mailnews/imapd.js");
const {PromiseTestUtils} = ChromeUtils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

async function setupFolder() {
  // add a single message to the imap inbox.
  let messages = [];
  let messageGenerator = new MessageGenerator();
  messages = messages.concat(messageGenerator.makeMessage());
  let synthMessage = messages[0];

  let msgURI =
    Services.io.newURI("data:text/plain;base64," +
                       btoa(synthMessage.toMessageString()));
  let message = new imapMessage(msgURI.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(message);

  // update folder to download header.
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
}

async function searchTest() {
  // Get the IMAP inbox...
  var emptyLocal1 = localAccountUtils.rootFolder.createLocalSubfolder("empty 1");

  let searchSession = Cc["@mozilla.org/messenger/searchSession;1"]
                        .createInstance(Ci.nsIMsgSearchSession);

  let searchTerm = searchSession.createTerm();
  searchTerm.matchAll = true;
  searchSession.appendTerm(searchTerm);
  searchSession.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, emptyLocal1);
  searchSession.addScopeTerm(Ci.nsMsgSearchScope.onlineMail, IMAPPump.inbox);
  let listener = new PromiseTestUtils.PromiseSearchNotify(
                       searchSession, searchListener);
  searchSession.search(null);
  await listener.promise;

  // After the search completes, there still seem to be active URLs, so we
  //   have to wait before we are done and clear.
  await PromiseTestUtils.promiseDelay(1000);
}

// nsIMsgSearchNotify implementation
var searchListener = {
  numTotalMessages: 0,
  QueryInterface: ChromeUtils.generateQI([Ci.nsIMsgSearchNotify]),
  onNewSearch() {
    this.numTotalMessages = 0;
  },
  onSearchHit(dbHdr, folder) {
    this.numTotalMessages++;
  },
  onSearchDone(status) {
    Assert.equal(this.numTotalMessages, 1);
    return true;
  },
};

var tests = [
  setupIMAPPump,
  setupFolder,
  searchTest,
  teardownIMAPPump,
];

function run_test() {
  tests.forEach(x => add_task(x));
  run_next_test();
}
