/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file tests that a message saved as draft in an IMAP folder in offline
 * mode is not lost when going back online
 * See Bug 805626
 */

// async support
/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

// IMAP pump

setupIMAPPump();

// Definition of tests

var tests = [
  createDraftsFolder,
  goOffline,
  saveDraft,
  goOnline,
  checkResult,
  endTest,
];

var gDraftsFolder;

function* createDraftsFolder() {
  IMAPPump.incomingServer.rootFolder.createSubfolder("Drafts", null);
  yield false;
  gDraftsFolder = IMAPPump.incomingServer.rootFolder.getChildNamed("Drafts");
  Assert.ok(gDraftsFolder instanceof Ci.nsIMsgImapMailFolder);
  gDraftsFolder.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}
function* goOffline() {
  // Don't prompt about offline download when going offline
  Services.prefs.setIntPref("offline.download.download_messages", 2);

  IMAPPump.incomingServer.closeCachedConnections();
  let thread = gThreadManager.currentThread;
  while (thread.hasPendingEvents())
    thread.processNextEvent(true);

  do_timeout(2000, async_driver);
  yield false;

  IMAPPump.server.stop();
  Services.io.offline = true;
}

function* saveDraft() {
  let msgCompose = Cc["@mozilla.org/messengercompose/compose;1"]
                     .createInstance(Ci.nsIMsgCompose);
  let fields = Cc["@mozilla.org/messengercompose/composefields;1"]
                 .createInstance(Ci.nsIMsgCompFields);
  let params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                 .createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = fields;
  msgCompose.initialize(params);

  // Set up the identity
  let identity = MailServices.accounts.createIdentity();
  identity.draftFolder = gDraftsFolder.URI;

  let progress = Cc["@mozilla.org/messenger/progress;1"]
                   .createInstance(Ci.nsIMsgProgress);
  progress.registerListener(progressListener);
  msgCompose.SendMsg(Ci.nsIMsgSend.nsMsgSaveAsDraft, identity, "", null,
                     progress);
  yield false;
  // verify that message is not on the server yet
  Assert.equal(IMAPPump.daemon.getMailbox("Drafts")._messages.length, 0);
}

function* goOnline() {
  let offlineManager = Cc["@mozilla.org/messenger/offline-manager;1"]
                       .getService(Ci.nsIMsgOfflineManager);
  IMAPPump.daemon.closing = false;
  Services.io.offline = false;

  IMAPPump.server.start();
  offlineManager.inProgress = true;
  offlineManager.goOnline(false, true, null);
  let waitForNotInProgress = function() {
    if (offlineManager.inProgress)
      do_timeout(250, waitForNotInProgress);
    else
      async_driver();
  };
  waitForNotInProgress();
  yield false;
}

function* checkResult() {
  // verify that message is now on the server
  Assert.equal(IMAPPump.daemon.getMailbox("Drafts")._messages.length, 1);
  yield true;
}

function* endTest() {
  teardownIMAPPump();
  yield true;
}

function run_test() {
  Services.prefs.setBoolPref("mail.server.default.autosync_offline_stores", false);

  // Add folder listeners that will capture async events
  const nsIMFNService = Ci.nsIMsgFolderNotificationService;

  let flags =
        nsIMFNService.msgsMoveCopyCompleted |
        nsIMFNService.folderAdded |
        nsIMFNService.msgAdded;
  MailServices.mfn.addListener(mfnListener, flags);

  // start first test
  async_run_tests(tests);
}

var mfnListener = {
  msgsMoveCopyCompleted(aMove, aSrcMsgs, aDestFolder, aDestMsgs) {
    dl("msgsMoveCopyCompleted to folder " + aDestFolder.name);
  },

  folderAdded(aFolder) {
    dl("folderAdded <" + aFolder.name + ">");
    // we are only using async add on the Junk folder
    if (aFolder.name == "Drafts")
      async_driver();
  },

  msgAdded(aMsg) {
    dl("msgAdded with subject <" + aMsg.subject + ">");
  },
};

var progressListener = {
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      dl("onStateChange");
      async_driver();
    }
  },

  onProgressChange(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress,
                   aCurTotalProgress, aMaxTotalProgress) {},
  onLocationChange(aWebProgress, aRequest, aLocation, aFlags) {},
  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {},
  onSecurityChange(aWebProgress, aRequest, state) {},
  onContentBlockingEvent(aWebProgress, aRequest, aEvent) {},

  QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener",
                                          "nsISupportsWeakReference"]),
};

/*
 * helper functions
 */

// quick shorthand for output of a line of text.
function dl(text) {
  dump(text + "\n");
}
