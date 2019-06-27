/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  XPCOMUtils,
  setTimeout,
  clearTimeout,
  executeSoon,
  nsSimpleEnumerator,
  EmptyEnumerator,
  ClassInfo,
  l10nHelper,
  initLogModule,
} = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
var {
  GenericAccountPrototype,
  GenericAccountBuddyPrototype,
  GenericConvIMPrototype,
  GenericConvChatPrototype,
  GenericConvChatBuddyPrototype,
  GenericConversationPrototype,
  GenericMessagePrototype,
  GenericProtocolPrototype,
  Message,
  TooltipInfo,
} = ChromeUtils.import("resource:///modules/jsProtoHelper.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/yahoo.properties")
);

function YahooAccount(aProtoInstance, aImAccount)
{
  this._init(aProtoInstance, aImAccount);
}
YahooAccount.prototype = {
  __proto__: GenericAccountPrototype,

  connect() {
    this.WARN("The legacy versions of Yahoo Messenger was disabled on August " +
              "5, 2016. It is currently not possible to connect to Yahoo " +
              "Messenger. See bug 1316000");
    this.reportDisconnecting(Ci.prplIAccount.ERROR_OTHER_ERROR,
                             _("yahoo.disabled"));
    this.reportDisconnected();
  },
};

function YahooProtocol() {}
YahooProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get id() { return "prpl-yahoo"; },
  get name() { return "Yahoo"; },
  get iconBaseURI() { return "chrome://prpl-yahoo/skin/"; },
  getAccount(aImAccount) { return new YahooAccount(this, aImAccount); },
  classID: Components.ID("{50ea817e-5d79-4657-91ae-aa0a52bdb98c}"),
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([YahooProtocol]);
