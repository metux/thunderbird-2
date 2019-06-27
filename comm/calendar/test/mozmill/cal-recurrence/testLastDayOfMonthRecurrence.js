/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testLastDayOfMonthRecurrence";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers", "window-helpers"];

var TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENTPATH, EVENT_BOX, CANVAS_BOX;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate;
var invokeEventDialog, closeAllEventDialogs, deleteCalendars, createCalendar, menulistSelect;
var REC_DLG_ACCEPT;
var plan_for_modal_dialog, wait_for_modal_dialog;

const HOUR = 8;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        TIMEOUT_MODAL_DIALOG,
        CALENDARNAME,
        EVENTPATH,
        EVENT_BOX,
        CANVAS_BOX,
        helpersForController,
        handleOccurrencePrompt,
        switchToView,
        goToDate,
        invokeEventDialog,
        closeAllEventDialogs,
        deleteCalendars,
        createCalendar,
        menulistSelect
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({ REC_DLG_ACCEPT } = collector.getModule("item-editing-helpers"));
    collector.getModule("item-editing-helpers").setupModule(module);

    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers")
    );

    createCalendar(controller, CALENDARNAME);
}

function testLastDayOfMonthRecurrence() {
    goToDate(controller, 2008, 1, 31); // Start with a leap year.

    // Create monthly recurring event.
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        plan_for_modal_dialog("Calendar:EventDialog:Recurrence", setRecurrence);
        menulistSelect(eventid("item-repeat"), "custom", event);
        wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

        event.click(eventid("button-saveandclose"));
    });

    // data tuple: [year, month, day, row in month view]
    // note: Month starts here with 1 for January.
    let checkingData = [[2008, 1, 31, 5],
                        [2008, 2, 29, 5],
                        [2008, 3, 31, 6],
                        [2008, 4, 30, 5],
                        [2008, 5, 31, 5],
                        [2008, 6, 30, 5],
                        [2008, 7, 31, 5],
                        [2008, 8, 31, 6],
                        [2008, 9, 30, 5],
                        [2008, 10, 31, 5],
                        [2008, 11, 30, 6],
                        [2008, 12, 31, 5],
                        [2009, 1, 31, 5],
                        [2009, 2, 28, 4],
                        [2009, 3, 31, 5]];
    // Check all dates.
    for (let [y, m, d, correctRow] of checkingData) {
        let date = new Date(y, m - 1, d);
        let column = date.getDay() + 1;

        goToDate(controller, y, m, d);

        // day view
        switchToView(controller, "day");
        controller.waitForElement(lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH));

        // week view
        switchToView(controller, "week");
        controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, column, null, EVENTPATH));

        // multiweek view
        switchToView(controller, "multiweek");
        controller.waitForElement(
            lookupEventBox("multiweek", EVENT_BOX, 1, column, null, EVENTPATH)
        );

        // month view
        switchToView(controller, "month");
        controller.waitForElement(
            lookupEventBox("month", EVENT_BOX, correctRow, column, null, EVENTPATH)
        );
    }

    // Delete event.
    goToDate(controller, checkingData[0][0], checkingData[0][1], checkingData[0][2]);
    switchToView(controller, "day");
    let box = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
    controller.waitThenClick(box);
    handleOccurrencePrompt(controller, eid("day-view"), "delete", true);
    controller.waitForElementNotPresent(box);
}

function setRecurrence(recurrence) {
    let {
        sleep: recsleep,
        lookup: reclookup,
        eid: recid
    } = helpersForController(recurrence);

    // monthly
    menulistSelect(recid("period-list"), "2", recurrence);

    // last day of month
    recurrence.radio(recid("montly-period-relative-date-radio"));
    menulistSelect(recid("monthly-ordinal"), "-1", recurrence);
    menulistSelect(recid("monthly-weekday"), "-1", recurrence);
    recsleep();

    // Close dialog.
    recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
    closeAllEventDialogs();
}
