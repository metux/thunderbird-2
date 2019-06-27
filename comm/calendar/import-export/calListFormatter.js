/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

/**
 * A thin wrapper around the html list exporter for the list print format.
 */
function calListFormatter() {
    this.wrappedJSObject = this;
}

calListFormatter.prototype = {
    QueryInterface: ChromeUtils.generateQI([Ci.calIPrintFormatter]),
    classID: Components.ID("{9ae04413-fee3-45b9-8bbb-1eb39a4cbd1b}"),

    get name() { return cal.l10n.getCalString("formatListName"); },

    formatToHtml: function(aStream, aStart, aEnd, aCount, aItems, aTitle) {
        let htmlexporter = Cc["@mozilla.org/calendar/export;1?type=htmllist"]
                             .createInstance(Ci.calIExporter);
        htmlexporter.exportToStream(aStream, aCount, aItems, aTitle);
    }
};
