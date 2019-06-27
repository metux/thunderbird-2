/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["MailUtils"];

const {
  fixIterator,
  toXPCOMArray,
} = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
const {MailConsts} = ChromeUtils.import("resource:///modules/MailConsts.jsm");
const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {PluralForm} = ChromeUtils.import("resource://gre/modules/PluralForm.jsm");

var MC = MailConsts;

/**
 * This module has several utility functions for use by both core and
 * third-party code. Some functions are aimed at code that doesn't have a
 * window context, while others can be used anywhere.
 */
var MailUtils = {
  /**
   * Discover all folders. This is useful during startup, when you have code
   * that deals with folders and that executes before the main 3pane window is
   * open (the folder tree wouldn't have been initialized yet).
   */
  discoverFolders() {
    let servers = MailServices.accounts.allServers;
    for (let server of fixIterator(servers, Ci.nsIMsgIncomingServer)) {
      // Bug 466311 Sometimes this can throw file not found, we're unsure
      // why, but catch it and log the fact.
      try {
        server.rootFolder.subFolders;
      } catch (ex) {
        Services.console.logStringMessage("Discovering folders for account failed with " +
                                          "exception: " + ex);
      }
    }
  },

  /**
   * Get the nsIMsgFolder corresponding to this file. This just looks at all
   * folders and does a direct match.
   *
   * One of the places this is used is desktop search integration -- to open
   * the search result corresponding to a mozeml/wdseml file, we need to figure
   * out the folder using the file's path.
   *
   * @param aFile the nsIFile to convert to a folder
   * @returns the nsIMsgFolder corresponding to aFile, or null if the folder
   *          isn't found
   */
  getFolderForFileInProfile(aFile) {
    let folders = MailServices.accounts.allFolders;

    for (let folder of fixIterator(folders, Ci.nsIMsgFolder)) {
      if (folder.filePath.equals(aFile))
        return folder;
    }
    return null;
  },

  /**
   * Get the nsIMsgFolder corresponding to this URI.
   *
   * @param aFolderURI the URI of the target folder
   * @returns {nsIMsgFolder} Folder corresponding to this URI, or null if
   *          the folder doesn't already exist.
   */
  getExistingFolder(aFolderURI) {
    let fls = Cc["@mozilla.org/mail/folder-lookup;1"]
                .getService(Ci.nsIFolderLookupService);
    return fls.getFolderForURL(aFolderURI);
  },

  /**
   * Get the nsIMsgFolder corresponding to this URI, or create a detached
   * folder if it doesn't already exist.
   *
   * @param aFolderURI the URI of the target folder
   * @returns {nsIMsgFolder} Folder corresponding to this URI.
   */
  getOrCreateFolder(aFolderURI) {
    let fls = Cc["@mozilla.org/mail/folder-lookup;1"]
                .getService(Ci.nsIFolderLookupService);
    return fls.getOrCreateFolderForURL(aFolderURI);
  },

  /**
   * Display this message header in a new tab, a new window or an existing
   * window, depending on the preference and whether a 3pane or standalone
   * window is already open. This function should be called when you'd like to
   * display a message to the user according to the pref set.
   *
   * @note Do not use this if you want to open multiple messages at once. Use
   *       |displayMessages| instead.
   *
   * @param aMsgHdr the message header to display
   * @param [aViewWrapperToClone] a view wrapper to clone. If null or not
   *                              given, the message header's folder's default
   *                              view will be used
   * @param [aTabmail] a tabmail element to use in case we need to open tabs.
   *                   If null or not given:
   *                   - if one or more 3pane windows are open, the most recent
   *                     one's tabmail is used
   *                   - if no 3pane windows are open, a standalone window is
   *                     opened instead of a tab
   */
  displayMessage(aMsgHdr, aViewWrapperToClone, aTabmail) {
    this.displayMessages([aMsgHdr], aViewWrapperToClone, aTabmail);
  },

  /**
   * Display the warning if the number of messages to be displayed is greater than
   * the limit set in preferences.
   * @param aNumMessages: number of messages to be displayed
   * @param aConfirmTitle: title ID
   * @param aConfirmMsg: message ID
   * @param aLiitingPref: the name of the pref to retrieve the limit from
   */
  confirmAction(aNumMessages, aConfirmTitle, aConfirmMsg, aLimitingPref) {
    let openWarning = Services.prefs.getIntPref(aLimitingPref);
    if ((openWarning > 1) && (aNumMessages >= openWarning)) {
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/messenger.properties");
      let title = bundle.GetStringFromName(aConfirmTitle);
      let message = PluralForm.get(aNumMessages,
        bundle.GetStringFromName(aConfirmMsg))
                .replace("#1", aNumMessages);
      if (!Services.prompt.confirm(null, title, message))
        return true;
    }
    return false;
  },
  /**
   * Display these message headers in new tabs, new windows or existing
   * windows, depending on the preference, the number of messages, and whether
   * a 3pane or standalone window is already open. This function should be
   * called when you'd like to display multiple messages to the user according
   * to the pref set.
   *
   * @param aMsgHdrs an array containing the message headers to display. The
   *                 array should contain at least one message header
   * @param [aViewWrapperToClone] a DB view wrapper to clone for each of the
   *                              tabs or windows
   * @param [aTabmail] a tabmail element to use in case we need to open tabs.
   *                   If given, the window containing the tabmail is assumed
   *                   to be in front. If null or not given:
   *                   - if one or more 3pane windows are open, the most recent
   *                     one's tabmail is used, and the window is brought to the
   *                     front
   *                   - if no 3pane windows are open, standalone windows are
   *                     opened instead of tabs
   */
  displayMessages(aMsgHdrs, aViewWrapperToClone, aTabmail) {
    let openMessageBehavior = Services.prefs.getIntPref(
                                  "mail.openMessageBehavior");

    if (openMessageBehavior == MC.OpenMessageBehavior.NEW_WINDOW) {
      this.openMessagesInNewWindows(aMsgHdrs, aViewWrapperToClone);
    } else if (openMessageBehavior == MC.OpenMessageBehavior.EXISTING_WINDOW) {
      // Try reusing an existing window. If we can't, fall back to opening new
      // windows
      if (aMsgHdrs.length > 1 || !this.openMessageInExistingWindow(aMsgHdrs[0]))
        this.openMessagesInNewWindows(aMsgHdrs, aViewWrapperToClone);
    } else if (openMessageBehavior == MC.OpenMessageBehavior.NEW_TAB) {
      let mail3PaneWindow = null;
      if (!aTabmail) {
        // Try opening new tabs in a 3pane window
        mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
        if (mail3PaneWindow)
          aTabmail = mail3PaneWindow.document.getElementById("tabmail");
      }

      if (aTabmail) {
        if (this.confirmAction(aMsgHdrs.length, "openTabWarningTitle",
                               "openTabWarningConfirmation",
                               "mailnews.open_tab_warning"))
          return;
        for (let [i, msgHdr] of aMsgHdrs.entries())
          // Open all the tabs in the background, except for the last one
          aTabmail.openTab("message", {
            msgHdr,
            viewWrapperToClone: aViewWrapperToClone,
            background: (i < (aMsgHdrs.length - 1)),
            disregardOpener: (aMsgHdrs.length > 1),
          });

        if (mail3PaneWindow)
          mail3PaneWindow.focus();
      } else {
        // We still haven't found a tabmail, so we'll need to open new windows
        this.openMessagesInNewWindows(aMsgHdrs, aViewWrapperToClone);
      }
    }
  },

  /**
   * Show this message in an existing window.
   *
   * @param aMsgHdr the message header to display
   * @param [aViewWrapperToClone] a DB view wrapper to clone for the message
   *                              window
   * @returns true if an existing window was found and the message header was
   *          displayed, false otherwise
   */
  openMessageInExistingWindow(aMsgHdr, aViewWrapperToClone) {
    let messageWindow = Services.wm.getMostRecentWindow("mail:messageWindow");
    if (messageWindow) {
      messageWindow.displayMessage(aMsgHdr, aViewWrapperToClone);
      return true;
    }
    return false;
  },

  /**
   * Open a new standalone message window with this header.
   *
   * @param aMsgHdr the message header to display
   * @param [aViewWrapperToClone] a DB view wrapper to clone for the message
   *                              window
   */
  openMessageInNewWindow(aMsgHdr, aViewWrapperToClone) {
    // It sucks that we have to go through XPCOM for this
    let args = {msgHdr: aMsgHdr, viewWrapperToClone: aViewWrapperToClone};
    args.wrappedJSObject = args;

    Services.ww.openWindow(null,
        "chrome://messenger/content/messageWindow.xul", "",
        "all,chrome,dialog=no,status,toolbar", args);
  },

  /**
   * Open new standalone message windows for these headers. This will prompt
   * for confirmation if the number of windows to be opened is greater than the
   * value of the mailnews.open_window_warning preference.
   *
   * @param aMsgHdrs an array containing the message headers to display
   * @param [aViewWrapperToClone] a DB view wrapper to clone for each message
   *                              window
   */
  openMessagesInNewWindows(aMsgHdrs, aViewWrapperToClone) {
    if (this.confirmAction(aMsgHdrs.length, "openWindowWarningTitle",
                           "openWindowWarningConfirmation",
                           "mailnews.open_window_warning"))
      return;

    for (let msgHdr of aMsgHdrs)
      this.openMessageInNewWindow(msgHdr, aViewWrapperToClone);
  },

  /**
   * Display this message header in a folder tab in a 3pane window. This is
   * useful when the message needs to be displayed in the context of its folder
   * or thread.
   *
   * @param aMsgHdr the message header to display
   */
  displayMessageInFolderTab(aMsgHdr) {
    // Try opening new tabs in a 3pane window
    let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
    if (mail3PaneWindow) {
      mail3PaneWindow.MsgDisplayMessageInFolderTab(aMsgHdr);
    } else {
      let args = {msgHdr: aMsgHdr};
      args.wrappedJSObject = args;
      Services.ww.openWindow(null,
          "chrome://messenger/content/", "",
          "all,chrome,dialog=no,status,toolbar", args);
    }
  },

  /**
   * The number of milliseconds to wait between loading of folders in
   * |setStringPropertyOnFolderAndDescendents|.  We wait at all because
   * opening msf databases is a potentially expensive synchronous operation that
   * can approach the order of a second in pathological cases like gmail's
   * all mail folder.
   *
   * If we did not use a timer or otherwise spin the event loop we would
   * completely lock up the UI.  In theory we would still maintain some degree
   * of UI responsiveness if we just used postMessage to break up our work so
   * that the event loop still got a chance to run between our folder openings.
   * The use of any delay between processing folders is to try and avoid causing
   * system-wide interactivity problems from dominating the system's available
   * disk seeks to such an extent that other applications start experiencing
   * non-trivial I/O waits.
   *
   * The specific choice of delay remains an arbitrary one to maintain app
   * and system responsiveness per the above while also processing as many
   * folders as quickly as possible.
   *
   * This is exposed primarily to allow unit tests to set this to 0 to minimize
   * throttling.
   */
  INTER_FOLDER_PROCESSING_DELAY_MS: 10,

  /**
   * Set a string property on a folder and all of its descendents, taking care
   * to avoid locking up the main thread and to avoid leaving folder databases
   * open.  To avoid locking up the main thread we operate in an asynchronous
   * fashion; we invoke a callback when we have completed our work.
   *
   * Using this function will write the value into the folder cache
   * (panacea.dat) as well as the folder itself.  Hopefully you want this; if
   * you do not, keep in mind that the only way to avoid that is to retrieve
   * the nsIMsgDatabase and then the nsIDbFolderInfo.  You would want to avoid
   * that as much as possible because once those are exposed to you, XPConnect
   * is going to hold onto them creating a situation where you are going to be
   * in severe danger of extreme memory bloat unless you force garbage
   * collections after every time you close a database.
   *
   * @param aPropertyName The name of the property to set.
   * @param aPropertyValue The (string) value of the property to set.
   *     Alternately, you can pass a function that takes the nsIMsgFolder and
   *     returns a string value.
   * @param aFolder The parent folder; we set the string property on it and all
   *     of its descendents.
   * @param [aCallback] The optional callback to invoke once we finish our work.
   *     The callback is provided a boolean success value; true means we
   *     managed to set the values on all folders, false means we encountered a
   *     problem.
   */
  setStringPropertyOnFolderAndDescendents(aPropertyName, aPropertyValue, aFolder, aCallback) {
    // We need to add the base folder as it does not get added by ListDescendants.
    let allFolders = toXPCOMArray([aFolder], Ci.nsIMutableArray);
    // - get all the descendants
    aFolder.ListDescendants(allFolders);

    // - worker function
    function* folder_string_setter_worker() {
      for (let folder of fixIterator(allFolders, Ci.nsIMsgFolder)) {
        // set the property; this may open the database...
        let value = (typeof aPropertyValue == "function" ?
                     aPropertyValue(folder) : aPropertyValue);
        folder.setStringProperty(aPropertyName, value);
        // force the reference to be forgotten.
        folder.msgDatabase = null;
        yield undefined;
      }
    }
    let worker = folder_string_setter_worker();

    // - driver logic
    let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    function folder_string_setter_driver() {
      try {
        if (worker.next().done) {
          timer.cancel();
          if (aCallback)
            aCallback(true);
        }
      } catch (ex) {
        // Any type of exception kills the generator.
        timer.cancel();
        if (aCallback)
          aCallback(false);
      }
    }
    // make sure there is at least 100 ms of not us between doing things.
    timer.initWithCallback(folder_string_setter_driver,
                           this.INTER_FOLDER_PROCESSING_DELAY_MS,
                           Ci.nsITimer.TYPE_REPEATING_SLACK);
  },

  /**
   * Get the identity that most likely is the best one to use, given the hint.
   * @param identities    nsIArray<nsIMsgIdentity> of identities
   * @param optionalHint  string containing comma separated mailboxes
   * @param useDefault    If true, use the default identity of the default
   *                      account as last choice. This is useful when all
   *                      identities are passed in. Otherwise, use the first
   *                      entity in the list.
   */
  getBestIdentity(identities, optionalHint, useDefault = false) {
    let identityCount = identities.length;
    if (identityCount < 1)
      return null;

    // If we have more than one identity and a hint to help us pick one.
    if (identityCount > 1 && optionalHint) {
      // Normalize case on the optional hint to improve our chances of
      // finding a match.
      optionalHint = optionalHint.toLowerCase();
      let hints = optionalHint.toLowerCase().split(",");

      for (let i = 0; i < hints.length; i++) {
        for (let identity of fixIterator(identities,
                                         Ci.nsIMsgIdentity)) {
          if (!identity.email)
            continue;
          if (hints[i].trim() == identity.email.toLowerCase() ||
              hints[i].includes("<" + identity.email.toLowerCase() + ">"))
            return identity;
        }
      }
    }

    // Still no matches? Give up and pick the default or the first one.
    if (useDefault) {
      let defaultAccount = MailServices.accounts.defaultAccount;
      if (defaultAccount && defaultAccount.defaultIdentity)
        return defaultAccount.defaultIdentity;
    }

    return identities.queryElementAt(0, Ci.nsIMsgIdentity);
  },

  getIdentityForServer(server, optionalHint) {
    var identities = MailServices.accounts.getIdentitiesForServer(server);
    return this.getBestIdentity(identities, optionalHint);
  },

  /**
   * Get the identity for the given header.
   * @param hdr nsIMsgHdr message header
   * @param type nsIMsgCompType compose type the identity is used for.
   */
  getIdentityForHeader(hdr, type, hint = "") {
    let server = null;
    let identity = null;
    let folder = hdr.folder;
    if (folder) {
      server = folder.server;
      identity = folder.customIdentity;
      if (identity)
        return identity;
    }

    if (!server) {
      let accountKey = hdr.accountKey;
      if (accountKey) {
        let account = MailServices.accounts.getAccount(accountKey);
        if (account)
          server = account.incomingServer;
      }
    }

    let hintForIdentity = "";
    if (type == Ci.nsIMsgCompType.ReplyToList)
      hintForIdentity = hint;
    else if (type == Ci.nsIMsgCompType.Template ||
             type == Ci.nsIMsgCompType.EditTemplate ||
             type == Ci.nsIMsgCompType.EditAsNew)
      hintForIdentity = hdr.author;
    else
      hintForIdentity = hdr.recipients + "," + hdr.ccList + "," + hint;

    if (server)
      identity = this.getIdentityForServer(server, hintForIdentity);

    if (!identity)
      identity = this.getBestIdentity(MailServices.accounts.allIdentities,
                                      hintForIdentity, true);
    return identity;
  },

  getInboxFolder(server) {
    try {
      var rootMsgFolder = server.rootMsgFolder;

      // Now find the Inbox.
      return rootMsgFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
    } catch (ex) {
      dump(ex + "\n");
    }
    return null;
  },
};
