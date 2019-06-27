/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported loadCalendars */

/* import-globals-from ../calendar-ui-utils.js */

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

function loadCalendars() {
    const calendarManager = Cc["@mozilla.org/calendar/manager;1"]
                              .getService(Ci.calICalendarManager);
    let listbox = document.getElementById("calendar-list");
    let composite = cal.view.getCompositeCalendar(window.opener);
    let selectedIndex = 0;
    let calendars;

    if (window.arguments[0].calendars) {
        calendars = window.arguments[0].calendars;
    } else {
        calendars = calendarManager.getCalendars({});
    }
    calendars = sortCalendarArray(calendars);

    for (let i = 0; i < calendars.length; i++) {
        let calendar = calendars[i];
        let listItem = document.createXULElement("richlistitem");

        let colorCell = document.createXULElement("box");
        try {
            let calColor = calendar.getProperty("color");
            colorCell.style.background = calColor || "#a8c2e1";
        } catch (e) {}
        colorCell.style.width = "17px";
        listItem.appendChild(colorCell);

        let nameCell = document.createXULElement("label");
        nameCell.setAttribute("value", calendar.name);
        nameCell.setAttribute("flex", "1");
        listItem.appendChild(nameCell);

        listItem.calendar = calendar;
        listbox.appendChild(listItem);

        // Select the default calendar of the opening calendar window.
        if (calendar.id == composite.defaultCalendar.id) {
            selectedIndex = i;
        }
    }
    document.getElementById("prompt").textContent = window.arguments[0].promptText;
    if (window.arguments[0].promptNotify) {
        document.getElementById("promptNotify").textContent = window.arguments[0].promptNotify;
    }

    // this button is the default action
    let accept = document.getAnonymousElementByAttribute(document.documentElement, "dlgtype", "accept");
    if (window.arguments[0].labelOk) {
        accept.setAttribute("label", window.arguments[0].labelOk);
        accept.removeAttribute("hidden");
    }

    let extra1 = document.getAnonymousElementByAttribute(document.documentElement, "dlgtype", "extra1");
    if (window.arguments[0].labelExtra1) {
        extra1.setAttribute("label", window.arguments[0].labelExtra1);
        extra1.removeAttribute("hidden");
    } else {
        extra1.setAttribute("hidden", "true");
    }

    if (calendars.length) {
        listbox.ensureIndexIsVisible(selectedIndex);
        listbox.timedSelect(listbox.getItemAtIndex(selectedIndex), 0);
    } else {
        // If there are no calendars, then disable the accept button
        document.documentElement.getButton("accept").setAttribute("disabled", "true");
    }

    window.sizeToContent();
}

document.addEventListener("dialogaccept", () => {
    let listbox = document.getElementById("calendar-list");
    window.arguments[0].onOk(listbox.selectedItem.calendar);
});

document.addEventListener("dialogextra1", () => {
    let listbox = document.getElementById("calendar-list");
    window.arguments[0].onExtra1(listbox.selectedItem.calendar);
    window.close();
});
