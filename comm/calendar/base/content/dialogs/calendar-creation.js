/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported openLocalCalendar */

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

/**
 * Shows the filepicker and creates a new calendar with a local file using the ICS
 * provider.
 */
function openLocalCalendar() {
    const nsIFilePicker = Ci.nsIFilePicker;
    let picker = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    picker.init(window, cal.l10n.getCalString("Open"), nsIFilePicker.modeOpen);
    let wildmat = "*.ics";
    let description = cal.l10n.getCalString("filterIcs", [wildmat]);
    picker.appendFilter(description, wildmat);
    picker.appendFilters(nsIFilePicker.filterAll);

    picker.open(rv => {
        if (rv != nsIFilePicker.returnOK || !picker.file) {
            return;
        }
        let calMgr = cal.getCalendarManager();
        let calendars = calMgr.getCalendars({});
        let calendar = calendars.find(x => x.uri == picker.fileURL);
        if (calendar) {
            // The calendar already exists, select it and return.
            document.getElementById("calendar-list-tree-widget").selectCalendarById(calendar.id);
            return;
        }

        let openCalendar = calMgr.createCalendar("ics", picker.fileURL);

        // Strip ".ics" from filename for use as calendar name, taken from
        // calendarCreation.js
        let fullPathRegex = new RegExp("([^/:]+)[.]ics$");
        let prettyName = picker.fileURL.spec.match(fullPathRegex);
        let name;

        if (prettyName) {
            name = decodeURIComponent(prettyName[1]);
        } else {
            name = cal.l10n.getCalString("untitledCalendarName");
        }
        openCalendar.name = name;

        calMgr.registerCalendar(openCalendar);
    });
}
