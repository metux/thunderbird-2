/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/extensions/smime/content/msgReadSMIMEOverlay.js */
/* import-globals-from ../../../base/content/folderDisplay.js */
/* import-globals-from ../../../base/content/mailWindow.js */
/* import-globals-from ../../../base/content/msgHdrView.js */

var gSignedUINode = null;
var gEncryptedUINode = null;
var gSMIMEContainer = null;
var gStatusBar = null;

var gEncryptedURIService = null;
var gMyLastEncryptedURI = null;

var gSMIMEBundle = null;

// Get the necko URL for the message URI.
function neckoURLForMessageURI(aMessageURI) {
  let msgSvc = Cc["@mozilla.org/messenger;1"]
    .createInstance(Ci.nsIMessenger)
    .messageServiceFromURI(aMessageURI);
  let neckoURI = {};
  msgSvc.GetUrlForUri(aMessageURI, neckoURI, null);
  return neckoURI.value.spec;
}

var smimeHeaderSink = {
  maxWantedNesting() {
    return 1;
  },

  signedStatus(aNestingLevel, aSignatureStatus, aSignerCert) {
    if (aNestingLevel > 1) {
      // we are not interested
      return;
    }

    gSignatureStatus = aSignatureStatus;
    gSignerCert = aSignerCert;

    gSMIMEContainer.collapsed = false;
    gSignedUINode.collapsed = false;

    switch (aSignatureStatus) {
      case Ci.nsICMSMessageErrors.SUCCESS:
        gSignedUINode.setAttribute("signed", "ok");
        gStatusBar.setAttribute("signed", "ok");
        break;

      case Ci.nsICMSMessageErrors.VERIFY_NOT_YET_ATTEMPTED:
        gSignedUINode.setAttribute("signed", "unknown");
        gStatusBar.setAttribute("signed", "unknown");
        this.showSenderIfSigner();
        break;

      case Ci.nsICMSMessageErrors.VERIFY_CERT_WITHOUT_ADDRESS:
      case Ci.nsICMSMessageErrors.VERIFY_HEADER_MISMATCH:
        gSignedUINode.setAttribute("signed", "mismatch");
        gStatusBar.setAttribute("signed", "mismatch");
        this.showSenderIfSigner();
        break;

      default:
        gSignedUINode.setAttribute("signed", "notok");
        gStatusBar.setAttribute("signed", "notok");
        break;
    }
  },

  /**
   * Force showing Sender if we have a Sender and it's not signed by From.
   * For a valid cert that means the Sender signed it - and the signed mismatch
   * mark is shown. To understand why it's not a confirmed signing it's useful
   * to have the Sender header showing.
   */
  showSenderIfSigner() {
    if (!("sender" in currentHeaderData))
      return; // Sender not set, or same as From (so no longer present).

    if (Services.prefs.getBoolPref("mailnews.headers.showSender"))
      return; // Sender header will be show due to pref - nothing more to do.

    let fromMailboxes = MailServices.headerParser.extractHeaderAddressMailboxes(
            currentHeaderData.from.headerValue).split(",");
    for (let i = 0; i < fromMailboxes.length; i++) {
      if (gSignerCert.containsEmailAddress(fromMailboxes[i])) {
        return; // It's signed by a From. Nothing more to do
      }
    }

    let senderInfo = { name: "sender", outputFunction: OutputEmailAddresses };
    let senderEntry = new createHeaderEntry("expanded", senderInfo);

    gExpandedHeaderView[senderInfo.name] = senderEntry;
    UpdateExpandedMessageHeaders();
  },

  encryptionStatus(aNestingLevel, aEncryptionStatus, aRecipientCert) {
    if (aNestingLevel > 1) {
      // we are not interested
      return;
    }

    gEncryptionStatus = aEncryptionStatus;
    gEncryptionCert = aRecipientCert;

    gSMIMEContainer.collapsed = false;
    gEncryptedUINode.collapsed = false;

    if (Ci.nsICMSMessageErrors.SUCCESS == aEncryptionStatus) {
      gEncryptedUINode.setAttribute("encrypted", "ok");
      gStatusBar.setAttribute("encrypted", "ok");
    } else {
      gEncryptedUINode.setAttribute("encrypted", "notok");
      gStatusBar.setAttribute("encrypted", "notok");
    }

    if (gEncryptedURIService) {
      // Remember the message URI and the corresponding necko URI.
      gMyLastEncryptedURI = gFolderDisplay.selectedMessageUris[0];
      gEncryptedURIService.rememberEncrypted(gMyLastEncryptedURI);
      gEncryptedURIService.rememberEncrypted(
        neckoURLForMessageURI(gMyLastEncryptedURI));
    }

    switch (aEncryptionStatus) {
    case Ci.nsICMSMessageErrors.SUCCESS:
    case Ci.nsICMSMessageErrors.ENCRYPT_INCOMPLETE:
      break;
    default:
      var brand = document.getElementById("bundle_brand")
                          .getString("brandShortName");
      var title = gSMIMEBundle.getString("CantDecryptTitle").replace(/%brand%/g, brand);
      var body = gSMIMEBundle.getString("CantDecryptBody").replace(/%brand%/g, brand);

      // insert our message
      msgWindow.displayHTMLInMessagePane(title,
       "<html>\n" +
       "<body bgcolor=\"#fafaee\">\n" +
       "<center><br><br><br>\n" +
       "<table>\n" +
       "<tr><td>\n" +
       "<center><strong><font size=\"+3\">\n" +
       title + "</font></center><br>\n" +
       body + "\n" +
       "</td></tr></table></center></body></html>", false);
      break;
    }
  },

  QueryInterface: ChromeUtils.generateQI(["nsIMsgSMIMEHeaderSink"]),
};

function forgetEncryptedURI() {
  if (gMyLastEncryptedURI && gEncryptedURIService) {
    gEncryptedURIService.forgetEncrypted(gMyLastEncryptedURI);
    gEncryptedURIService.forgetEncrypted(
      neckoURLForMessageURI(gMyLastEncryptedURI));
    gMyLastEncryptedURI = null;
  }
}

function onSMIMEStartHeaders() {
  gEncryptionStatus = -1;
  gSignatureStatus = -1;

  gSignerCert = null;
  gEncryptionCert = null;

  gSMIMEContainer.collapsed = true;

  gSignedUINode.collapsed = true;
  gSignedUINode.removeAttribute("signed");
  gStatusBar.removeAttribute("signed");

  gEncryptedUINode.collapsed = true;
  gEncryptedUINode.removeAttribute("encrypted");
  gStatusBar.removeAttribute("encrypted");

  forgetEncryptedURI();
}

function onSMIMEEndHeaders() {
}

function onSmartCardChange() {
  // only reload encrypted windows
  if (gMyLastEncryptedURI && gEncryptionStatus != -1) {
    ReloadMessage();
  }
}

function onSMIMEBeforeShowHeaderPane() {
  // For signed messages with differing Sender as signer we force showing Sender.
  // If we're now in a different message, hide the (old) sender row and remove
  // it from the header view, so that Sender normally isn't shown.
  if ("sender" in gExpandedHeaderView &&
      !Services.prefs.getBoolPref("mailnews.headers.showSender")) {
    gExpandedHeaderView.sender.enclosingRow.collapsed = true;
    delete gExpandedHeaderView.sender;
  }
}

function msgHdrViewSMIMEOnLoad(event) {
  window.crypto.enableSmartCardEvents = true;
  document.addEventListener("smartcard-insert", onSmartCardChange);
  document.addEventListener("smartcard-remove", onSmartCardChange);
  if (!gSMIMEBundle)
    gSMIMEBundle = document.getElementById("bundle_read_smime");

  // we want to register our security header sink as an opaque nsISupports
  // on the msgHdrSink used by mail.....
  msgWindow.msgHeaderSink.securityInfo = smimeHeaderSink;

  gSignedUINode = document.getElementById("signedHdrIcon");
  gEncryptedUINode = document.getElementById("encryptedHdrIcon");
  gSMIMEContainer = document.getElementById("smimeBox");
  gStatusBar = document.getElementById("status-bar");

  // Add ourself to the list of message display listeners so we get notified
  // when we are about to display a message.
  var listener = {};
  listener.onStartHeaders = onSMIMEStartHeaders;
  listener.onEndHeaders = onSMIMEEndHeaders;
  listener.onBeforeShowHeaderPane = onSMIMEBeforeShowHeaderPane;
  gMessageListeners.push(listener);

  gEncryptedURIService =
    Cc["@mozilla.org/messenger-smime/smime-encrypted-uris-service;1"]
    .getService(Ci.nsIEncryptedSMIMEURIsService);
}

function msgHdrViewSMIMEOnUnload(event) {
  window.crypto.enableSmartCardEvents = false;
  document.removeEventListener("smartcard-insert", onSmartCardChange);
  document.removeEventListener("smartcard-remove", onSmartCardChange);
  forgetEncryptedURI();
  removeEventListener("messagepane-loaded", msgHdrViewSMIMEOnLoad, true);
  removeEventListener("messagepane-unloaded", msgHdrViewSMIMEOnUnload, true);
  removeEventListener("messagepane-hide", msgHdrViewSMIMEOnMessagePaneHide, true);
  removeEventListener("messagepane-unhide", msgHdrViewSMIMEOnMessagePaneUnhide, true);
}

function msgHdrViewSMIMEOnMessagePaneHide() {
  gSMIMEContainer.collapsed = true;
  gSignedUINode.collapsed = true;
  gEncryptedUINode.collapsed = true;
}

function msgHdrViewSMIMEOnMessagePaneUnhide() {
  if (gEncryptionStatus != -1 || gSignatureStatus != -1) {
    gSMIMEContainer.collapsed = false;

    if (gSignatureStatus != -1) {
      gSignedUINode.collapsed = false;
    }

    if (gEncryptionStatus != -1) {
      gEncryptedUINode.collapsed = false;
    }
  }
}

addEventListener("messagepane-loaded", msgHdrViewSMIMEOnLoad, true);
addEventListener("messagepane-unloaded", msgHdrViewSMIMEOnUnload, true);
addEventListener("messagepane-hide", msgHdrViewSMIMEOnMessagePaneHide, true);
addEventListener("messagepane-unhide", msgHdrViewSMIMEOnMessagePaneUnhide, true);
