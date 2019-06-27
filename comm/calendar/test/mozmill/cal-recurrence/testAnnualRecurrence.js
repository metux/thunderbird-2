/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testAnnualRecurrence";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var CALENDARNAME, EVENTPATH, ALLDAY;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate, invokeEventDialog;
var closeAllEventDialogs, deleteCalendars, createCalendar, menulistSelect;

const STARTYEAR = 1950;
const EPOCH = 1970;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        CALENDARNAME,
        EVENTPATH,
        ALLDAY,
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

    createCalendar(controller, CALENDARNAME);
}

function testAnnualRecurrence() {
    goToDate(controller, STARTYEAR, 1, 1);

    // Create yearly recurring all-day event.
    let eventBox = lookupEventBox("day", ALLDAY, null, 1, null);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        menulistSelect(eventid("item-repeat"), "yearly", event);
        event.click(eventid("button-saveandclose"));
    });

    let checkYears = [STARTYEAR, STARTYEAR + 1, EPOCH - 1, EPOCH, EPOCH + 1];
    for (let year of checkYears) {
        goToDate(controller, year, 1, 1);
        let date = new Date(year, 0, 1);
        let column = date.getDay() + 1;

        // day view
        switchToView(controller, "day");
        controller.waitForElement(lookupEventBox("day", ALLDAY, null, 1, null, EVENTPATH));

        // week view
        switchToView(controller, "week");
        controller.waitForElement(lookupEventBox("week", ALLDAY, null, column, null, EVENTPATH));

        // multiweek view
        switchToView(controller, "multiweek");
        controller.waitForElement(lookupEventBox("multiweek", ALLDAY, 1, column, null, EVENTPATH));

        // month view
        switchToView(controller, "month");
        controller.waitForElement(lookupEventBox("month", ALLDAY, 1, column, null, EVENTPATH));
    }

    // Delete event.
    goToDate(controller, checkYears[0], 1, 1);
    switchToView(controller, "day");
    let box = getEventBoxPath("day", ALLDAY, null, 1, null) + EVENTPATH;
    controller.click(lookup(box));
    handleOccurrencePrompt(controller, eid("day-view"), "delete", true);
    controller.waitForElementNotPresent(lookup(box));
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
    closeAllEventDialogs();
}
