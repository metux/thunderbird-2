/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testWeeklyUntilRecurrenceRotated";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers", "window-helpers"];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

var SHORT_SLEEP, TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENTPATH, EVENT_BOX, CANVAS_BOX;
var helpersForController, handleOccurrencePrompt, switchToView, goToDate;
var invokeEventDialog, viewForward, closeAllEventDialogs, deleteCalendars, createCalendar, menulistSelect;
var REC_DLG_DAYS, REC_DLG_ACCEPT, REC_DLG_UNTIL_INPUT;
var plan_for_modal_dialog, wait_for_modal_dialog;

const ENDDATE = new Date(2009, 0, 26); // last Monday in month
const HOUR = 8;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        SHORT_SLEEP,
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
        viewForward,
        closeAllEventDialogs,
        deleteCalendars,
        createCalendar,
        menulistSelect
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({
        REC_DLG_DAYS,
        REC_DLG_ACCEPT,
        REC_DLG_UNTIL_INPUT
    } = collector.getModule("item-editing-helpers"));
    collector.getModule("item-editing-helpers").setupModule(module);

    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers")
    );

    createCalendar(controller, CALENDARNAME);
    // Rotate view.
    controller.mainMenu.click("#ltnViewRotated");
    controller.waitFor(() => eid("day-view").getNode().orient == "horizontal");
}

function testWeeklyUntilRecurrence() {
    goToDate(controller, 2009, 1, 5); // Monday

    // Create weekly recurring event.
    let eventBox = lookupEventBox("day", CANVAS_BOX, null, 1, HOUR);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        plan_for_modal_dialog("Calendar:EventDialog:Recurrence", setRecurrence);
        event.waitForElement(eventid("item-repeat"));
        menulistSelect(eventid("item-repeat"), "custom", event);
        wait_for_modal_dialog("Calendar:EventDialog:Recurrence", TIMEOUT_MODAL_DIALOG);

        event.click(eventid("button-saveandclose"));
    });

    let box = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);

    // Check day view.
    for (let week = 0; week < 3; week++) {
        // Monday
        controller.waitForElement(box);
        viewForward(controller, 2);

        // Wednesday
        controller.waitForElement(box);
        viewForward(controller, 2);

        // Friday
        controller.waitForElement(box);
        viewForward(controller, 3);
    }

    // Monday, last occurrence
    controller.waitForElement(box);
    viewForward(controller, 2);

    // Wednesday
    controller.waitForElementNotPresent(box);

    // Check week view.
    switchToView(controller, "week");
    goToDate(controller, 2009, 1, 5);
    for (let week = 0; week < 3; week++) {
        // Monday
        controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, 2, null, EVENTPATH));

        // Wednesday
        controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, 4, null, EVENTPATH));

        // Friday
        controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, 6, null, EVENTPATH));

        viewForward(controller, 1);
    }

    // Monday, last occurrence
    controller.waitForElement(lookupEventBox("week", EVENT_BOX, null, 2, null, EVENTPATH));
    // Wednesday
    controller.assertNodeNotExist(lookupEventBox("week", EVENT_BOX, null, 4, null, EVENTPATH));

    // Check multiweek view.
    switchToView(controller, "multiweek");
    goToDate(controller, 2009, 1, 5);
    checkMultiWeekView("multiweek");

    // Check month view.
    switchToView(controller, "month");
    goToDate(controller, 2009, 1, 5);
    checkMultiWeekView("month");

    // Delete event.
    box = lookupEventBox("month", EVENT_BOX, 2, 2, null, EVENTPATH);
    controller.click(box);
    handleOccurrencePrompt(controller, eid("month-view"), "delete", true);
    controller.waitForElementNotPresent(box);
}

function setRecurrence(recurrence) {
    let { sleep: recsleep, lookup: reclookup, eid: recid } = helpersForController(recurrence);

    // weekly
    recurrence.waitForElement(recid("period-list"));
    menulistSelect(recid("period-list"), "1", recurrence);

    let mon = cal.l10n.getDateFmtString("day.2.Mmm");
    let wed = cal.l10n.getDateFmtString("day.4.Mmm");
    let fri = cal.l10n.getDateFmtString("day.6.Mmm");

    // Starting from Monday so it should be checked. We have to wait a little,
    // because the checkedstate is set in background by JS.
    recurrence.waitFor(() => {
        return recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
    }, 30000);
    // Starting from Monday so it should be checked.
    recurrence.assertChecked(reclookup(`${REC_DLG_DAYS}/{"label":"${mon}"}`));
    // Check Wednesday and Friday too.
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${wed}"}`));
    recurrence.click(reclookup(`${REC_DLG_DAYS}/{"label":"${fri}"}`));

    // Set until date.
    recurrence.radio(recid("recurrence-range-until"));

    // Delete previous date.
    let untilInput = reclookup(REC_DLG_UNTIL_INPUT);
    recurrence.keypress(untilInput, "a", { accelKey: true });
    recurrence.keypress(untilInput, "VK_DELETE", {});

    let dateFormatter = cal.getDateFormatter();

    let endDateString = dateFormatter.formatDateShort(
        cal.dtz.jsDateToDateTime(ENDDATE, cal.dtz.floating)
    );
    recsleep(SHORT_SLEEP);
    recurrence.type(untilInput, endDateString);

    recsleep(SHORT_SLEEP);
    // Move focus to ensure the date is selected.
    recurrence.keypress(untilInput, "VK_TAB", {});

    // Close dialog.
    recurrence.click(reclookup(REC_DLG_ACCEPT));
}

function checkMultiWeekView(view) {
    let startWeek = view == "month" ? 2 : 1;

    for (let week = startWeek; week < startWeek + 3; week++) {
        // Monday
        controller.waitForElement(lookupEventBox(view, EVENT_BOX, week, 2, null, EVENTPATH));
        // Wednesday
        controller.assertNode(lookupEventBox(view, EVENT_BOX, week, 4, null, EVENTPATH));
        // Friday
        controller.assertNode(lookupEventBox(view, EVENT_BOX, week, 6, null, EVENTPATH));
    }

    // Monday, last occurrence
    controller.assertNode(lookupEventBox(view, EVENT_BOX, startWeek + 3, 2, null, EVENTPATH));

    // Wednesday
    controller.assertNodeNotExist(
        lookupEventBox(view, EVENT_BOX, startWeek + 3, 4, null, EVENTPATH)
    );
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
