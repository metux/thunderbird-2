/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests imap msg header download chunking
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/messageGenerator.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/messageGenerator.js");

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
// javascript mime emitter functions

// IMAP pump

setupIMAPPump();

// Dummy message window so we can say the inbox is open in a window.
var dummyMsgWindow = {
  openFolder: IMAPPump.inbox,
  QueryInterface: ChromeUtils.generateQI([Ci.nsIMsgWindow,
                                          Ci.nsISupportsWeakReference]),
};

var gFolderListener = {
  _gotNewMailBiff: false,
  OnItemIntPropertyChanged(aItem, aProperty, aOldValue, aNewValue) {
    if (aProperty == "BiffState" &&
        aNewValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
      this._gotNewMailBiff = true;
      async_driver();
    }
  },
};

var tests = [
  uploadImapMessages,
  testMessageFetched,
  testHdrsDownloaded,
  endTest,
];

// upload messages to the imap fake server Inbox
function* uploadImapMessages() {
  // make 10 messages
  let messageGenerator = new MessageGenerator();
  let scenarioFactory = new MessageScenarioFactory(messageGenerator);

  // build up a list of messages
  let messages = [];
  messages = messages.concat(scenarioFactory.directReply(10));

  // Add 10 messages with uids 1-10.
  let imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  // Create the imapMessages and store them on the mailbox
  messages.forEach(function(message) {
    let dataUri = Services.io.newURI("data:text/plain;base64," +
                                     btoa(message.toMessageString()));
    imapInbox.addMessage(new imapMessage(dataUri.spec, imapInbox.uidnext++, []));
  });
  // updateFolderWithListener with null for nsIMsgWindow makes biff notify.
  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

function* testMessageFetched() {
  // If we're really chunking, then the message fetch should have started before
  // we finished the updateFolder URL.
  Assert.ok(gFolderListener._gotNewMailBiff);
  // Should have only downloaded first chunk of headers when message
  // has finished streaming.
  Assert.equal(IMAPPump.inbox.msgDatabase.dBFolderInfo.numMessages, 3);
  yield false;
}

function* testHdrsDownloaded() {
  // Make sure we got all 10 headers.
  Assert.equal(IMAPPump.inbox.msgDatabase.dBFolderInfo.numMessages, 10);
  yield true;
}

// Cleanup
function endTest() {
  teardownIMAPPump();
}

function run_test() {
  // We need to register the dummyMsgWindow so that we'll think the
  // Inbox is open in a folder and fetch headers in chunks.
  MailServices.mailSession.AddMsgWindow(dummyMsgWindow);
  MailServices.mailSession.AddFolderListener(gFolderListener,
                                             Ci.nsIFolderListener.intPropertyChanged);

  // Set chunk size to 3, so we'll have to chain 4 requests to get
  // 10 headers.
  Services.prefs.setIntPref("mail.imap.hdr_chunk_size", 3);
  // Turn off offline sync to avoid complications in verifying that we can
  // run a url after the first header chunk.
  Services.prefs.setBoolPref("mail.server.server1.autosync_offline_stores", false);

  async_run_tests(tests);
}

