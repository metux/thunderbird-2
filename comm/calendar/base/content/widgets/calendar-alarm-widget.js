/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global Cr MozElements MozXULElement PluralForm Services */

// Wrap in a block to prevent leaking to window scope.
{
    var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
    /**
     * Represents an alarm in the alarms dialog. It appears there when an alarm is fired, and
     * allows the alarm to be snoozed, dismissed, etc.
     * @extends MozElements.MozRichlistitem
     */
    class MozCalendarAlarmWidget extends MozElements.MozRichlistitem {
        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            this.hasConnected = true;
            this.appendChild(MozXULElement.parseXULToFragment(`
                <vbox pack="start">
                  <image class="alarm-calendar-image"/>
                </vbox>
                <vbox flex="1">
                  <label class="alarm-title-label" crop="end"/>
                  <vbox class="additional-information-box">
                    <label class="alarm-date-label"/>
                    <hbox>
                      <label class="alarm-location-label"/>
                      <description class="alarm-location-description"
                                   crop="end"
                                   flex="1"/>
                    </hbox>
                    <hbox pack="start">
                      <label class="text-link alarm-details-label"
                             value="&calendar.alarm.details.label;"
                             onclick="showDetails(event)"
                             onkeypress="showDetails(event)"/>
                    </hbox>
                  </vbox>
                </vbox>
                <spacer flex="1"/>
                <label class="alarm-relative-date-label"/>
                <vbox class="alarm-action-buttons" pack="center">
                  <button class="alarm-snooze-button"
                          type="menu"
                          label="&calendar.alarm.snoozefor.label;">
                    <menupopup is="calendar-snooze-popup" ignorekeys="true"/>
                  </button>
                  <button class="alarm-dismiss-button"
                          label="&calendar.alarm.dismiss.label;"
                          oncommand="dismissAlarm()"/>
                </vbox>
                `,
                [
                    "chrome://calendar/locale/global.dtd",
                    "chrome://calendar/locale/calendar.dtd"
                ]
            ));
            this.mItem = null;
            this.mAlarm = null;
        }

        set item(val) {
            this.mItem = val;
            this.updateLabels();
            return val;
        }

        get item() {
            return this.mItem;
        }

        set alarm(val) {
            this.mAlarm = val;
            this.updateLabels();
            return val;
        }

        get alarm() {
            return this.mAlarm;
        }

        /**
         * Refresh UI text (dates, titles, locations) when the data has changed.
         */
        updateLabels() {
            if (!this.mItem || !this.mAlarm) {
                // Setup not complete, do nothing for now.
                return;
            }
            const formatter = cal.getDateFormatter();
            let titleLabel = this.querySelector(".alarm-title-label");
            let locationDescription = this.querySelector(".alarm-location-description");
            let dateLabel = this.querySelector(".alarm-date-label");

            // Dates
            if (cal.item.isEvent(this.mItem)) {
                dateLabel.textContent = formatter.formatItemInterval(this.mItem);
            } else if (cal.item.isToDo(this.mItem)) {
                let startDate = this.mItem.entryDate || this.mItem.dueDate;
                if (startDate) {
                    // A task with a start or due date, show with label.
                    startDate = startDate.getInTimezone(cal.dtz.defaultTimezone);
                    dateLabel.textContent = cal.l10n.getCalString(
                        "alarmStarts",
                        [formatter.formatDateTime(startDate)]
                    );
                } else {
                    // If the task has no start date, then format the alarm date.
                    dateLabel.textContent = formatter.formatDateTime(
                        this.mAlarm.alarmDate
                    );
                }
            } else {
                throw Cr.NS_ERROR_ILLEGAL_VALUE;
            }

            // Relative Date
            this.updateRelativeDateLabel();

            // Title, Location
            titleLabel.textContent = this.mItem.title || "";
            locationDescription.textContent = this.mItem.getProperty("LOCATION") || "";
            locationDescription.hidden = (locationDescription.textContent.length < 1);

            this.querySelector(".alarm-location-label")
                .hidden = (locationDescription.textContent.length < 1);

            // Hide snooze button if read-only.
            let snoozeButton = this.querySelector(".alarm-snooze-button");
            if (!cal.acl.isCalendarWritable(this.mItem.calendar) ||
                !cal.acl.userCanModifyItem(this.mItem)) {
                let tooltip = "reminderDisabledSnoozeButtonTooltip";
                snoozeButton.disabled = true;
                snoozeButton.setAttribute(
                    "tooltiptext",
                    cal.l10n.getString("calendar-alarms", tooltip)
                );
            } else {
                snoozeButton.disabled = false;
                snoozeButton.removeAttribute("tooltiptext");
            }
        }

        /**
         * Refresh UI text for relative date when the data has changed.
         */
        updateRelativeDateLabel() {
            const formatter = cal.getDateFormatter();
            const item = this.mItem;
            let relativeDateLabel = this.querySelector(".alarm-relative-date-label");
            let relativeDateString;
            let startDate = item[cal.dtz.startDateProp(item)] ||
                item[cal.dtz.endDateProp(item)];

            if (startDate) {
                startDate = startDate.getInTimezone(cal.dtz.defaultTimezone);
                let currentDate = cal.dtz.now();

                const sinceDayStart = (currentDate.hour * 3600) +
                    (currentDate.minute * 60);

                currentDate.second = 0;
                startDate.second = 0;

                const sinceAlarm = currentDate.subtractDate(startDate).inSeconds;

                this.mAlarmToday = (sinceAlarm < sinceDayStart) &&
                    (sinceAlarm > sinceDayStart - 86400);

                if (this.mAlarmToday) {
                    // The alarm is today.
                    relativeDateString = cal.l10n.getCalString(
                        "alarmTodayAt",
                        [formatter.formatTime(startDate)]
                    );
                } else if (sinceAlarm <= sinceDayStart - 86400 &&
                    sinceAlarm > sinceDayStart - 172800) {
                    // The alarm is tomorrow.
                    relativeDateString = cal.l10n.getCalString(
                        "alarmTomorrowAt",
                        [formatter.formatTime(startDate)]
                    );
                } else if (sinceAlarm < sinceDayStart + 86400 &&
                    sinceAlarm > sinceDayStart) {
                    // The alarm is yesterday.
                    relativeDateString = cal.l10n.getCalString(
                        "alarmYesterdayAt",
                        [formatter.formatTime(startDate)]
                    );
                } else {
                    // The alarm is way back.
                    relativeDateString = [formatter.formatDateTime(startDate)];
                }
            } else {
                // No start or end date, therefore the alarm must be absolute
                // and have an alarm date.
                relativeDateString = [
                    formatter.formatDateTime(this.mAlarm.alarmDate)
                ];
            }

            relativeDateLabel.textContent = relativeDateString;
        }

        /**
         * Click/keypress handler for "Details" link. Dispatches an event to open an item dialog.
         * @param event {Event} The click or keypress event.
         */
        showDetails(event) {
            if (event.type == "click" || (event.type == "keypress" && event.key == "Enter")) {
                const detailsEvent = new Event("itemdetails", { bubbles: true, cancelable: false });
                this.dispatchEvent(detailsEvent);
            }
        }

        /**
         * Click handler for "Dismiss" button.  Dispatches an event to dismiss the alarm.
         */
        dismissAlarm() {
            const dismissEvent = new Event("dismiss", { bubbles: true, cancelable: false });
            this.dispatchEvent(dismissEvent);
        }
    }

    customElements.define("calendar-alarm-widget", MozCalendarAlarmWidget);

    /**
     * A popup panel for selecting how long to snooze alarms/reminders.
     * It appears when a snooze button is clicked.
     * @extends MozElements.MozMenuPopup
     */
    class MozCalendarSnoozePopup extends MozElements.MozMenuPopup {
        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            this.hasConnected = true;
            this.appendChild(MozXULElement.parseXULToFragment(`
                <menuitem label="&calendar.alarm.snooze.5minutes.label;"
                          value="5"
                          oncommand="snoozeItem(event)"/>
                <menuitem label="&calendar.alarm.snooze.10minutes.label;"
                          value="10"
                          oncommand="snoozeItem(event)"/>
                <menuitem label="&calendar.alarm.snooze.15minutes.label;"
                          value="15"
                          oncommand="snoozeItem(event)"/>
                <menuitem label="&calendar.alarm.snooze.30minutes.label;"
                          value="30"
                          oncommand="snoozeItem(event)"/>
                <menuitem label="&calendar.alarm.snooze.45minutes.label;"
                          value="45"
                          oncommand="snoozeItem(event)"/>
                <menuitem label="&calendar.alarm.snooze.1hour.label;"
                          value="60"
                          oncommand="snoozeItem(event)"/>
                <menuitem label="&calendar.alarm.snooze.2hours.label;"
                          value="120"
                          oncommand="snoozeItem(event)"/>
                <menuitem label="&calendar.alarm.snooze.1day.label;"
                          value="1440"
                          oncommand="snoozeItem(event)"/>
                <menuseparator/>
                <hbox class="snooze-options-box">
                  <textbox class="snooze-value-textbox"
                           oninput="updateUIText()"
                           onselect="updateUIText()"
                           type="number"
                           size="3"/>
                  <menulist class="snooze-unit-menulist" allowevents="true">
                    <menupopup class="snooze-unit-menupopup menulist-menupopup"
                               position="after_start"
                               ignorekeys="true">
                      <menuitem closemenu="single" class="unit-menuitem" value="1"></menuitem>
                      <menuitem closemenu="single" class="unit-menuitem" value="60"></menuitem>
                      <menuitem closemenu="single" class="unit-menuitem" value="1440"></menuitem>
                    </menupopup>
                  </menulist>
                  <toolbarbutton class="snooze-popup-button snooze-popup-ok-button"
                                 oncommand="snoozeOk()"/>
                  <toolbarbutton class="snooze-popup-button snooze-popup-cancel-button"
                                 aria-label="&calendar.alarm.snooze.cancel;"
                                 oncommand="snoozeCancel()"/>
                </hbox>
                `,
                [
                    "chrome://calendar/locale/global.dtd",
                    "chrome://calendar/locale/calendar.dtd"
                ]
            ));
            const defaultSnoozeLength = Services.prefs.getIntPref("calendar.alarms.defaultsnoozelength", 0);
            const snoozeLength = defaultSnoozeLength <= 0 ? 5 : defaultSnoozeLength;

            let unitList = this.querySelector(".snooze-unit-menulist");
            let unitValue = this.querySelector(".snooze-value-textbox");

            if ((snoozeLength / 60) % 24 == 0) {
                // Days
                unitValue.value = (snoozeLength / 60) / 24;
                unitList.selectedIndex = 2;
            } else if (snoozeLength % 60 == 0) {
                // Hours
                unitValue.value = snoozeLength / 60;
                unitList.selectedIndex = 1;
            } else {
                // Minutes
                unitValue.value = snoozeLength;
                unitList.selectedIndex = 0;
            }

            this.updateUIText();
        }

        /**
         * Dispatch a snooze event when an alarm is snoozed.
         * @param minutes {number|string} The number of minutes to snooze for.
         */
        snoozeAlarm(minutes) {
            let snoozeEvent = new Event("snooze", { bubbles: true, cancelable: false });
            snoozeEvent.detail = minutes;

            // For single alarms the event.target has to be the calendar-alarm-widget element,
            // (so call dispatchEvent on that). For snoozing all alarms the event.target is not
            // relevant but the snooze all popup is not inside a calendar-alarm-widget (so call
            // dispatchEvent on 'this').
            const eventTarget = this.id == "alarm-snooze-all-popup"
                ? this
                : this.closest("calendar-alarm-widget");
            eventTarget.dispatchEvent(snoozeEvent);
        }

        /**
         * Click handler for snooze popup menu items (like "5 Minutes", "1 Hour", etc.).
         * @param event {Event} The click event.
         */
        snoozeItem(event) {
            this.snoozeAlarm(event.target.value);
        }

        /**
         * Click handler for the "OK" (checkmark) button when snoozing for a custom amount of time.
         */
        snoozeOk() {
            const unitList = this.querySelector(".snooze-unit-menulist");
            const unitValue = this.querySelector(".snooze-value-textbox");
            const minutes = (unitList.value || 1) * unitValue.value;
            this.snoozeAlarm(minutes);
        }

        /**
         * Click handler for the "cancel" ("X") button for not snoozing a custom amount of time.
         */
        snoozeCancel() {
            this.hidePopup();
        }

        /**
         * Initializes and updates the dynamic UI text. This text can change depending on
         * input, like for plurals, when you change from "[1] [minute]" to "[2] [minutes]".
         */
        updateUIText() {
            const unitList = this.querySelector(".snooze-unit-menulist");
            const unitPopup = this.querySelector(".snooze-unit-menupopup");
            const unitValue = this.querySelector(".snooze-value-textbox");
            let okButton = this.querySelector(".snooze-popup-ok-button");

            function unitName(list) {
                return { 1: "unitMinutes", 60: "unitHours", 1440: "unitDays" }[list.value] ||
                "unitMinutes";
            }

            let pluralString = cal.l10n.getCalString(unitName(unitList));

            const unitPlural = PluralForm.get(unitValue.value, pluralString)
                .replace("#1", unitValue.value);

            let okButtonAriaLabel = cal.l10n.getString(
                "calendar-alarms",
                "reminderSnoozeOkA11y",
                [unitPlural]
            );
            okButton.setAttribute("aria-label", okButtonAriaLabel);

            const items = unitPopup.getElementsByTagName("menuitem");
            for (let menuItem of items) {
                pluralString = cal.l10n.getCalString(unitName(menuItem));

                menuItem.label = PluralForm.get(unitValue.value, pluralString)
                    .replace("#1", "").trim();
            }
        }
    }

    customElements.define("calendar-snooze-popup", MozCalendarSnoozePopup, { "extends": "menupopup" });
}
