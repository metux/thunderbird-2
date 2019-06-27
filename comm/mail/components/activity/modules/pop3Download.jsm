/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["pop3DownloadModule"];

var nsActEvent = Components.Constructor("@mozilla.org/activity-event;1",
                                          "nsIActivityEvent", "init");

const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
const {PluralForm} = ChromeUtils.import("resource://gre/modules/PluralForm.jsm");
const { Log4Moz } = ChromeUtils.import("resource:///modules/gloda/log4moz.js");

// This module provides a link between the pop3 service code and the activity
// manager.
var pop3DownloadModule = {
  // hash table of most recent download items per folder
  _mostRecentActivityForFolder: new Map(),
  // hash table of prev download items per folder, so we can
  // coalesce consecutive no new message events.
  _prevActivityForFolder: new Map(),

  get log() {
    delete this.log;
    return this.log = Log4Moz.getConfiguredLogger("pop3DownloadsModule");
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

  onDownloadStarted(aFolder) {
    this.log.info("in onDownloadStarted");

    let displayText =
      this.bundle.formatStringFromName("pop3EventStartDisplayText2",
                                       [aFolder.server.prettyName, // account name
                                        aFolder.prettyName], 2);   // folder name
    // remember the prev activity for this folder, if any.
    this._prevActivityForFolder.set(aFolder.URI,
      this._mostRecentActivityForFolder.get(aFolder.URI));
    let statusText = aFolder.server.prettyName;

    // create an activity event
    let event = new nsActEvent(displayText,
                               aFolder,
                               statusText,
                               Date.now(),  // start time
                               Date.now()); // completion time

    event.iconClass = "syncMail";

    let downloadItem = {};
    downloadItem.eventID = this.activityMgr.addActivity(event);
    this._mostRecentActivityForFolder.set(aFolder.URI, downloadItem);
  },

  onDownloadProgress(aFolder, aNumMsgsDownloaded, aTotalMsgs) {
    this.log.info("in onDownloadProgress");
  },

  onDownloadCompleted(aFolder, aNumMsgsDownloaded) {
    this.log.info("in onDownloadCompleted");

    // Remove activity if there was any.
    // It can happen that download never started (e.g. couldn't connect to server),
    // with onDownloadStarted, but we still get a onDownloadCompleted event
    // when the connection is given up.
    let recentActivity = this._mostRecentActivityForFolder.get(aFolder.URI);
    if (recentActivity)
      this.activityMgr.removeActivity(recentActivity.eventID);

    let displayText;
    if (aNumMsgsDownloaded > 0) {
      displayText = PluralForm.get(aNumMsgsDownloaded, this.getString("pop3EventStatusText"));
      displayText = displayText.replace("#1", aNumMsgsDownloaded);
    } else {
      displayText = this.getString("pop3EventStatusTextNoMsgs");
    }

    let statusText = aFolder.server.prettyName;

    // create an activity event
    let event = new nsActEvent(displayText,
                               aFolder,
                               statusText,
                               Date.now(),  // start time
                               Date.now()); // completion time

    event.iconClass = "syncMail";

    let downloadItem = {numMsgsDownloaded: aNumMsgsDownloaded};
    this._mostRecentActivityForFolder.set(aFolder.URI, downloadItem);
    downloadItem.eventID = this.activityMgr.addActivity(event);
    if (!aNumMsgsDownloaded) {
      // If we didn't download any messages this time, and the prev event
      // for this folder also didn't download any messages, remove the
      // prev event from the activity manager.
      let prevItem = this._prevActivityForFolder.get(aFolder.URI);
      if (prevItem != undefined && !prevItem.numMsgsDownloaded) {
        if (this.activityMgr.containsActivity(prevItem.eventID))
          this.activityMgr.removeActivity(prevItem.eventID);
      }
    }
  },
  init() {
    // XXX when do we need to remove ourselves?
    MailServices.pop3.addListener(this);
  },
};
