/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


function run_test() {
    test_get_item_sort_key();
    test_sort_items();
}


function test_get_item_sort_key() {
    let event = cal.createEvent(dedent`
        BEGIN:VEVENT
        PRIORITY:8
        SUMMARY:summary
        DTSTART:20180102T030405Z
        DTEND:20180607T080910Z
        CATEGORIES:a,b,c
        LOCATION:location
        STATUS:CONFIRMED
        END:VEVENT
    `);

    strictEqual(cal.unifinder.getItemSortKey(event, "nothing"), null);
    equal(cal.unifinder.getItemSortKey(event, "priority"), 8);
    equal(cal.unifinder.getItemSortKey(event, "title"), "summary");
    equal(cal.unifinder.getItemSortKey(event, "startDate"), 1514862245000000);
    equal(cal.unifinder.getItemSortKey(event, "endDate"), 1528358950000000);
    equal(cal.unifinder.getItemSortKey(event, "categories"), "a, b, c");
    equal(cal.unifinder.getItemSortKey(event, "location"), "location");
    equal(cal.unifinder.getItemSortKey(event, "status"), 1);

    let task = cal.createTodo(dedent`
        BEGIN:VTODO
        DTSTART:20180102T030405Z
        DUE:20180607T080910Z
        PERCENT-COMPLETE:20
        STATUS:COMPLETED
        END:VTODO
    `);

    equal(cal.unifinder.getItemSortKey(task, "priority"), 5);
    strictEqual(cal.unifinder.getItemSortKey(task, "title"), "");
    equal(cal.unifinder.getItemSortKey(task, "entryDate"), 1514862245000000);
    equal(cal.unifinder.getItemSortKey(task, "dueDate"), 1528358950000000);
    equal(cal.unifinder.getItemSortKey(task, "completedDate"), -62168601600000000);
    equal(cal.unifinder.getItemSortKey(task, "percentComplete"), 20);
    strictEqual(cal.unifinder.getItemSortKey(task, "categories"), "");
    strictEqual(cal.unifinder.getItemSortKey(task, "location"), "");
    equal(cal.unifinder.getItemSortKey(task, "status"), 2);

    let task2 = cal.createTodo(dedent`
        BEGIN:VTODO
        STATUS:GETTIN' THERE
        END:VTODO
    `);
    equal(cal.unifinder.getItemSortKey(task2, "percentComplete"), 0);
    equal(cal.unifinder.getItemSortKey(task2, "status"), -1);
}

function test_sort_items() {
    // string comparison
    let summaries = ["", "a", "b"];
    let items = summaries.map(summary => {
        return cal.createEvent(dedent`
            BEGIN:VEVENT
            SUMMARY:${summary}
            END:VEVENT
        `);
    });

    cal.unifinder.sortItems(items, "title", 1);
    deepEqual(items.map(item => item.title), ["a", "b", null]);

    cal.unifinder.sortItems(items, "title", -1);
    deepEqual(items.map(item => item.title), [null, "b", "a"]);

    // date comparison
    let dates = ["20180101T000002Z", "20180101T000000Z", "20180101T000001Z"];
    items = dates.map(date => {
        return cal.createEvent(dedent`
            BEGIN:VEVENT
            DTSTART:${date}
            END:VEVENT
        `);
    });

    cal.unifinder.sortItems(items, "startDate", 1);
    deepEqual(items.map(item => item.startDate.icalString),
          ["20180101T000000Z", "20180101T000001Z", "20180101T000002Z"]);

    cal.unifinder.sortItems(items, "startDate", -1);
    deepEqual(items.map(item => item.startDate.icalString),
          ["20180101T000002Z", "20180101T000001Z", "20180101T000000Z"]);

    // number comparison
    let percents = [3, 1, 2];
    items = percents.map(percent => {
        return cal.createTodo(dedent`
            BEGIN:VTODO
            PERCENT-COMPLETE:${percent}
            END:VTODO
        `);
    });

    cal.unifinder.sortItems(items, "percentComplete", 1);
    deepEqual(items.map(item => item.percentComplete), [1, 2, 3]);

    cal.unifinder.sortItems(items, "percentComplete", -1);
    deepEqual(items.map(item => item.percentComplete), [3, 2, 1]);
}
