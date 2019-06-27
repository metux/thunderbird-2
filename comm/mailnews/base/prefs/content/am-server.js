/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-prefs.js */
/* import-globals-from amUtils.js */

var {fixIterator} = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailUtils} = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var {BrowserUtils} = ChromeUtils.import("resource://gre/modules/BrowserUtils.jsm");

var gServer;
var gOriginalStoreType;

/**
 * Called when the store type menu is clicked.
 * @param {Object} aStoreTypeElement - store type menu list element.
 */
function clickStoreTypeMenu(aStoreTypeElement) {
  if (aStoreTypeElement.value == gOriginalStoreType) {
    return;
  }

  // Response from migration dialog modal. If the conversion is complete
  // 'response.newRootFolder' will hold the path to the new account root folder,
  // otherwise 'response.newRootFolder' will be null.
  let response = { newRootFolder: null };
  // Send 'response' as an argument to converterDialog.xhtml.
  window.openDialog("converterDialog.xhtml", "mailnews:mailstoreconverter",
                    "modal,centerscreen,resizable=no,width=700,height=130", gServer,
                    aStoreTypeElement.value, response);
  changeStoreType(response);
}

/**
 * Revert store type to the original store type if converter modal closes
 * before migration is complete, otherwise change original store type to
 * currently selected store type.
 * @param {Object} aResponse - response from migration dialog modal.
 */
function changeStoreType(aResponse) {
  if (aResponse.newRootFolder) {
    // The conversion is complete.
    // Set local path to the new account root folder which is present
    // in 'aResponse.newRootFolder'.
    if (gServer.type == "nntp") {
      let newRootFolder = aResponse.newRootFolder;
      let lastSlash = newRootFolder.lastIndexOf("/");
      let newsrc = newRootFolder.slice(0, lastSlash) + "/newsrc-" +
                   newRootFolder.slice(lastSlash + 1);
      document.getElementById("nntp.newsrcFilePath").value = newsrc;
    }

    document.getElementById("server.localPath").value = aResponse.newRootFolder;
    gOriginalStoreType = document.getElementById("server.storeTypeMenulist")
                                 .value;
    BrowserUtils.restartApplication();
  } else {
    // The conversion failed or was cancelled.
    // Restore selected item to what was selected before conversion.
    document.getElementById("server.storeTypeMenulist").value =
      gOriginalStoreType;
  }
}

function onSave() {
  let storeContractID = document.getElementById("server.storeTypeMenulist")
                                .selectedItem
                                .value;
  document.getElementById("server.storeContractID")
          .setAttribute("value", storeContractID);
}

function onInit(aPageId, aServerId) {
  initServerType();

  onCheckItem("server.biffMinutes", ["server.doBiff"]);
  onCheckItem("nntp.maxArticles", ["nntp.notifyOn"]);
  setupMailOnServerUI();
  setupFixedUI();
  let serverType = document.getElementById("server.type").getAttribute("value");
  if (serverType == "imap")
    setupImapDeleteUI(aServerId);

  // TLS Cert (External) and OAuth2 are only supported on IMAP.
  document.getElementById("authMethod-oauth2").hidden = (serverType != "imap");
  document.getElementById("authMethod-external").hidden = (serverType != "imap");

  // "STARTTLS, if available" is vulnerable to MITM attacks so we shouldn't
  // allow users to choose it anymore. Hide the option unless the user already
  // has it set.
  hideUnlessSelected(document.getElementById("connectionSecurityType-1"));

  // UI for account store type.
  let storeTypeElement = document.getElementById("server.storeTypeMenulist");
  // set the menuitem to match the account
  let currentStoreID = document.getElementById("server.storeContractID")
                               .getAttribute("value");
  let targetItem = storeTypeElement.getElementsByAttribute("value", currentStoreID);
  storeTypeElement.selectedItem = targetItem[0];
  // Disable store type change if store has not been used yet.
  storeTypeElement.setAttribute("disabled",
    gServer.getBoolValue("canChangeStoreType") ?
      "false" : !Services.prefs.getBoolPref("mail.store_conversion_enabled"));
  // Initialise 'gOriginalStoreType' to the item that was originally selected.
  gOriginalStoreType = storeTypeElement.value;
}

function onPreInit(account, accountValues) {
  var type = parent.getAccountValue(account, accountValues, "server", "type", null, false);
  hideShowControls(type);

  gServer = account.incomingServer;

  if (!account.incomingServer.canEmptyTrashOnExit) {
    document.getElementById("server.emptyTrashOnExit").setAttribute("hidden", "true");
    document.getElementById("imap.deleteModel.box").setAttribute("hidden", "true");
  }
}

function initServerType() {
  var serverType = document.getElementById("server.type").getAttribute("value");
  var propertyName = "serverType-" + serverType;

  var messengerBundle = document.getElementById("bundle_messenger");
  var verboseName = messengerBundle.getString(propertyName);
  setDivText("servertype.verbose", verboseName);

  secureSelect(true);

  setLabelFromStringBundle("authMethod-no", "authNo");
  setLabelFromStringBundle("authMethod-old", "authOld");
  setLabelFromStringBundle("authMethod-kerberos", "authKerberos");
  setLabelFromStringBundle("authMethod-external", "authExternal");
  setLabelFromStringBundle("authMethod-ntlm", "authNTLM");
  setLabelFromStringBundle("authMethod-oauth2", "authOAuth2");
  setLabelFromStringBundle("authMethod-anysecure", "authAnySecure");
  setLabelFromStringBundle("authMethod-any", "authAny");
  setLabelFromStringBundle("authMethod-password-encrypted",
      "authPasswordEncrypted");
  // authMethod-password-cleartext already set in secureSelect()

  // Hide deprecated/hidden auth options, unless selected
  hideUnlessSelected(document.getElementById("authMethod-no"));
  hideUnlessSelected(document.getElementById("authMethod-old"));
  hideUnlessSelected(document.getElementById("authMethod-anysecure"));
  hideUnlessSelected(document.getElementById("authMethod-any"));
}

function hideUnlessSelected(element) {
  element.hidden = !element.selected;
}

function setLabelFromStringBundle(elementID, stringName) {
  document.getElementById(elementID).label =
      document.getElementById("bundle_messenger").getString(stringName);
}

function setDivText(divname, value) {
  var div = document.getElementById(divname);
  if (!div)
    return;
  div.setAttribute("value", value);
}


function onAdvanced() {
  // Store the server type and, if an IMAP or POP3 server,
  // the settings needed for the IMAP/POP3 tab into the array
  var serverSettings = {};
  var serverType = document.getElementById("server.type").getAttribute("value");
  serverSettings.serverType = serverType;

  serverSettings.serverPrettyName = gServer.prettyName;
  serverSettings.account = top.getCurrentAccount();

  if (serverType == "imap") {
    serverSettings.dualUseFolders = document.getElementById("imap.dualUseFolders").checked;
    serverSettings.usingSubscription = document.getElementById("imap.usingSubscription").checked;
    serverSettings.maximumConnectionsNumber = document.getElementById("imap.maximumConnectionsNumber").getAttribute("value");
    // string prefs
    serverSettings.personalNamespace = document.getElementById("imap.personalNamespace").getAttribute("value");
    serverSettings.publicNamespace = document.getElementById("imap.publicNamespace").getAttribute("value");
    serverSettings.serverDirectory = document.getElementById("imap.serverDirectory").getAttribute("value");
    serverSettings.otherUsersNamespace = document.getElementById("imap.otherUsersNamespace").getAttribute("value");
    serverSettings.overrideNamespaces = document.getElementById("imap.overrideNamespaces").checked;
  } else if (serverType == "pop3") {
    serverSettings.deferGetNewMail = document.getElementById("pop3.deferGetNewMail").checked;
    serverSettings.deferredToAccount = document.getElementById("pop3.deferredToAccount").getAttribute("value");
  }

  window.openDialog("chrome://messenger/content/am-server-advanced.xul",
                    "_blank", "chrome,modal,titlebar", serverSettings);

  if (serverType == "imap") {
    document.getElementById("imap.dualUseFolders").checked = serverSettings.dualUseFolders;
    document.getElementById("imap.usingSubscription").checked = serverSettings.usingSubscription;
    document.getElementById("imap.maximumConnectionsNumber").setAttribute("value", serverSettings.maximumConnectionsNumber);
    // string prefs
    document.getElementById("imap.personalNamespace").setAttribute("value", serverSettings.personalNamespace);
    document.getElementById("imap.publicNamespace").setAttribute("value", serverSettings.publicNamespace);
    document.getElementById("imap.serverDirectory").setAttribute("value", serverSettings.serverDirectory);
    document.getElementById("imap.otherUsersNamespace").setAttribute("value", serverSettings.otherUsersNamespace);
    document.getElementById("imap.overrideNamespaces").checked = serverSettings.overrideNamespaces;
  } else if (serverType == "pop3") {
    document.getElementById("pop3.deferGetNewMail").checked = serverSettings.deferGetNewMail;
    document.getElementById("pop3.deferredToAccount").setAttribute("value", serverSettings.deferredToAccount);
    let pop3Server = gServer.QueryInterface(Ci.nsIPop3IncomingServer);
    // we're explicitly setting this so we'll go through the SetDeferredToAccount method
    pop3Server.deferredToAccount = serverSettings.deferredToAccount;
    // Setting the server to be deferred causes a rebuild of the account tree,
    // losing the current selection. Reselect the current server again as it
    // didn't really disappear.
    parent.selectServer(parent.getCurrentAccount().incomingServer, parent.currentPageId);

    // Iterate over all accounts to see if any of their junk targets are now
    // invalid (pointed to the account that is now deferred).
    // If any such target is found it is reset to a new safe folder
    // (the deferred to account or Local Folders). If junk was really moved
    // to that folder (moveOnSpam = true) then moving junk is disabled
    // (so that the user notices it and checks the settings).
    // This is the same sanitization as in am-junk.js, just applied to all POP accounts.
    let deferredURI = serverSettings.deferredToAccount &&
                      MailServices.accounts.getAccount(serverSettings.deferredToAccount)
                                           .incomingServer.serverURI;

    for (let account of fixIterator(MailServices.accounts.accounts,
                                    Ci.nsIMsgAccount)) {
      let accountValues = parent.getValueArrayFor(account);
      let type = parent.getAccountValue(account, accountValues, "server", "type",
                                        null, false);
      // Try to keep this list of account types not having Junk settings
      // synchronized with the list in AccountManager.js.
      if (type != "nntp" && type != "rss" && type != "im") {
        let spamActionTargetAccount = parent.getAccountValue(account, accountValues,
          "server", "spamActionTargetAccount", "string", true);
        let spamActionTargetFolder =  parent.getAccountValue(account, accountValues,
          "server", "spamActionTargetFolder", "string", true);
        let moveOnSpam = parent.getAccountValue(account, accountValues,
          "server", "moveOnSpam", "bool", true);

        // Check if there are any invalid junk targets and fix them.
        [ spamActionTargetAccount, spamActionTargetFolder, moveOnSpam ] =
          sanitizeJunkTargets(spamActionTargetAccount,
                              spamActionTargetFolder,
                              deferredURI || account.incomingServer.serverURI,
                              parent.getAccountValue(account, accountValues, "server", "moveTargetMode", "int", true),
                              account.incomingServer.spamSettings,
                              moveOnSpam);

        parent.setAccountValue(accountValues, "server", "moveOnSpam", moveOnSpam);
        parent.setAccountValue(accountValues, "server", "spamActionTargetAccount",
                               spamActionTargetAccount);
        parent.setAccountValue(accountValues, "server", "spamActionTargetFolder",
                               spamActionTargetFolder);
      }
    }
  }
}

function secureSelect(aLoading) {
  var socketType = document.getElementById("server.socketType").value;
  var defaultPort = gServer.protocolInfo.getDefaultServerPort(false);
  var defaultPortSecure = gServer.protocolInfo.getDefaultServerPort(true);
  var port = document.getElementById("server.port");
  var portDefault = document.getElementById("defaultPort");
  var prevDefaultPort = portDefault.value;

  if (socketType == Ci.nsMsgSocketType.SSL) {
    portDefault.value = defaultPortSecure;
    if (port.value == "" || (!aLoading && port.value == defaultPort && prevDefaultPort != portDefault.value))
      port.value = defaultPortSecure;
  } else {
    portDefault.value = defaultPort;
    if (port.value == "" || (!aLoading && port.value == defaultPortSecure && prevDefaultPort != portDefault.value))
      port.value = defaultPort;
  }

  // switch "insecure password" label
  setLabelFromStringBundle("authMethod-password-cleartext",
    socketType == Ci.nsMsgSocketType.SSL ||
    socketType == Ci.nsMsgSocketType.alwaysSTARTTLS ?
    "authPasswordCleartextViaSSL" : "authPasswordCleartextInsecurely");
}

function setupMailOnServerUI() {
  onCheckItem("pop3.deleteMailLeftOnServer", ["pop3.leaveMessagesOnServer"]);
  setupAgeMsgOnServerUI();
}

function setupAgeMsgOnServerUI() {
  const kLeaveMsgsId = "pop3.leaveMessagesOnServer";
  const kDeleteByAgeId = "pop3.deleteByAgeFromServer";
  onCheckItem(kDeleteByAgeId, [kLeaveMsgsId]);
  onCheckItem("daysEnd", [kLeaveMsgsId]);
  onCheckItem("pop3.numDaysToLeaveOnServer", [kLeaveMsgsId, kDeleteByAgeId]);
}

function setupFixedUI() {
  var controls = [document.getElementById("fixedServerName"),
                  document.getElementById("fixedUserName"),
                  document.getElementById("fixedServerPort")];

  var len = controls.length;
  for (let i = 0; i < len; i++) {
    var fixedElement = controls[i];
    var otherElement = document.getElementById(fixedElement.getAttribute("use"));

    fixedElement.setAttribute("collapsed", "true");
    otherElement.removeAttribute("collapsed");
  }
}

function BrowseForNewsrc() {
  const nsIFilePicker = Ci.nsIFilePicker;
  const nsIFile = Ci.nsIFile;

  var newsrcTextBox = document.getElementById("nntp.newsrcFilePath");
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(window,
          document.getElementById("browseForNewsrc").getAttribute("filepickertitle"),
          nsIFilePicker.modeSave);

  var currentNewsrcFile;
  try {
    currentNewsrcFile = Cc["@mozilla.org/file/local;1"]
                          .createInstance(nsIFile);
    currentNewsrcFile.initWithPath(newsrcTextBox.value);
  } catch (e) {
    dump("Failed to create nsIFile instance for the current newsrc file.\n");
  }

  if (currentNewsrcFile) {
    fp.displayDirectory = currentNewsrcFile.parent;
    fp.defaultString = currentNewsrcFile.leafName;
  }

  fp.appendFilters(nsIFilePicker.filterAll);

  fp.open(rv => {
    if (rv != nsIFilePicker.returnOK || !fp.file) {
      return;
    }
    newsrcTextBox.value = fp.file.path;
  });
}

function setupImapDeleteUI(aServerId) {
  // read delete_model preference
  var deleteModel = document.getElementById("imap.deleteModel").getAttribute("value");
  selectImapDeleteModel(deleteModel);

  // read trash folder path preference
  var trashFolderName = getTrashFolderName();

  // set folderPicker menulist
  var trashPopup = document.getElementById("msgTrashFolderPopup");
  trashPopup._teardown();
  trashPopup._parentFolder = MailUtils.getOrCreateFolder(aServerId);
  trashPopup._ensureInitialized();

  // Convert the folder path in Unicode to MUTF-7.
  let manager = Cc["@mozilla.org/charset-converter-manager;1"]
                  .getService(Ci.nsICharsetConverterManager);
  // Escape backslash and double-quote with another backslash before encoding.
  let trashMutf7 = manager.unicodeToMutf7(trashFolderName.replace(/([\\"])/g, "\\$1"));
  // TODO: There is something wrong here, selectFolder() fails even if the
  // folder does exist. Try to fix in bug 802609.
  let trashFolder = MailUtils.getOrCreateFolder(aServerId + "/" + trashMutf7);
  try {
    trashPopup.selectFolder(trashFolder);
  } catch (ex) {
    trashPopup.parentNode.setAttribute("label", trashFolder.prettyName);
  }
  trashPopup.parentNode.folder = trashFolder;
}

function selectImapDeleteModel(choice) {
  // set deleteModel to selected mode
  document.getElementById("imap.deleteModel").setAttribute("value", choice);

  switch (choice) {
    case "0" : // markDeleted
      // disable folderPicker
      document.getElementById("msgTrashFolderPicker").setAttribute("disabled", "true");
      break;
    case "1" : // moveToTrashFolder
      // enable folderPicker
      document.getElementById("msgTrashFolderPicker").removeAttribute("disabled");
      break;
    case "2" : // deleteImmediately
      // disable folderPicker
      document.getElementById("msgTrashFolderPicker").setAttribute("disabled", "true");
      break;
    default :
      dump("Error in enabling/disabling server.TrashFolderPicker\n");
      break;
  }
}

// Capture any menulist changes from folderPicker
function folderPickerChange(aEvent) {
  var folder = aEvent.target._folder;
  // Since we need to deal with localised folder names, we simply use
  // the path of the URI like we do in nsImapIncomingServer::DiscoveryDone().
  // Note that the path is returned with a leading slash which we need to remove.
  var folderPath = Services.io.newURI(folder.URI).pathQueryRef.substring(1);
  // We need to convert that from MUTF-7 to Unicode.
  var manager = Cc["@mozilla.org/charset-converter-manager;1"]
                  .getService(Ci.nsICharsetConverterManager);
  var trashUnicode = manager.mutf7ToUnicode(
    Services.netUtils.unescapeString(folderPath, Ci.nsINetUtil.ESCAPE_URL_PATH));

  // Set the value to be persisted.
  document.getElementById("imap.trashFolderName")
          .setAttribute("value", trashUnicode);

  // Update the widget to show/do correct things even for subfolders.
  var trashFolderPicker = document.getElementById("msgTrashFolderPicker");
  trashFolderPicker.menupopup.selectFolder(folder);
}

// Get trash_folder_name from prefs. Despite its name this returns
// a folder path, for example INBOX/Trash.
function getTrashFolderName() {
  var trashFolderName = document.getElementById("imap.trashFolderName").getAttribute("value");
  // if the preference hasn't been set, set it to a sane default
  if (!trashFolderName) {
    trashFolderName = "Trash";  // XXX Is this a useful default?
    document.getElementById("imap.trashFolderName").setAttribute("value", trashFolderName);
  }
  return trashFolderName;
}
