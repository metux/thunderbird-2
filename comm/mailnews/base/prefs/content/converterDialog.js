/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file contains functionality for the front-end part of the mail store
 * type conversion.
 */

var {MailUtils} = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {FileUtils} = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var {Log} = ChromeUtils.import("resource://gre/modules/Log.jsm");
var {allAccountsSorted} = ChromeUtils.import("resource:///modules/folderUtils.jsm");
var MailstoreConverter = ChromeUtils.import("resource:///modules/mailstoreConverter.jsm");

var log = Log.repository.getLogger("MailStoreConverter");
// {nsIMsgIncomingServer} server for the account to be migrated.
var gServer;
// {nsIMsgFolder} account root folder.
var gFolder;
// 'gResponse.newRootFolder' is path to the new account root folder if migration
// is complete, else null.
// 'gResponse' is set to the modified response parameter received from
// am-server.js.
var gResponse;
// Array to hold deferred accounts.
var gDeferredAccounts = [];
// Value of Services.io.offline before migration.
var gOriginalOffline;
/**
 * Place account name in migration dialog modal.
 * @param {nsIMsgIncomingServer} aServer - account server.
 */
function placeAccountName(aServer) {
  gOriginalOffline = Services.io.offline;

  let bundle = Services.strings
    .createBundle("chrome://messenger/locale/converterDialog.properties");

  let brandShortName = Services.strings
    .createBundle("chrome://branding/locale/brand.properties")
    .GetStringFromName("brandShortName");

  // 'deferredToRootFolder' holds path of rootMsgFolder of account to which
  // other accounts have been deferred.
  let deferredToRootFolder = aServer.rootMsgFolder.filePath.path;
  // String to hold names of deferred accounts separated by commas.
  let deferredAccountsString = "";
  // Account to which other accounts have been deferred.
  let deferredToAccount;
  // Array of all accounts.
  let accounts = allAccountsSorted(true);

  for (let account of accounts) {
    if (account.incomingServer.rootFolder.filePath.path ==
        deferredToRootFolder) {
      // Other accounts may be deferred to this account.
      deferredToAccount = account;
    } else if (account.incomingServer.rootMsgFolder.filePath.path ==
               deferredToRootFolder) {
      // This is a deferred account.
      gDeferredAccounts.push(account);
    }
  }

  // String to hold the names of accounts to be converted separated by commas.
  let accountsToConvert = "";

  if (gDeferredAccounts.length >= 1) {
    // Add account names to 'accountsToConvert' and 'deferredAccountsString'.
    for (let i = 0; i < gDeferredAccounts.length; i++) {
      if (i < gDeferredAccounts.length - 1) {
        accountsToConvert += gDeferredAccounts[i].incomingServer.username + ", ";
        deferredAccountsString += gDeferredAccounts[i].incomingServer.username + ", ";
      } else {
        accountsToConvert += gDeferredAccounts[i].incomingServer.username;
        deferredAccountsString += gDeferredAccounts[i].incomingServer.username;
      }
    }

    // Username of Local Folders is "nobody". So it's better to use
    // its hostname which is "Local Folders".
    // TODO: maybe test against .key == MailServices.accounts.localFoldersServer.key ?
    if (deferredToAccount.incomingServer.hostName == "Local Folders") {
      accountsToConvert += ", " + deferredToAccount.incomingServer.prettyName;
    } else {
      accountsToConvert += ", " + deferredToAccount.incomingServer.prettyName;
    }
    log.info(accountsToConvert + " will be converted");
    let storeContractId = Services.prefs.getCharPref("mail.server." +
      deferredToAccount.incomingServer.key + ".storeContractID");

    if (storeContractId == "@mozilla.org/msgstore/berkeleystore;1") {
      storeContractId = "maildir";
    } else {
      storeContractId = "mbox";
    }

    // Username of Local Folders is "nobody". So it's better to use
    // its hostname which is "Local Folders".
    // TODO: maybe test against .key != MailServices.accounts.localFoldersServer.key ?
    let deferredToAccountName = deferredToAccount.incomingServer.hostName;
    if (deferredToAccountName != "Local Folders") {
      deferredToAccountName = deferredToAccount.incomingServer.username;
    }

    if (aServer.rootFolder.filePath.path != deferredToRootFolder) {
      document.getElementById("warningSpan").textContent =
        bundle.formatStringFromName(
          "converterDialog.warningForDeferredAccount",
          [aServer.username, deferredToAccountName, deferredToAccountName,
          deferredAccountsString,
          accountsToConvert, storeContractId, brandShortName], 7);
    } else {
      document.getElementById("warningSpan").textContent =
        bundle.formatStringFromName(
          "converterDialog.warningForDeferredToAccount",
          [deferredToAccountName,
          deferredAccountsString,
          accountsToConvert, storeContractId, brandShortName], 5);
    }

    document.getElementById("messageSpan").textContent =
      bundle.formatStringFromName("converterDialog.messageForDeferredAccount",
                                  [accountsToConvert, storeContractId], 2);
    gServer = deferredToAccount.incomingServer;
  } else {
    // No account is deferred.
    let storeContractId = Services.prefs.getCharPref(
      "mail.server." + aServer.key + ".storeContractID");
    if (storeContractId == "@mozilla.org/msgstore/berkeleystore;1") {
      storeContractId = "maildir";
    } else {
      storeContractId = "mbox";
    }

    let tempName = aServer.username;
    if (tempName == "nobody") {
      tempName = "Local Folders";
    } else if (!tempName) {
      tempName = aServer.hostName;
    }

    document.getElementById("warningSpan").textContent =
      bundle.formatStringFromName("converterDialog.warning",
                                  [tempName, storeContractId, brandShortName],
                                  3);
    document.getElementById("messageSpan").textContent =
      bundle.formatStringFromName("converterDialog.message",
                                  [tempName, storeContractId], 2);
    gServer = aServer;
  }

  // Forces the resize of the dialog to the actual content
  window.sizeToContent();
}

/**
 * Start the conversion process.
 * @param {String} aSelectedStoreType - mailstore type selected by user.
 * @param {Object} aResponse - response from the migration dialog modal.
 */
function startContinue(aSelectedStoreType, aResponse) {
  gResponse = aResponse;
  gFolder = gServer.rootFolder.filePath;

  let bundle = Services.strings
    .createBundle("chrome://messenger/locale/converterDialog.properties");

  document.getElementById("progress").addEventListener("progress", function(e) {
   document.getElementById("progress").value = e.detail;
   document.getElementById("progressPrcnt").textContent =
     bundle.formatStringFromName("converterDialog.percentDone", [e.detail], 1);
  });

  document.getElementById("warning").setAttribute("hidden", "hidden");
  document.getElementById("progressDiv").removeAttribute("hidden");

  // Storing original prefs and root folder path
  // to revert changes in case of error.
  let p1 = "mail.server." + gServer.key + ".directory";
  let p2 = "mail.server." + gServer.key + ".directory-rel";
  let p3 = "mail.server." + gServer.key + ".newsrc.file";
  let p4 = "mail.server." + gServer.key + ".newsrc.file-rel";
  let p5 = "mail.server." + gServer.key + ".storeContractID";

  let originalDirectoryPref = Services.prefs.getCharPref(p1);
  let originalDirectoryRelPref = Services.prefs.getCharPref(p2);
  let originalNewsrcFilePref;
  let originalNewsrcFileRelPref;
  if (gServer.type == "nntp") {
    originalNewsrcFilePref = Services.prefs.getCharPref(p3);
    originalNewsrcFileRelPref = Services.prefs.getCharPref(p4);
  }
  let originalStoreContractID = Services.prefs.getCharPref(p5);
  let originalRootFolderPath = gServer.rootFolder.filePath.path;

  /**
   * Called when promise returned by convertMailStoreTo() is rejected.
   * @param {String} aReason - error because of which the promise was rejected.
   */
  function promiseRejected(aReason) {
    log.error("Conversion to '" + aSelectedStoreType + "' failed: " + aReason);
    document.getElementById("messageSpan").style.display = "none";

    document.getElementById("errorSpan").style.display = "block";
      gResponse.newRootFolder = null;

    // Revert prefs.
    Services.prefs.setCharPref(p1, originalDirectoryPref);
    Services.prefs.setCharPref(p2, originalDirectoryRelPref);
    if (gServer.type == "nntp") {
      Services.prefs.setCharPref(p3, originalNewsrcFilePref);
      Services.prefs.setCharPref(p4, originalNewsrcFileRelPref);
    }
    Services.prefs.setCharPref(p5, originalStoreContractID);
    Services.prefs.savePrefFile(null);
    if (gServer.rootFolder.filePath.path != originalRootFolderPath)
      gServer.rootFolder.filePath = new FileUtils.File(originalRootFolderPath);
    Services.io.offline = gOriginalOffline;
  }

  /**
   * Called when promise returned by convertMailStoreTo() is resolved.
   * @param {String} aVal - path of the new account root folder with which the
   * promise returned by convertMailStoreTo() is resolved.
   */
  function promiseResolved(aVal) {
    log.info("Converted to '" + aSelectedStoreType + "' - " + aVal);

    gResponse.newRootFolder = aVal;
    for (let deferredAccount of gDeferredAccounts) {
      let defServer = deferredAccount.incomingServer;
      defServer.rootMsgFolder.filePath = new FileUtils.File(aVal);
      Services.prefs.setCharPref("mail.server." + defServer.key +
        ".storeContractID", aSelectedStoreType);
    }

    Services.io.offline = gOriginalOffline;
    document.getElementById("cancel").style.display = "none";
    document.getElementById("finish").style.display = "inline-block";
    document.getElementById("messageSpan").style.display = "none";
    document.getElementById("completeSpan").style.display = "block";
  }

  /**
   * Check whether an mbox folder can be compacted or not.
   * @param {nsIMsgFolder} aFolder - mbox folder that is to be checked.
   */
  function canCompact(aFolder) {
    if (aFolder.expungedBytes != 0)
      return true;
    if (aFolder.hasSubFolders) {
      let subFolders = aFolder.subFolders;
      while (subFolders.hasMoreElements()) {
        if (canCompact(subFolders.getNext().QueryInterface(Ci.nsIMsgFolder)))
          return true;
      }
    }
    return false;
  }

  // Compaction (compactAll()) works only for mbox folders which satisfy one of
  // the following 2 conditions -
  //   1. Messages are moved out of the folder.
  //   2. Messages are moved out of some descendant folder of the folder.
  // If the account root folder can be compacted, start the conversion after
  // compacting it.
  if (originalStoreContractID == "@mozilla.org/msgstore/berkeleystore;1"
    &&
    canCompact(gServer.rootFolder)) {
    let urlListener = {
      OnStartRunningUrl(aUrl) {
      },
      OnStopRunningUrl(aUrl, aExitCode) {
        let pConvert = MailstoreConverter.convertMailStoreTo(originalStoreContractID,
          gServer, document.getElementById("progress"));
        pConvert.then(function(val) {
          promiseResolved(val);
        }).catch(function(reason) {
          promiseRejected(reason);
        });
      },
    };
    gServer.rootFolder.compactAll(urlListener, null, gServer.type == "imap" ||
      gServer.type == "nntp");
  } else {
    let pConvert = MailstoreConverter.convertMailStoreTo(originalStoreContractID,
      gServer, document.getElementById("progress"));
    pConvert.then(function(val) {
      promiseResolved(val);
    }).catch(function(reason) {
      promiseRejected(reason);
    });
  }
}

/**
 * Cancel the conversion.
 * @param {Object} aResponse - response param from the migration dialog modal.
 */
function cancelConversion(aResponse) {
  gResponse = aResponse;
  gResponse.newRootFolder = null;
  MailstoreConverter.terminateWorkers();
  Services.io.offline = gOriginalOffline;
  window.close();
}

/**
 * Called when "finish" button is clicked.
 */
function finishConversion() {
  window.close();
}
