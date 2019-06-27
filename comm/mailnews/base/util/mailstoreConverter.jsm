/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["convertMailStoreTo", "terminateWorkers"];

const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {FileUtils} = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
const {OS} = ChromeUtils.import("resource://gre/modules/osfile.jsm");
const {Log} = ChromeUtils.import("resource://gre/modules/Log.jsm");

let log = Log.repository.getLogger("MailStoreConverter");
log.level = Log.Level.Debug;
log.addAppender(new Log.DumpAppender(new Log.BasicFormatter()));

let gConverterWorker = null;


/**
 * Sets a server to use a different type of mailstore, converting
 * all the existing data.
 *
 * @param {String} aMailstoreContractId - XPCOM id of new mailstore type.
 * @param {nsIMsgServer} aServer        - server to migrate.
 * @param aEventTarget                  - if set, element to send progress events.
 *
 * @returns {Promise} - Resolves with a string containing the new root
 *                     directory for the migrated server.
 *                     Rejects with an error message.
 */
function convertMailStoreTo(aMailstoreContractId, aServer, aEventTarget) {
  let accountRootFolder = aServer.rootFolder.filePath;

  let srcType = null;
  let destType = null;
  if (aMailstoreContractId == "@mozilla.org/msgstore/maildirstore;1") {
    srcType = "maildir";
    destType = "mbox";
  } else {
    srcType = "mbox";
    destType = "maildir";
  }

  // Go offline before conversion, so there aren't messages coming in during
  // the process.
  Services.io.offline = true;
  let destDir = createTmpConverterFolder(accountRootFolder, aMailstoreContractId);

  // Return a promise that will complete once the worker is done.
  return new Promise(function(resolve, reject) {
    let worker = new ChromeWorker("resource:///modules/converterWorker.js");
    gConverterWorker = worker;

    // Helper to log error, clean up and reject with error message.
    let bailout = function(errmsg) {
      log.error("bailing out (" + errmsg + ")");
      // Cleanup.
      log.info("Trying to remove converter folder: " + destDir.path);
      destDir.remove(true);
      reject(errmsg);
    };

    // Handle exceptions thrown by the worker thread.
    worker.addEventListener("error", function(e) {
      // (e is type ErrorEvent)

      // if we're lucky, the error will contain location info
      if (e.filename && e.lineno) {
        bailout(e.filename + ":" + e.lineno + ": " + e.message);
      } else {
        bailout(e.message);
      }
    });

    // Handle updates from the worker thread.
    worker.addEventListener("message", function(e) {
      let response = e.data;
      // log.debug("WORKER SAYS: " + JSON.stringify(response) + "\n");
      if (response.msg == "progress") {
        let val = response.val;
        let total = response.total;

        // Send the percentage completion to the GUI.
        // XXX TODO: should probably check elapsed time, and throttle
        // the events to avoid spending all our time drawing!
        let ev = new Event("progress");
        ev.detail = parseInt((val / total) * 100);
        if (aEventTarget) {
          aEventTarget.dispatchEvent(ev);
        }
      }
      if (response.msg == "success") {
        // If we receive this, the worker has completed, without errors.
        let storeTypeIDs = {
          "mbox": "@mozilla.org/msgstore/berkeleystore;1",
          "maildir": "@mozilla.org/msgstore/maildirstore;1",
        };
        let newStoreTypeID = storeTypeIDs[destType];

        try {
          let finalRoot = installNewRoot(aServer, destDir, newStoreTypeID);
          log.info("Conversion complete. Converted dir installed as: " + finalRoot);
          resolve(finalRoot);
        } catch (e) {
          bailout("installNewRoot() failed");
        }
      }
    });

    // Kick off the worker.
    worker.postMessage({
      "srcType": srcType,
      "destType": destType,
      "srcRoot": accountRootFolder.path,
      "destRoot": destDir.path,
    });
  });
}

/**
 * Checks if Converter folder exists in tmp dir, removes it and creates a new
 * "Converter" folder.
 * @param {nsIFile} aFolder             - account root folder.
 * @param {String} aMailstoreContractId - XPCOM id of dest mailstore type
 *
 * @returns {nsIFile} - the new tmp directory to use as converter dest.
 */
function createTmpConverterFolder(aFolder, aMailstoreContractId) {
  let tmpDir = FileUtils.getDir("TmpD", [], false);
  let tmpFolder;
  switch (aMailstoreContractId) {
    case "@mozilla.org/msgstore/maildirstore;1": {
      if (aFolder.leafName.substr(-8) == "-maildir") {
        tmpFolder = new FileUtils.File(OS.Path.join(tmpDir.path,
          aFolder.leafName.substr(0, aFolder.leafName.length - 8) + "-mbox"));
      } else {
        tmpFolder = new FileUtils.File(OS.Path.join(tmpDir.path,
          aFolder.leafName + "-mbox"));
      }

      if (tmpFolder.exists()) {
        log.info("Temporary Converter folder " + tmpFolder.path +
                  " exists in tmp dir. Removing it");
        tmpFolder.remove(true);
      }
      return FileUtils.getDir("TmpD", [tmpFolder.leafName], true);
    }

    case "@mozilla.org/msgstore/berkeleystore;1": {
      if (aFolder.leafName.substr(-5) == "-mbox") {
        tmpFolder = new FileUtils.File(OS.Path.join(tmpDir.path,
          aFolder.leafName.substr(0, aFolder.leafName.length - 5) +
            "-maildir"));
      } else {
        tmpFolder = new FileUtils.File(OS.Path.join(tmpDir.path,
          aFolder.leafName + "-maildir"));
      }

      if (tmpFolder.exists()) {
        log.info("Temporary Converter folder " + tmpFolder.path +
                  "exists in tmp dir. Removing it");
        tmpFolder.remove(true);
      }
      return FileUtils.getDir("TmpD", [tmpFolder.leafName], true);
    }

    default: {
      throw new Error("Unexpected mailstoreContractId: " +
                      aMailstoreContractId);
    }
  }
}


/**
 * Switch server over to use the newly-converted directory tree.
 * Moves the converted directory into an appropriate place for the server.
 *
 * @param {nsIMsgServer} server   - server to migrate.
 * @param {String} dir            - dir of converted mailstore to install
 *                                  (will be moved by this function).
 * @param {String} newStoreTypeID - XPCOM id of new mailstore type.
 * @returns {String} new location of dir.
 */
function installNewRoot(server, dir, newStoreTypeID) {
  let accountRootFolder = server.rootFolder.filePath;

  // Migration is complete, get path of parent of account root
  // folder into "parentPath" check if Converter folder already
  // exists in "parentPath". If yes, remove it.
  let lastSlash = accountRootFolder.path.lastIndexOf("/");
  let parentPath = accountRootFolder.parent.path;
  log.info("Path to parent folder of account root" +
            " folder: " + parentPath);

  let parent = new FileUtils.File(parentPath);
  log.info("Path to parent folder of account root folder: " +
    parent.path);

  let converterFolder = new FileUtils.File(OS.Path.join(parent.path,
    dir.leafName));
  if (converterFolder.exists()) {
    log.info("Converter folder exists in " + parentPath +
              ". Removing already existing folder");
    converterFolder.remove(true);
  }

  // Move Converter folder into the parent of account root folder.
  try {
    dir.moveTo(parent, dir.leafName);
    // {nsIFile} new account root folder.
    log.info("Path to new account root folder: " + converterFolder.path);
  } catch (e) {
    // Cleanup.
    log.error(e);
    log.error("Trying to remove converter folder: " +
      converterFolder.path);
    converterFolder.remove(true);
    throw e;
  }

  // If the account is imap then copy the msf file for the original
  // root folder and rename the copy with the name of the new root
  // folder.
  if (server.type != "pop3" && server.type != "none" &&
    server.type != "movemail") {
    let converterFolderMsf = new FileUtils.File(OS.Path.join(
      parent.path, dir.leafName + ".msf"));
    if (converterFolderMsf.exists()) {
      converterFolderMsf.remove(true);
    }

    let oldRootFolderMsf = new FileUtils.File(OS.Path.join(
      parent.path, accountRootFolder.leafName + ".msf"));
    if (oldRootFolderMsf.exists()) {
      oldRootFolderMsf.copyTo(parent, converterFolderMsf.leafName);
    }
  }

  if (server.type == "nntp") {
    let converterFolderNewsrc = new FileUtils.File(OS.Path.join(
      parent.path, "newsrc-" + dir.leafName));
    if (converterFolderNewsrc.exists()) {
      converterFolderNewsrc.remove(true);
    }
    let oldNewsrc = new FileUtils.File(OS.Path.join(parent.path,
      "newsrc-" + accountRootFolder.leafName));
    if (oldNewsrc.exists()) {
      oldNewsrc.copyTo(parent, converterFolderNewsrc.leafName);
    }
  }

  server.rootFolder.filePath = converterFolder;
  server.localPath = converterFolder;
  log.info("Path to account root folder: " +
            server.rootFolder.filePath.path);

  // Set various preferences.
  let p1 = "mail.server." + server.key + ".directory";
  let p2 = "mail.server." + server.key + ".directory-rel";
  let p3 = "mail.server." + server.key + ".newsrc.file";
  let p4 = "mail.server." + server.key + ".newsrc.file-rel";
  let p5 = "mail.server." + server.key + ".storeContractID";

  Services.prefs.setCharPref(p1, converterFolder.path);
  log.info(p1 + ": " + converterFolder.path);

  // The directory-rel pref is of the form "[ProfD]Mail/pop.gmail.com
  // " (pop accounts) or "[ProfD]ImapMail/imap.gmail.com" (imap
  // accounts) ie the last slash "/" is followed by the root folder
  // name. So, replace the old root folder name that follows the last
  // slash with the new root folder name to set the correct value of
  // directory-rel pref.
  let directoryRel = Services.prefs.getCharPref(p2);
  lastSlash = directoryRel.lastIndexOf("/");
  directoryRel = directoryRel.slice(0, lastSlash) + "/" +
                                    converterFolder.leafName;
  Services.prefs.setCharPref(p2, directoryRel);
  log.info(p2 + ": " + directoryRel);

  if (server.type == "nntp") {
    let newNewsrc = FileUtils.File(OS.Path.join(parent.path,
      "newsrc-" + converterFolder.leafName));
    Services.prefs.setCharPref(p3, newNewsrc.path);

    // The newsrc.file-rel pref is of the form "[ProfD]News/newsrc-
    // news.mozilla.org" ie the last slash "/" is followed by the
    // newsrc file name. So, replace the old newsrc file name that
    // follows the last slash with the new newsrc file name to set
    // the correct value of newsrc.file-rel pref.
    let newsrcRel = Services.prefs.getCharPref(p4);
    lastSlash = newsrcRel.lastIndexOf("/");
    newsrcRel = newsrcRel.slice(0, lastSlash) + "/" +
                                newNewsrc.leafName;
    Services.prefs.setCharPref(p4, newsrcRel);
    log.info(p4 + ": " + newsrcRel);
  }

  Services.prefs.setCharPref(p5, newStoreTypeID);

  Services.prefs.savePrefFile(null);

  return converterFolder.path;
}

/**
 * Terminate any workers involved in the conversion process.
 */
function terminateWorkers() {
  // We're only using a single worker right now.
  if (gConverterWorker !== null) {
    gConverterWorker.terminate();
    gConverterWorker = null;
  }
}
