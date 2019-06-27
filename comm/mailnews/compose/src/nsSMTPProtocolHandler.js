/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

var kNetworkProtocolCIDPrefix = "@mozilla.org/network/protocol;1?name=";
var nsIProtocolHandler = Ci.nsIProtocolHandler;

function makeProtocolHandler(aProtocol, aDefaultPort, aClassID) {
  return {
    classID: Components.ID(aClassID),
    QueryInterface: ChromeUtils.generateQI([nsIProtocolHandler]),

    scheme: aProtocol,
    defaultPort: aDefaultPort,
    protocolFlags: nsIProtocolHandler.URI_NORELATIVE |
                   nsIProtocolHandler.URI_DANGEROUS_TO_LOAD |
      nsIProtocolHandler.URI_NON_PERSISTABLE |
      nsIProtocolHandler.ALLOWS_PROXY |
      nsIProtocolHandler.URI_FORBIDS_AUTOMATIC_DOCUMENT_REPLACEMENT,

    newURI(aSpec, aOriginCharset, aBaseURI) {
      var url = Cc["@mozilla.org/messengercompose/smtpurl;1"]
                  .createInstance(Ci.nsIURI);
      if (url instanceof Ci.nsISmtpUrl)
        url.init(aSpec);
      return url;
    },

    newChannel(aURI, aLoadInfo) {
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },

    allowPort(port, scheme) {
      return port == aDefaultPort;
    },
  };
}

function nsSMTPProtocolHandler() {}

nsSMTPProtocolHandler.prototype =
  makeProtocolHandler("smtp",
                      Ci.nsISmtpUrl.DEFAULT_SMTP_PORT,
                      "b14c2b67-8680-4c11-8d63-9403c7d4f757");

function nsSMTPSProtocolHandler() {}

nsSMTPSProtocolHandler.prototype =
  makeProtocolHandler("smtps",
                      Ci.nsISmtpUrl.DEFAULT_SMTPS_PORT,
                      "057d0997-9e3a-411e-b4ee-2602f53fe05f");

var components = [nsSMTPProtocolHandler, nsSMTPSProtocolHandler];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
