var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var {mailTestUtils} = ChromeUtils.import("resource://testing-common/mailnews/mailTestUtils.js");
var {localAccountUtils} = ChromeUtils.import("resource://testing-common/mailnews/localAccountUtils.js");

var test = null;

// WebApps.jsm called by ProxyAutoConfig (PAC) requires a valid nsIXULAppInfo.
var {getAppInfo, newAppInfo, updateAppInfo} = ChromeUtils.import("resource://testing-common/AppInfo.jsm");
updateAppInfo();

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../";

// Import the pop3 server scripts
/* import-globals-from ../../../test/fakeserver/maild.js */
/* import-globals-from ../../../test/fakeserver/auth.js */
/* import-globals-from ../../../test/fakeserver/pop3d.js */
var {
  nsMailServer,
  gThreadManager,
  fsDebugNone,
  fsDebugAll,
  fsDebugRecv,
  fsDebugRecvSend,
} = ChromeUtils.import("resource://testing-common/mailnews/maild.js");
var {
  AuthPLAIN,
  AuthLOGIN,
  AuthCRAM,
} = ChromeUtils.import("resource://testing-common/mailnews/auth.js");
var {
  pop3Daemon,
  POP3_RFC1939_handler,
  POP3_RFC2449_handler,
  POP3_RFC5034_handler,
} = ChromeUtils.import("resource://testing-common/mailnews/pop3d.js");

// Setup the daemon and server
// If the debugOption is set, then it will be applied to the server.
function setupServerDaemon(debugOption) {
  var daemon = new pop3Daemon();
  var extraProps = {};
  function createHandler(d) {
    var handler = new POP3_RFC5034_handler(d);
    for (var prop in extraProps) {
      handler[prop] = extraProps[prop];
    }
    return handler;
  }
  var server = new nsMailServer(createHandler, daemon);
  if (debugOption)
    server.setDebugLevel(debugOption);
  return [daemon, server, extraProps];
}

function createPop3ServerAndLocalFolders(port, hostname = "localhost") {
  localAccountUtils.loadLocalMailAccount();
  let server = localAccountUtils.create_incoming_server("pop3", port,
    "fred", "wilma", hostname);
  return server;
}

var gCopyListener = {
  callbackFunction: null,
  copiedMessageHeaderKeys: [],
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {
    try {
      this.copiedMessageHeaderKeys.push(aKey);
    } catch (ex) {
      dump(ex);
    }
  },
  GetMessageId(aMessageId) {},
  OnStopCopy(aStatus) {
    if (this.callbackFunction) {
      mailTestUtils.do_timeout_function(0, this.callbackFunction,
                                        null,
                                        [this.copiedMessageHeaderKeys, aStatus]);
    }
  },
};

/**
 * copyFileMessageInLocalFolder
 * A utility wrapper of nsIMsgCopyService.CopyFileMessage to copy a message
 * into local inbox folder.
 *
 * @param aMessageFile     An instance of nsIFile to copy.
 * @param aMessageFlags    Message flags which will be set after message is
 *                         copied
 * @param aMessageKeyword  Keywords which will be set for newly copied
 *                         message
 * @param aMessageWindow   Window for notification callbacks, can be null
 * @param aCallback        Callback function which will be invoked after
 *                         message is copied
 */
function copyFileMessageInLocalFolder(aMessageFile,
                                      aMessageFlags,
                                      aMessageKeywords,
                                      aMessageWindow,
                                      aCallback) {
  // Set up local folders
  localAccountUtils.loadLocalMailAccount();

  gCopyListener.callbackFunction = aCallback;
  // Copy a message into the local folder
  MailServices.copy.CopyFileMessage(aMessageFile,
                                    localAccountUtils.inboxFolder,
                                    null, false,
                                    aMessageFlags,
                                    aMessageKeywords,
                                    gCopyListener,
                                    aMessageWindow);
}

function do_check_transaction(real, expected) {
  // If we don't spin the event loop before starting the next test, the readers
  // aren't expired. In this case, the "real" real transaction is the last one.
  if (real instanceof Array)
    real = real[real.length - 1];

  // real.them may have an extra QUIT on the end, where the stream is only
  // closed after we have a chance to process it and not them. We therefore
  // excise this from the list
  if (real.them[real.them.length - 1] == "QUIT")
    real.them.pop();

  Assert.equal(real.them.join(","), expected.join(","));
  dump("Passed test " + test + "\n");
}

function create_temporary_directory() {
  let directory = Services.dirsvc.get("TmpD", Ci.nsIFile);
  directory.append("mailFolder");
  directory.createUnique(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0700", 8));
  return directory;
}

function create_sub_folders(parent, subFolders) {
  parent.leafName = parent.leafName + ".sbd";
  parent.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0700", 8));

  for (let folder in subFolders) {
    let subFolder = parent.clone();
    subFolder.append(subFolders[folder].name);
    subFolder.create(Ci.nsIFile.NORMAL_FILE_TYPE, parseInt("0600", 8));
    if (subFolders[folder].subFolders)
      create_sub_folders(subFolder, subFolders[folder].subFolders);
  }
}

function create_mail_directory(subFolders) {
  let root = create_temporary_directory();

  for (let folder in subFolders) {
    if (!subFolders[folder].subFolders)
      continue;
    let directory = root.clone();
    directory.append(subFolders[folder].name);
    create_sub_folders(directory, subFolders[folder].subFolders);
  }

  return root;
}

function setup_mailbox(type, mailboxPath) {
  let user = Cc["@mozilla.org/uuid-generator;1"]
               .getService(Ci.nsIUUIDGenerator)
               .generateUUID().toString();
  let incomingServer =
    MailServices.accounts.createIncomingServer(user, "Local Folder", type);
  incomingServer.localPath = mailboxPath;

  return incomingServer.rootFolder;
}

registerCleanupFunction(function() {
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});
