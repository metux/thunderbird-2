/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testDailyRecurrenceRotated";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers"];

var CALENDARNAME, EVENTPATH, EVENT_BOX, CANVAS_BOX;
var helpersForController, invokeEventDialog, createCalendar, closeAllEventDialogs, deleteCalendars;
var switchToView, goToDate, viewForward, viewBack, handleOccurrencePrompt;
var menulistSelect;
var setData;

const HOUR = 8;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        CALENDARNAME,
        EVENTPATH,
        EVENT_BOX,
        CANVAS_BOX,
        helpersForController,
        handleOccurrencePrompt,
        switchToView,
        goToDate,
        invokeEventDialog,
        viewForward,
        viewBack,
        closeAllEventDialogs,
        deleteCalendars,
        createCalendar,
        menulistSelect
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({ setData } = collector.getModule("item-editing-helpers"));
    collector.getModule("item-editing-helpers").setupModule(module);

    createCalendar(controller, CALENDARNAME);

    // Rotate view.
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "horizontal");
}

function testDailyRecurrence() {
    goToDate(controller, 2009, 1, 1);

    // Create daily event.
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        setData(event, iframe, { repeat: "daily", repeatuntil: new Date(2009, 2, 20) });
        event.click(eventid("button-saveandclose"));
    });

    // Check day view for 7 days.
    let daybox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
    controller.waitForElement(daybox);

    for (let day = 1; day <= 7; day++) {
        controller.waitForElement(daybox);
        viewForward(controller, 1);
    }

    // Check week view for 2 weeks.
    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 1);

    for (let day = 5; day <= 7; day++) {
        controller.waitForElement(lookupEventBox("week", EVENT_BOX, 1, day, null, EVENTPATH));
    }

    viewForward(controller, 1);

    for (let day = 1; day <= 7; day++) {
        controller.waitForElement(lookupEventBox("week", EVENT_BOX, 2, day, null, EVENTPATH));
    }

    // Check multiweek view for 4 weeks.
    switchToView(controller, "multiweek");
    goToDate(controller, 2009, 1, 1);

    for (let day = 5; day <= 7; day++) {
        controller.waitForElement(lookupEventBox("multiweek", EVENT_BOX, 1, day, null, EVENTPATH));
    }

    for (let week = 2; week <= 4; week++) {
        for (let day = 1; day <= 7; day++) {
            controller.waitForElement(
                lookupEventBox("multiweek", EVENT_BOX, week, day, null, EVENTPATH)
            );
        }
    }
    // Check month view for all 5 weeks.
    switchToView(controller, "month");
    goToDate(controller, 2009, 1, 1);

    for (let day = 5; day <= 7; day++) {
        controller.waitForElement(lookupEventBox("month", EVENT_BOX, 1, day, null, EVENTPATH));
    }

    for (let week = 2; week <= 5; week++) {
        for (let day = 1; day <= 7; day++) {
            controller.assertNode(lookupEventBox("month", EVENT_BOX, week, day, null, EVENTPATH));
        }
    }

    // Delete 3rd January occurrence.
    let saturday = lookupEventBox("month", EVENT_BOX, 1, 7, null, EVENTPATH);
    controller.click(saturday);
    handleOccurrencePrompt(controller, eid("month-view"), "delete", false);

    // Verify in all views.
    controller.waitForElementNotPresent(saturday);

    switchToView(controller, "multiweek");
    controller.assertNodeNotExist(lookupEventBox("multiweek", EVENT_BOX, 1, 7, null, EVENTPATH));

    switchToView(controller, "week");
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, null, EVENTPATH));

    switchToView(controller, "day");
    controller.assertNodeNotExist(lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH));

    // Go to previous day to edit event to occur only on weekdays.
    viewBack(controller, 1);

    eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
    handleOccurrencePrompt(controller, eventBox, "modify", true);
    invokeEventDialog(controller, null, (event, iframe) => {
        let { eid: eventid, sleep: eventsleep } = helpersForController(event);

        menulistSelect(eventid("item-repeat"), "every.weekday", event);
        eventsleep();
        event.click(eventid("button-saveandclose"));
    });

    // Check day view for 7 days.
    let day = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
    let dates = [
        [2009, 1, 3],
        [2009, 1, 4]
    ];
    for (let [y, m, d] of dates) {
        goToDate(controller, y, m, d);
        controller.assertNodeNotExist(day);
    }

    // Check week view for 2 weeks.
    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 1);

    for (let i = 0; i <= 1; i++) {
        controller.waitForElementNotPresent(
            lookupEventBox("week", EVENT_BOX, null, 1, null, EVENTPATH)
        );
        controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 7, null, EVENTPATH));
        viewForward(controller, 1);
    }

    // Check multiweek view for 4 weeks.
    switchToView(controller, "multiweek");
    goToDate(controller, 2009, 1, 1);

    for (let i = 1; i <= 4; i++) {
        controller.waitForElementNotPresent(
            lookupEventBox("multiweek", EVENT_BOX, i, 1, null, EVENTPATH)
        );
        controller.assertNodeNotExist(
            lookupEventBox("multiweek", EVENT_BOX, i, 7, null, EVENTPATH)
        );
    }

    // Check month view for all 5 weeks.
    switchToView(controller, "month");
    goToDate(controller, 2009, 1, 1);

    for (let i = 1; i <= 5; i++) {
        controller.waitForElementNotPresent(
            lookupEventBox("month", EVENT_BOX, i, 1, null, EVENTPATH)
        );
        controller.assertNodeNotExist(lookupEventBox("month", EVENT_BOX, i, 7, null, EVENTPATH));
    }

    // Delete event.
    day = lookupEventBox("month", EVENT_BOX, 1, 5, null, EVENTPATH);
    controller.click(day);
    handleOccurrencePrompt(controller, eid("month-view"), "delete", true);
    controller.waitForElementNotPresent(day);
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
    // Reset view.
    switchToView(controller, "day");
    if (eid("day-view").getNode().orient == "horizontal") {
        controller.mainMenu.click("#ltnViewRotated");
    }
    controller.waitFor(() => eid("day-view").getNode().orient == "vertical");
    closeAllEventDialogs();
}
