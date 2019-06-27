/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["moveCopyModule"];

var nsActEvent = Components.Constructor("@mozilla.org/activity-event;1",
                                          "nsIActivityEvent", "init");

const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
const {PluralForm} = ChromeUtils.import("resource://gre/modules/PluralForm.jsm");
const { Log4Moz } = ChromeUtils.import("resource:///modules/gloda/log4moz.js");

// This module provides a link between the move/copy code and the activity
// manager.
var moveCopyModule = {
  lastMessage: {},
  lastFolder: {},

  get log() {
    delete this.log;
    return this.log = Log4Moz.getConfiguredLogger("moveCopyModule");
  },

  get activityMgr() {
    delete this.activityMgr;
    return this.activityMgr = Cc["@mozilla.org/activity-manager;1"]
                                .getService(Ci.nsIActivityManager);
  },

  get bundle() {
    delete this.bundle;
    return this.bundle = Services.strings
      .createBundle("chrome://messenger/locale/activity.properties");
  },

  getString(stringName) {
    try {
      return this.bundle.GetStringFromName(stringName);
    } catch (e) {
      this.log.error("error trying to get a string called: " + stringName);
      throw e;
    }
  },

  msgAdded(aMsg) {
  },

  msgsDeleted(aMsgList) {
    this.log.info("in msgsDeleted");

    let count = aMsgList.length;
    if (count <= 0)
      return;

    let displayCount = count;
    // get the folder of the deleted messages
    let folder = aMsgList.queryElementAt(0, Ci.nsIMsgDBHdr).folder;

    let activities = this.activityMgr.getActivities({});
    if (activities.length > 0 &&
        activities[activities.length - 1].id == this.lastMessage.id &&
        this.lastMessage.type == "deleteMail" &&
        this.lastMessage.folder == folder.prettyName) {
      displayCount += this.lastMessage.count;
      this.activityMgr.removeActivity(this.lastMessage.id);
    }

    this.lastMessage = {};
    let displayText = PluralForm.get(displayCount, this.getString("deletedMessages2"));
    displayText = displayText.replace("#1", displayCount);
    this.lastMessage.count = displayCount;
    displayText = displayText.replace("#2", folder.prettyName);
    this.lastMessage.folder = folder.prettyName;

    let statusText = folder.server.prettyName;

    // create an activity event
    let event = new nsActEvent(displayText,
                               folder,
                               statusText,
                               Date.now(),  // start time
                               Date.now()); // completion time

    event.iconClass = "deleteMail";
    this.lastMessage.type = event.iconClass;

    for (let i = 0; i < count; i++) {
      let msgHdr = aMsgList.queryElementAt(i, Ci.nsIMsgDBHdr);
      event.addSubject(msgHdr.messageId);
    }

    this.lastMessage.id = this.activityMgr.addActivity(event);
  },

  msgsMoveCopyCompleted(aMove, aSrcMsgList, aDestFolder) {
    try {
      this.log.info("in msgsMoveCopyCompleted");

      let count = aSrcMsgList.length;
      if (count <= 0)
        return;

      // get the folder of the moved/copied messages
      let folder = aSrcMsgList.queryElementAt(0, Ci.nsIMsgDBHdr).folder;
      this.log.info("got folder");

      let displayCount = count;

      let activities = this.activityMgr.getActivities({});
      if (activities.length > 0 &&
          activities[activities.length - 1].id == this.lastMessage.id &&
          this.lastMessage.type == (aMove ? "moveMail" : "copyMail") &&
          this.lastMessage.sourceFolder == folder.prettyName &&
          this.lastMessage.destFolder == aDestFolder.prettyName) {
        displayCount += this.lastMessage.count;
        this.activityMgr.removeActivity(this.lastMessage.id);
      }

      let statusText = "";
      if (folder.server != aDestFolder.server) {
        statusText = this.getString("fromServerToServer");
        statusText = statusText.replace("#1", folder.server.prettyName);
        statusText = statusText.replace("#2", aDestFolder.server.prettyName);
      } else {
        statusText = folder.server.prettyName;
      }

      this.lastMessage = {};
      let displayText;
      if (aMove)
        displayText = PluralForm.get(displayCount,
                                     this.getString("movedMessages"));
      else
        displayText = PluralForm.get(displayCount,
                                     this.getString("copiedMessages"));

      displayText = displayText.replace("#1", displayCount);
      this.lastMessage.count = displayCount;
      displayText = displayText.replace("#2", folder.prettyName);
      this.lastMessage.sourceFolder = folder.prettyName;
      displayText = displayText.replace("#3", aDestFolder.prettyName);
      this.lastMessage.destFolder = aDestFolder.prettyName;

      // create an activity event
      let event = new nsActEvent(displayText,
                                 folder,
                                 statusText,
                                 Date.now(),    // start time
                                 Date.now());   // completion time
      event.iconClass = aMove ? "moveMail" : "copyMail";
      this.lastMessage.type = event.iconClass;

      for (let i = 0; i < count; i++) {
        let msgHdr = aSrcMsgList.queryElementAt(i, Ci.nsIMsgDBHdr);
        event.addSubject(msgHdr.messageId);
      }
      this.lastMessage.id = this.activityMgr.addActivity(event);
    } catch (e) {
      this.log.error("Exception: " + e);
    }
  },

  folderAdded(aFolder) {
  },

  folderDeleted(aFolder) {
    let server;
    try {
      // When a new account is created we get this notification with an empty named
      // folder that can't return its server. Ignore it.
      // TODO: find out what it is.
      server = aFolder.server;
      // If the account has been removed, we're going to ignore this notification.
      MailServices.accounts.FindServer(server.username, server.hostName, server.type);
    } catch (ex) { return; }

    let displayText;
    let statusText = server.prettyName;

    // Display a different message depending on whether we emptied the trash
    // or actually deleted a folder
    if (aFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, false))
      displayText = this.getString("emptiedTrash");
    else
      displayText = this.getString("deletedFolder").replace("#1", aFolder.prettyName);

    // create an activity event
    let event = new nsActEvent(displayText,
                               server,
                               statusText,
                               Date.now(),  // start time
                               Date.now()); // completion time

    event.addSubject(aFolder);
    event.iconClass = "deleteMail";

    // When we rename, we get a delete event as well as a rename, so store
    // the last folder we deleted
    this.lastFolder = {};
    this.lastFolder.URI = aFolder.URI;
    this.lastFolder.event = this.activityMgr.addActivity(event);
  },

  folderMoveCopyCompleted(aMove, aSrcFolder, aDestFolder) {
    this.log.info("in folderMoveCopyCompleted, aMove = " + aMove);

    let displayText;
    if (aMove)
      displayText = this.getString("movedFolder");
    else
      displayText = this.getString("copiedFolder");

    displayText = displayText.replace("#1", aSrcFolder.prettyName);
    displayText = displayText.replace("#2", aDestFolder.prettyName);

    let statusText = "";
    if (aSrcFolder.server != aDestFolder.server) {
      statusText = this.getString("fromServerToServer");
      statusText = statusText.replace("#1", aSrcFolder.server.prettyName);
      statusText = statusText.replace("#2", aDestFolder.server.prettyName);
    } else {
      statusText = aSrcFolder.server.prettyName;
    }
    // create an activity event
    let event = new nsActEvent(displayText,
                               aSrcFolder.server,
                               statusText,
                               Date.now(),    // start time
                               Date.now());   // completion time

    event.addSubject(aSrcFolder);
    event.addSubject(aDestFolder);
    event.iconClass = aMove ? "moveMail" : "copyMail";

    this.activityMgr.addActivity(event);
  },

  folderRenamed(aOrigFolder, aNewFolder) {
    this.log.info("in folderRenamed, aOrigFolder = " + aOrigFolder.prettyName +
                  ", aNewFolder = " + aNewFolder.prettyName);

    let displayText;
    let statusText = aNewFolder.server.prettyName;

    // Display a different message depending on whether we moved the folder
    // to the trash or actually renamed the folder.
    if (aNewFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true)) {
      displayText = this.getString("movedFolderToTrash");
      displayText = displayText.replace("#1", aOrigFolder.prettyName);
    } else {
      displayText = this.getString("renamedFolder");
      displayText = displayText.replace("#1", aOrigFolder.prettyName);
      displayText = displayText.replace("#2", aNewFolder.prettyName);
    }

    // When renaming a folder, a delete event is always fired first
    if (this.lastFolder.URI == aOrigFolder.URI)
      this.activityMgr.removeActivity(this.lastFolder.event);

    // create an activity event
    let event = new nsActEvent(displayText,
                               aOrigFolder.server,
                               statusText,
                               Date.now(),  // start time
                               Date.now()); // completion time

    event.addSubject(aOrigFolder);
    event.addSubject(aNewFolder);

    this.activityMgr.addActivity(event);
  },

  itemEvent(aItem, aEvent, aData, aString) {
    if (aEvent == "UnincorporatedMessageMoved") {
      let srcFolder = aItem.QueryInterface(Ci.nsIMsgFolder);
      let msgHdr = aData.QueryInterface(Ci.nsIMsgDBHdr);

      try {
        this.log.info("in UnincorporatedMessageMoved");

        // get the folder of the moved/copied messages
        let destFolder = msgHdr.folder;
        this.log.info("got folder");

        let displayCount = 1;

        let activities = this.activityMgr.getActivities({});
        if (activities.length > 0 &&
            activities[activities.length - 1].id == this.lastMessage.id &&
            this.lastMessage.type == "moveMail" &&
            this.lastMessage.sourceFolder == srcFolder.prettyName &&
            this.lastMessage.destFolder == destFolder.prettyName) {
          displayCount += this.lastMessage.count;
          this.activityMgr.removeActivity(this.lastMessage.id);
        }

        let statusText = "";
        if (srcFolder.server != destFolder.server) {
          statusText = this.getString("fromServerToServer");
          statusText = statusText.replace("#1", srcFolder.server.prettyName);
          statusText = statusText.replace("#2", destFolder.server.prettyName);
        } else {
          statusText = srcFolder.server.prettyName;
        }

        this.lastMessage = {};
        let displayText;
        displayText = PluralForm.get(displayCount,
                                     this.getString("movedMessages"));

        displayText = displayText.replace("#1", displayCount);
        this.lastMessage.count = displayCount;
        displayText = displayText.replace("#2", srcFolder.prettyName);
        this.lastMessage.sourceFolder = srcFolder.prettyName;
        displayText = displayText.replace("#3", destFolder.prettyName);
        this.lastMessage.destFolder = destFolder.prettyName;

        // create an activity event
        let event = new nsActEvent(displayText,
                                   srcFolder,
                                   statusText,
                                   Date.now(),    // start time
                                   Date.now());   // completion time

        event.iconClass = "moveMail";
        this.lastMessage.type = event.iconClass;
        event.addSubject(msgHdr.messageId);
        this.lastMessage.id = this.activityMgr.addActivity(event);
      } catch (e) {
        this.log.error("Exception: " + e);
      }
    }
  },

  init() {
    // XXX when do we need to remove ourselves?
    MailServices.mfn.addListener(this,
                                 MailServices.mfn.msgsDeleted |
                                 MailServices.mfn.msgsMoveCopyCompleted |
                                 MailServices.mfn.folderDeleted |
                                 MailServices.mfn.folderMoveCopyCompleted |
                                 MailServices.mfn.folderRenamed |
                                 MailServices.mfn.itemEvent);
  },
};
