/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {ctypes} = ChromeUtils.import("resource:///modules/ctypes.jsm");
var {localAccountUtils} = ChromeUtils.import("resource://testing-common/mailnews/localAccountUtils.js");

// Ensure the profile directory is set up.
do_get_profile();

// Import fakeserver
var {nsMailServer} = ChromeUtils.import("resource://testing-common/mailnews/maild.js");
var {
  smtpDaemon,
  SMTP_RFC2821_handler,
} = ChromeUtils.import("resource://testing-common/mailnews/smtpd.js");

var SMTP_PORT = 1024 + 120;
var POP3_PORT = 1024 + 121;

// Setup the daemon and server
function setupServerDaemon(handler) {
  if (!handler)
    handler = function(d) { return new SMTP_RFC2821_handler(d); };
  let daemon = new smtpDaemon();
  let server = new nsMailServer(handler, daemon);
  return [daemon, server];
}

function getBasicSmtpServer() {
  // We need to have a default account for MAPI.
  localAccountUtils.loadLocalMailAccount();
  let incoming = localAccountUtils.create_incoming_server("pop3", POP3_PORT,
    "user", "password");
  let server = localAccountUtils.create_outgoing_server(SMTP_PORT,
    "user", "password");
  // We also need to have a working identity, including an email address.
  let account = MailServices.accounts.FindAccountForServer(incoming);
  localAccountUtils.associate_servers(account, server, true);
  let identity = account.defaultIdentity;
  identity.email = "tinderbox@tinderbox.invalid";
  MailServices.accounts.defaultAccount = account;

  return server;
}

/**
 * Returns a structure allowing access to all of the Simple MAPI functions.
 * The functions do not have the MAPI prefix on the variables. Also added are
 * the three structures needed for MAPI.
 */
function loadMAPILibrary() {
  // This is a hack to load the MAPI support in the current environment, as the
  // profile-after-change event is never sent out.
  var gMapiSupport = Cc["@mozilla.org/mapisupport;1"]
                       .getService(Ci.nsIObserver);
  gMapiSupport.observe(null, "profile-after-change", null);
  // Set some preferences to make MAPI (particularly blind MAPI, aka work
  // without a dialog box) work properly.
  Services.prefs.setBoolPref("mapi.blind-send.enabled", true);
  Services.prefs.setBoolPref("mapi.blind-send.warn", false);

  // The macros that are used in the definitions
  let WINAPI = ctypes.winapi_abi;
  let ULONG = ctypes.unsigned_long;
  let LHANDLE = ULONG.ptr;
  let LPSTR = ctypes.char.ptr;
  let LPVOID = ctypes.voidptr_t;
  let FLAGS = ctypes.unsigned_long;

  // Define all of the MAPI structs we need to use.
  let functionData = {};
  functionData.MapiRecipDesc = new ctypes.StructType("gMapi.MapiRecipDesc", [
    {ulReserved: ULONG},
    {ulRecipClass: ULONG},
    {lpszName: LPSTR},
    {lpszAddress: LPSTR},
    {ulEIDSize: ULONG},
    {lpEntryID: LPVOID},
  ]);
  let lpMapiRecipDesc = functionData.MapiRecipDesc.ptr;

  functionData.MapiFileDesc = new ctypes.StructType("gMapi.MapiFileDesc", [
    {ulReserved: ULONG},
    {flFlags: ULONG},
    {nPosition: ULONG},
    {lpszPathName: LPSTR},
    {lpszFileName: LPSTR},
    {lpFileType: LPVOID},
  ]);
  let lpMapiFileDesc = functionData.MapiFileDesc.ptr;

  functionData.MapiMessage = new ctypes.StructType("gMapi.MapiMessage", [
    {ulReserved: ULONG},
    {lpszSubject: LPSTR},
    {lpszNoteText: LPSTR},
    {lpszMessageType: LPSTR},
    {lpszDateReceived: LPSTR},
    {lpszConversationID: LPSTR},
    {flFlags: FLAGS},
    {lpOriginator: lpMapiRecipDesc},
    {nRecipCount: ULONG},
    {lpRecips: lpMapiRecipDesc},
    {nFileCount: ULONG},
    {lpFiles: lpMapiFileDesc},
  ]);
  let lpMapiMessage = functionData.MapiMessage.ptr;

  // Load the MAPI library. We're using our definition instead of the global
  // MAPI definition.
  let mapi = ctypes.open("mozMapi32.dll");

  // Load the MAPI functions,
  // see https://developer.mozilla.org/en-US/docs/Mozilla/js-ctypes/Using_js-ctypes/Declaring_types
  // for details. The first three parameters of the declaration are name, API flag and output value.
  // This is followed by input parameters.

  // MAPIAddress is not supported.

  functionData.DeleteMail = mapi.declare(
    "MAPIDeleteMail", WINAPI, ULONG,
    LHANDLE,    // lhSession
    ULONG.ptr,  // ulUIParam
    LPSTR,      // lpszMessageID
    FLAGS,      // flFlags
    ULONG);     // ulReserved

  // MAPIDetails is not supported.

  functionData.FindNext = mapi.declare(
    "MAPIFindNext", WINAPI, ULONG,
    LHANDLE,    // lhSession
    ULONG.ptr,  // ulUIParam
    LPSTR,      // lpszMessageType
    LPSTR,      // lpszSeedMessageID
    FLAGS,      // flFlags
    ULONG,      // ulReserved
    LPSTR);     // lpszMessageID

  functionData.FreeBuffer = mapi.declare(
    "MAPIFreeBuffer", WINAPI, ULONG,
    LPVOID);    // pv

  functionData.Logoff = mapi.declare(
    "MAPILogoff", WINAPI, ULONG,
    LHANDLE,    // lhSession
    ULONG.ptr,  // ulUIParam
    FLAGS,      // flFlags
    ULONG);     // ulReserved

  functionData.Logon = mapi.declare(
    "MAPILogon", WINAPI, ULONG,
    ULONG.ptr,  // ulUIParam
    LPSTR,      // lpszProfileName
    LPSTR,      // lpszPassword
    FLAGS,      // flFlags
    ULONG,      // ulReserved
    LHANDLE.ptr); // lplhSession

  functionData.ReadMail = mapi.declare(
    "MAPIReadMail", WINAPI, ULONG,
    LHANDLE,    // lhSession
    ULONG.ptr,  // ulUIParam
    LPSTR,      // lpszMessageID
    FLAGS,      // flFlags
    ULONG,      // ulReserved
    lpMapiMessage.ptr); // *lppMessage

  functionData.ResolveName = mapi.declare(
    "MAPIResolveName", WINAPI, ULONG,
    LHANDLE,    // lhSession
    ULONG.ptr,  // ulUIParam
    LPSTR,      // lpszName
    FLAGS,      // flFlags
    ULONG,      // ulReserved
    lpMapiRecipDesc.ptr); // *lppRecip

  // MAPISaveMail is not supported.

  functionData.SendDocuments = mapi.declare(
    "MAPISendDocuments", WINAPI, ULONG,
    ULONG.ptr,  // ulUIParam
    LPSTR,      // lpszDelimChar
    LPSTR,      // lpszFilePaths
    LPSTR,      // lpszFileNames
    ULONG);     // ulReserved

  functionData.SendMail = mapi.declare(
    "MAPISendMail", WINAPI, ULONG,
    LHANDLE,    // lhSession
    ULONG.ptr,  // ulUIParam
    lpMapiMessage, // lpMessage
    FLAGS,      // flFlags
    ULONG);     // ulReserved

  return functionData;
}
