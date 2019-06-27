/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    do_calendar_startup(run_next_test);
}

function check_delmgr_call(aFunc) {
    let delmgr = Cc["@mozilla.org/calendar/deleted-items-manager;1"].getService(Ci.calIDeletedItems);
    return new Promise((resolve, reject) => {
        delmgr.wrappedJSObject.completedNotifier.handleCompletion = (aReason) => {
            if (aReason == Ci.mozIStorageStatementCallback.REASON_FINISHED) {
                resolve();
            } else {
                reject(aReason);
            }
        };
        aFunc();
    });
}

add_task(async function test_deleted_items() {
    let calmgr = cal.getCalendarManager();
    let delmgr = Cc["@mozilla.org/calendar/deleted-items-manager;1"].getService(Ci.calIDeletedItems);
    // No items have been deleted, retrieving one should return null.
    equal(delmgr.getDeletedDate("random"), null);
    equal(delmgr.getDeletedDate("random", "random"), null);

    // Make sure the cache is initially flushed and that this doesn't throw an
    // error.
    await check_delmgr_call(() => delmgr.flush());

    let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-storage-calendar://"));
    calmgr.registerCalendar(memory);

    let item = cal.createEvent();
    item.id = "test-item-1";
    item.startDate = cal.dtz.now();
    item.endDate = cal.dtz.now();

    // Add the item, it still shouldn't be in the deleted database.
    await check_delmgr_call(() => memory.addItem(item, null));
    equal(delmgr.getDeletedDate(item.id), null);
    equal(delmgr.getDeletedDate(item.id, memory.id), null);

    // We need to stop time so we have something to compare with.
    let referenceDate = cal.createDateTime("20120726T112045"); referenceDate.timezone = cal.dtz.defaultTimezone;
    let futureDate = cal.createDateTime("20380101T000000"); futureDate.timezone = cal.dtz.defaultTimezone;
    let useFutureDate = false;
    let oldNowFunction = cal.dtz.now;
    cal.dtz.now = function() {
        return (useFutureDate ? futureDate : referenceDate).clone();
    };

    // Deleting an item should trigger it being marked for deletion.
    await check_delmgr_call(() => memory.deleteItem(item, null));

    // Now check if it was deleted at our reference date.
    let deltime = delmgr.getDeletedDate(item.id);
    notEqual(deltime, null);
    equal(deltime.compare(referenceDate), 0);

    // The same with the calendar.
    deltime = delmgr.getDeletedDate(item.id, memory.id);
    notEqual(deltime, null);
    equal(deltime.compare(referenceDate), 0);

    // Item should not be found in other calendars.
    equal(delmgr.getDeletedDate(item.id, "random"), null);

    // Check if flushing works, we need to travel time for that.
    useFutureDate = true;
    await check_delmgr_call(() => delmgr.flush());
    equal(delmgr.getDeletedDate(item.id), null);
    equal(delmgr.getDeletedDate(item.id, memory.id), null);

    // Start over with our past time.
    useFutureDate = false;

    // Add, delete, add. Item should no longer be deleted.
    await check_delmgr_call(() => memory.addItem(item, null));
    equal(delmgr.getDeletedDate(item.id), null);
    await check_delmgr_call(() => memory.deleteItem(item, null));
    equal(delmgr.getDeletedDate(item.id).compare(referenceDate), 0);
    await check_delmgr_call(() => memory.addItem(item, null));
    equal(delmgr.getDeletedDate(item.id), null);

    // Revert now function, in case more tests are written.
    cal.dtz.now = oldNowFunction;
});
