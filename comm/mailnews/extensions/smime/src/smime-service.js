/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

function SMIMEService() {}

SMIMEService.prototype = {
  name: "smime",
  chromePackageName: "messenger",
  showPanel(server) {
    // don't show the panel for news, rss, or local accounts
    return (server.type != "nntp" && server.type != "rss" &&
            server.type != "im" && server.type != "none");
  },

  QueryInterface: ChromeUtils.generateQI([Ci.nsIMsgAccountManagerExtension]),
  classID: Components.ID("{f2809796-1dd1-11b2-8c1b-8f15f007c699}"),
};

var components = [SMIMEService];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
