/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, MozElements, unitPluralForm, agendaListbox,
   invokeEventDragSession, setBooleanAttribute, hideElement, onMouseOverItem */
{
    var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
    /**
     * The MozAgendaHeaderRichlistItem widget is typically used to display the
     * Today, Tomorrow, and Upcoming headers of the Today Pane listing.
     *
     * @extends {MozElements.MozRichlistitem}
     */
    class MozAgendaHeaderRichlistItem extends MozElements.MozRichlistitem {
        static get inheritedAttributes() {
            return { ".agenda-checkbox": "selected,label,hidden,disabled" };
        }

        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasChildNodes()) {
                return;
            }
            this.kCheckbox = document.createXULElement("checkbox");
            this.kCheckbox.classList.add("agenda-checkbox", "treenode-checkbox");
            this.appendChild(this.kCheckbox);

            this.dispatchEvent(new CustomEvent("bindingattached", { bubbles: false }));
            this.initializeAttributeInheritance();
        }

        getItem() {
            return this.mItem;
        }

        setItem(synthetic, showsToday) {
            this.mItem = synthetic;
            let duration = synthetic.duration;
            if (showsToday) {
                this.kCheckbox.label = this.getAttribute("title");
                if (this.id == "nextweek-header") {
                    if (duration > 7) {
                        this.kCheckbox.label += " (" + unitPluralForm(duration / 7, "weeks") + ")";
                    } else {
                        this.kCheckbox.label += " (" + unitPluralForm(duration, "days") + ")";
                    }
                }
            } else if (synthetic.duration == 1) {
                this.kCheckbox.label = cal.getDateFormatter().formatDate(synthetic.start);
            } else {
                this.kCheckbox.label = cal.getDateFormatter().formatInterval(synthetic.start, synthetic.end);
            }
        }
        getCheckbox() {
            return this.kCheckbox;
        }
    }

    MozXULElement.implementCustomInterface(MozAgendaHeaderRichlistItem, [Ci.nsIDOMXULSelectControlItemElement]);

    customElements.define("agenda-header-richlist-item", MozAgendaHeaderRichlistItem, { "extends": "richlistitem" });


    /**
     * The MozAgendaAlldayRichlistItem widget displays the information about
     * all day event: i.e. event start time, icon and calendar-month-day-box-item.
     * It is typically shown under the the agenda-header-richlist-item dropdown.
     *
     * @extends {MozElements.MozRichlistitem}
     */
    class MozAgendaAlldayRichlistItem extends MozElements.MozRichlistitem {
        static get inheritedAttributes() {
            return {
                ".agenda-allday-container-box": "selected,disabled",
                ".agenda-event-start": "selected"
            };
        }
        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasChildNodes()) {
                return;
            }
            this.setAttribute("is", "agenda-allday-richlist-item");
            this.addEventListener("click", (event) => {
                if (event.detail == 1) {
                    agendaListbox.onSelect(this);
                } else if (event.button == 0) {
                    // We only care about button 0 doubleclick events
                    document.getElementById("agenda_edit_event_command").doCommand();
                    event.stopPropagation();
                    event.preventDefault();
                }
            });

            this.addEventListener("mouseover", (event) => {
                event.stopPropagation();
                onMouseOverItem(event);
            });

            this.addEventListener("dragstart", (event) => {
                invokeEventDragSession(this.mAllDayItem.occurrence.clone(), this);
                event.stopPropagation();
                event.preventDefault();
            }, true);


            // Prevent double clicks from opening a dialog to create a new event.
            this.addEventListener("dblclick", (event) => {
                event.stopPropagation();
            });

            this.appendChild(MozXULElement.parseXULToFragment(`
                <hbox class="agenda-allday-container-box" flex="1">
                    <vbox pack="center" flex="1">
                        <label class="agenda-event-start" crop="end" hidden="true"></label>
                        <hbox flex="1" align="start">
                            <image class="agenda-multiDayEvent-image"></image>
                            <calendar-month-day-box-item flex="1" flat="true"></calendar-month-day-box-item>
                        </hbox>
                    </vbox>
                </hbox>
            `));
            this.mAllDayItem = null;
            this.mOccurrence = null;
            this.initializeAttributeInheritance();
        }

        setOccurrence(aOccurrence, aPeriod) {
            this.mOccurrence = aOccurrence;
            this.mAllDayItem = this.querySelector("calendar-month-day-box-item");
            this.mAllDayItem.occurrence = aOccurrence;
            let dateFormatter = cal.getDateFormatter();
            let periodStartDate = aPeriod.start.clone();
            periodStartDate.isDate = true;
            let periodEndDate = aPeriod.end;
            let startDate = this.mOccurrence[cal.dtz.startDateProp(this.mOccurrence)].getInTimezone(cal.dtz.defaultTimezone);
            let endDate = this.mOccurrence[cal.dtz.endDateProp(this.mOccurrence)].getInTimezone(cal.dtz.defaultTimezone);
            let endPreviousDay = endDate.clone();
            endPreviousDay.day--;
            // Show items's date for long periods but also for "Upcoming"
            // period with one day duration.
            let showDate = aPeriod.multiday || aPeriod.duration > 1;
            let date = "";
            let iconType = "";
            let allDayDateLabel = this.querySelector(".agenda-event-start");
            setBooleanAttribute(allDayDateLabel, "hidden", !showDate);
            if (startDate.compare(endPreviousDay) == 0) {
                // All day event one day duration.
                date = dateFormatter.formatDate(startDate);
            } else if (startDate.compare(periodStartDate) >= 0 &&
                startDate.compare(periodEndDate) <= 0) {
                // All day event spanning multiple days.
                iconType = "start";
                date = dateFormatter.formatDate(startDate);
            } else if (endDate.compare(periodStartDate) >= 0 &&
                endDate.compare(periodEndDate) <= 0) {
                iconType = "end";
                date = dateFormatter.formatDate(endPreviousDay);
            } else {
                iconType = "continue";
                hideElement(allDayDateLabel);
            }
            let multiDayImage = this.querySelector(".agenda-multiDayEvent-image");
            multiDayImage.setAttribute("type", iconType);
            // class wrap causes allday items to wrap its text in today-pane
            let addWrap = document.getAnonymousElementByAttribute(this.mAllDayItem, "anonid", "eventbox");
            addWrap.classList.add("wrap");
            addWrap = document.getAnonymousElementByAttribute(this.mAllDayItem, "anonid", "event-detail-box");
            addWrap.classList.add("wrap");
            allDayDateLabel.value = date;
        }
        get occurrence() {
            return this.mOccurrence;
        }
    }

    MozXULElement.implementCustomInterface(
        MozAgendaAlldayRichlistItem, [Ci.nsIDOMXULSelectControlItemElement]
    );

    customElements.define("agenda-allday-richlist-item", MozAgendaAlldayRichlistItem,
        { "extends": "richlistitem" });

    /**
     * The MozAgendaRichlistItem widget displays the information about
     * event: i.e. event start time, icon and name. It is shown under
     * agenda-header-richlist-item dropdown as a richlistitem.
     *
     * @extends {MozElements.MozRichlistitem}
     */
    class MozAgendaRichlistItem extends MozElements.MozRichlistitem {
        static get inheritedAttributes() {
            return {
                ".agenda-container-box": "selected,disabled,current",
                ".agenda-event-start": "selected",
                ".agenda-event-title": "selected"
            };
        }

        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasChildNodes()) {
                return;
            }
            this.setAttribute("is", "agenda-richlist-item");
            this.addEventListener("click", (event) => {
                if (event.detail == 1) {
                    agendaListbox.onSelect(this);
                } else if (event.button == 0) {
                    // We only care about button 0 doubleclick events
                    document.getElementById("agenda_edit_event_command").doCommand();
                    event.stopPropagation();
                    event.preventDefault();
                }
            }, true);

            this.addEventListener("mouseover", (event) => {
                event.stopPropagation();
                onMouseOverItem(event);
            });

            this.addEventListener("dragstart", (event) => {
                invokeEventDragSession(this.mOccurrence.clone(), this);
            });
            // Prevent double clicks from opening a dialog to create a new event.
            this.addEventListener("dblclick", (event) => {
                event.stopPropagation();
            });

            this.appendChild(MozXULElement.parseXULToFragment(`
                <hbox class="agenda-container-box" flex="1">
                    <hbox>
                        <vbox>
                            <image class="agenda-calendar-image"></image>
                            <spacer flex="1"></spacer>
                        </vbox>
                    </hbox>
                    <vbox flex="1" class="agenda-description">
                        <hbox align="start">
                            <image class="agenda-multiDayEvent-image"></image>
                            <label class="agenda-event-start" crop="end" flex="1"></label>
                        </hbox>
                        <label class="agenda-event-title" crop="end"></label>
                    </vbox>
                </hbox>
            `));
            this.mOccurrence = null;
            this.initializeAttributeInheritance();
        }
        setOccurrence(aItem, aPeriod) {
            this.mOccurrence = aItem;
            this.setAttribute("status", aItem.status);
            let dateFormatter = Cc["@mozilla.org/calendar/datetime-formatter;1"].getService(Ci.calIDateTimeFormatter);
            let periodStartDate = aPeriod.start.clone();
            periodStartDate.isDate = true;
            let periodEndDate = aPeriod.end.clone();
            periodEndDate.day--;
            let start = this.mOccurrence[cal.dtz.startDateProp(this.mOccurrence)].getInTimezone(cal.dtz.defaultTimezone);
            let end = this.mOccurrence[cal.dtz.endDateProp(this.mOccurrence)].getInTimezone(cal.dtz.defaultTimezone);
            let startDate = start.clone();
            startDate.isDate = true;
            let endDate = end.clone();
            endDate.isDate = true;
            let endAtMidnight = (end.hour == 0 && end.minute == 0);
            if (endAtMidnight) {
                endDate.day--;
            }
            // Show items's date for long periods but also for "Upcoming"
            // period with one day duration.
            let longFormat = aPeriod.multiday || aPeriod.duration > 1;
            let duration = "";
            let iconType = "";
            if (startDate.compare(endDate) == 0) {
                // event that starts and ends in the same day, midnight included
                duration = longFormat ? dateFormatter.formatDateTime(start)
                    : dateFormatter.formatTime(start);
            } else if (startDate.compare(periodStartDate) >= 0 &&
                startDate.compare(periodEndDate) <= 0) {
                // event spanning multiple days, start date within period
                iconType = "start";
                duration = longFormat ? dateFormatter.formatDateTime(start)
                    : dateFormatter.formatTime(start);
            } else if (endDate.compare(periodStartDate) >= 0 &&
                endDate.compare(periodEndDate) <= 0) {
                // event spanning multiple days, end date within period
                iconType = "end";
                if (endAtMidnight) {
                    duration = dateFormatter.formatDate(endDate) + " ";
                    duration = longFormat ? duration + cal.l10n.getDateFmtString("midnight")
                        : cal.l10n.getDateFmtString("midnight");
                } else {
                    duration = longFormat ? dateFormatter.formatDateTime(end)
                        : dateFormatter.formatTime(end);
                }
            } else {
                iconType = "continue";
            }
            let multiDayImage = this.querySelector(".agenda-multiDayEvent-image");
            multiDayImage.setAttribute("type", iconType);
            let durationbox = this.querySelector(".agenda-event-start");
            durationbox.textContent = duration;


            // show items with time only (today & tomorrow) as one line.
            if (longFormat) {
                let titlebox = this.querySelector(".agenda-event-title");
                titlebox.textContent = aItem.title;
            } else {
                durationbox.textContent += " " + aItem.title;
            }
            this.refreshColor();
        }

        refreshColor() {
            let calcolor = (this.mOccurrence &&
                this.mOccurrence.calendar.getProperty("color")) ||
                "#a8c2e1";

            let imagebox = this.querySelector(".agenda-calendar-image");
            imagebox.setAttribute("style", "background-color: " + calcolor + ";");
        }

        get occurrence() {
            return this.mOccurrence;
        }
    }


    MozXULElement.implementCustomInterface(MozAgendaRichlistItem, [Ci.nsIDOMXULSelectControlItemElement]);

    customElements.define("agenda-richlist-item", MozAgendaRichlistItem, { "extends": "richlistitem" });
}
