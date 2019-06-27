/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    do_calendar_startup(really_run_test);
}

function really_run_test() {
    test_recentzones();
    test_formatcss();
    test_getDefaultStartDate();
    test_getStartEndProps();
    test_OperationGroup();
    test_sameDay();
    test_binarySearch();
}

function test_recentzones() {
    let oldDefaultTz = Services.prefs.getStringPref("calendar.timezone.local", "");
    Services.prefs.setStringPref("calendar.timezone.local", "floating");

    equal(cal.dtz.getRecentTimezones().length, 0);
    equal(cal.dtz.getRecentTimezones(true).length, 0);

    cal.dtz.saveRecentTimezone("Europe/Berlin");

    let zones = cal.dtz.getRecentTimezones();
    equal(zones.length, 1);
    equal(zones[0], "Europe/Berlin");
    zones = cal.dtz.getRecentTimezones(true);
    equal(zones.length, 1);
    equal(zones[0].tzid, "Europe/Berlin");

    cal.dtz.saveRecentTimezone(cal.dtz.defaultTimezone.tzid);
    equal(cal.dtz.getRecentTimezones().length, 1);
    equal(cal.dtz.getRecentTimezones(true).length, 1);

    cal.dtz.saveRecentTimezone("Europe/Berlin");
    equal(cal.dtz.getRecentTimezones().length, 1);
    equal(cal.dtz.getRecentTimezones(true).length, 1);

    cal.dtz.saveRecentTimezone("America/New_York");
    equal(cal.dtz.getRecentTimezones().length, 2);
    equal(cal.dtz.getRecentTimezones(true).length, 2);

    cal.dtz.saveRecentTimezone("Unknown");
    equal(cal.dtz.getRecentTimezones().length, 3);
    equal(cal.dtz.getRecentTimezones(true).length, 2);

    Services.prefs.setStringPref("calendar.timezone.local", oldDefaultTz);
}

function test_formatcss() {
    equal(cal.view.formatStringForCSSRule(" "), "_");
    equal(cal.view.formatStringForCSSRule("ü"), "-uxfc-");
    equal(cal.view.formatStringForCSSRule("a"), "a");
}

function test_getDefaultStartDate() {
    function transform(nowString, refDateString) {
        now = cal.createDateTime(nowString);
        let refDate = refDateString ? cal.createDateTime(refDateString) : null;
        return cal.dtz.getDefaultStartDate(refDate);
    }

    let oldNow = cal.dtz.now;
    let now = cal.createDateTime("20120101T000000");
    cal.dtz.now = function() {
        return now;
    };

    dump("TT: " + cal.createDateTime("20120101T000000") + "\n");
    dump("TT: " + cal.dtz.getDefaultStartDate(cal.createDateTime("20120101T000000")) + "\n");

    equal(transform("20120101T000000").icalString, "20120101T010000");
    equal(transform("20120101T015959").icalString, "20120101T020000");
    equal(transform("20120101T230000").icalString, "20120101T230000");
    equal(transform("20120101T235959").icalString, "20120101T230000");

    equal(transform("20120101T000000", "20120202").icalString, "20120202T010000");
    equal(transform("20120101T015959", "20120202").icalString, "20120202T020000");
    equal(transform("20120101T230000", "20120202").icalString, "20120202T230000");
    equal(transform("20120101T235959", "20120202").icalString, "20120202T230000");

    let event = cal.createEvent();
    now = cal.createDateTime("20120101T015959");
    cal.dtz.setDefaultStartEndHour(event, cal.createDateTime("20120202"));
    equal(event.startDate.icalString, "20120202T020000");
    equal(event.endDate.icalString, "20120202T030000");

    let todo = cal.createTodo();
    now = cal.createDateTime("20120101T000000");
    cal.dtz.setDefaultStartEndHour(todo, cal.createDateTime("20120202"));
    equal(todo.entryDate.icalString, "20120202T010000");

    cal.dtz.now = oldNow;
}

function test_getStartEndProps() {
    equal(cal.dtz.startDateProp(cal.createEvent()), "startDate");
    equal(cal.dtz.endDateProp(cal.createEvent()), "endDate");
    equal(cal.dtz.startDateProp(cal.createTodo()), "entryDate");
    equal(cal.dtz.endDateProp(cal.createTodo()), "dueDate");

    throws(() => cal.dtz.startDateProp(null),
           /2147500033/);
    throws(() => cal.dtz.endDateProp(null),
           /2147500033/);
}

function test_OperationGroup() {
    let cancelCalled = false;
    function cancelFunc() {
        cancelCalled = true;
        return true;
    }

    let group = new cal.data.OperationGroup(cancelFunc);

    ok(group.isEmpty);
    ok(group.id.endsWith("-0"));
    equal(group.status, Cr.NS_OK);
    equal(group.isPending, true);

    let completedOp = { isPending: false };

    group.add(completedOp);
    ok(group.isEmpty);
    equal(group.isPending, true);

    let pendingOp1 = {
        id: 1,
        isPending: true,
        cancel: function() { this.cancelCalled = true; return true; }
    };

    group.add(pendingOp1);
    ok(!group.isEmpty);
    equal(group.isPending, true);

    let pendingOp2 = {
        id: 2,
        isPending: true,
        cancel: function() { this.cancelCalled = true; return true; }
    };

    group.add(pendingOp2);
    group.remove(pendingOp1);
    ok(!group.isEmpty);
    equal(group.isPending, true);

    group.cancel();

    equal(group.status, Ci.calIErrors.OPERATION_CANCELLED);
    ok(!group.isPending);
    ok(cancelCalled);
    ok(pendingOp2.cancelCalled);
}

function test_sameDay() {
    let createDate = cal.createDateTime.bind(cal);

    ok(cal.dtz.sameDay(createDate("20120101"), createDate("20120101T120000")));
    ok(cal.dtz.sameDay(createDate("20120101"), createDate("20120101")));
    ok(!cal.dtz.sameDay(createDate("20120101"), createDate("20120102")));
    ok(!cal.dtz.sameDay(createDate("20120101T120000"), createDate("20120102T120000")));
}

function test_binarySearch() {
    let arr = [2, 5, 7, 9, 20, 27, 34, 39, 41, 53, 62];
    equal(cal.data.binarySearch(arr, 27), 5); // Center
    equal(cal.data.binarySearch(arr, 2), 0); // Left most
    equal(cal.data.binarySearch(arr, 62), 11); // Right most

    equal(cal.data.binarySearch([5], 5), 1); // One element found
    equal(cal.data.binarySearch([1], 0), 0); // One element insert left
    equal(cal.data.binarySearch([1], 2), 1); // One element insert right
}
