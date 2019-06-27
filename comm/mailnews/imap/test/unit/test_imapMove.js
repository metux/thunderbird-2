/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests that we use IMAP move if the IMAP server supports it.

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/messageGenerator.js */
load("../../../resources/logHelper.js");
load("../../../resources/messageGenerator.js");

var gFolder1;

var tests = [
  setupCUSTOM1,
  startTest,
  doMove,
  testMove,
  teardownIMAPPump,
];

function setupCUSTOM1() {
  setupIMAPPump("CUSTOM1");
  Services.prefs.setBoolPref("mail.server.default.autosync_offline_stores", false);
}

async function startTest() {
  IMAPPump.incomingServer.rootFolder.createSubfolder("folder 1", null);
  await PromiseTestUtils.promiseFolderAdded("folder 1");

  addImapMessage();
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  // ...and download for offline use.
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.downloadAllForOffline(promiseUrlListener, null);
  await promiseUrlListener.promise;
}

async function doMove() {
  var messages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  let rootFolder = IMAPPump.incomingServer.rootFolder;
  gFolder1 = rootFolder.getChildNamed("folder 1")
                       .QueryInterface(Ci.nsIMsgImapMailFolder);
  let msg = IMAPPump.inbox.msgDatabase.GetMsgHdrForKey(IMAPPump.mailbox.uidnext - 1);
  messages.appendElement(msg);
  IMAPPump.server._test = true;
  let listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.CopyMessages(IMAPPump.inbox, messages, gFolder1, true,
                                 listener, null, false);
  IMAPPump.server.performTest("UID MOVE");
  await listener.promise;
}

async function testMove() {
  Assert.equal(IMAPPump.inbox.getTotalMessages(false), 0);
  let listener = new PromiseTestUtils.PromiseUrlListener();
  gFolder1.updateFolderWithListener(null, listener);
  await listener.promise;
  Assert.equal(gFolder1.getTotalMessages(false), 1);

  // maildir should also delete the files.
  if (IMAPPump.inbox.msgStore.storeType == "maildir") {
    let curDir = IMAPPump.inbox.filePath.clone();
    curDir.append("cur");
    Assert.ok(curDir.exists());
    Assert.ok(curDir.isDirectory());
    let curEnum = curDir.directoryEntries;
    // the directory should be empty, fails from bug 771643
    Assert.ok(!curEnum.hasMoreElements());
  }
}

function run_test() {
  tests.forEach(x => add_task(x));
  run_next_test();
}
