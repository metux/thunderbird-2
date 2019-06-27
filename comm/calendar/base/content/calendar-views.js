/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements, MozXULElement, Services, timeIndicator */

"use strict";

//                           The calendar view class hierarchy.
//
//                                     CalendarBaseView
//                                     /               \
//             CalendarMultidayBaseView                CalendarMonthBaseView
//                 /           \                           /               \
//     CalendarDayView     CalendarWeekView    CalendarMultiweekView    CalendarMonthView

// Wrap in a block to prevent leaking to window scope.
{
    var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
    /**
     * The calendar view for viewing a single day.
     *
     * @extends {MozElements.CalendarMultidayBaseView}
     */
    class CalendarDayView extends MozElements.CalendarMultidayBaseView {
        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            // this.hasConnected is set to true via super.connectedCallback.
            super.connectedCallback();
        }

        // calICalendarView Methods and Properties

        get observerID() {
            return "day-view-observer";
        }

        get supportsWorkdaysOnly() {
            return false;
        }

        goToDay(date) {
            if (!date) {
                this.refresh();
                return;
            }
            const timezoneDate = date.getInTimezone(this.timezone);
            this.setDateRange(timezoneDate, timezoneDate);
            this.selectedDay = timezoneDate;
        }

        moveView(number) {
            if (number) {
                const currentDay = this.startDay.clone();
                currentDay.day += number;
                this.goToDay(currentDay);
            } else {
                this.goToDay(cal.dtz.now());
            }
        }

        // End calICalendarView Methods and Properties
    }

    MozXULElement.implementCustomInterface(CalendarDayView, [Ci.calICalendarView]);

    customElements.define("calendar-day-view", CalendarDayView);

    /**
     * The calendar view for viewing a single week.
     *
     * @extends {MozElements.CalendarMultidayBaseView}
     */
    class CalendarWeekView extends MozElements.CalendarMultidayBaseView {
        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            // this.hasConnected is set to true via super.connectedCallback.
            super.connectedCallback();

            // Add a listener for mode changes.
            this.mModeHandler = (event) => {
                if (event.attrName != "mode") {
                    return;
                }
                const currentMode = document.getElementById("modeBroadcaster").getAttribute("mode");
                if (currentMode != "calendar") {
                    timeIndicator.cancel();
                }
            };

            document.getElementById("modeBroadcaster")
                .addEventListener("DOMAttrModified", this.mModeHandler, true);

            window.addEventListener("unload", () => {
                document.getElementById("modeBroadcaster")
                    .removeEventListener("DOMAttrModified", this.mModeHandler, true);
            }, { once: true });
        }

        // calICalendarView Methods and Properties

        get observerID() {
            return "week-view-observer";
        }

        goToDay(date) {
            this.displayDaysOff = !this.mWorkdaysOnly;

            if (!date) {
                this.refresh();
                return;
            }
            date = date.getInTimezone(this.timezone);
            const weekStart = cal.getWeekInfoService().getStartOfWeek(date);
            const weekEnd = weekStart.clone();
            weekEnd.day += 6;
            this.setDateRange(weekStart, weekEnd);
            this.selectedDay = date;
        }

        moveView(number) {
            if (number) {
                const date = this.selectedDay.clone();
                date.day += 7 * number;
                this.goToDay(date);
            } else {
                this.goToDay(cal.dtz.now());
            }
        }

        // End calICalendarView Methods and Properties
    }

    MozXULElement.implementCustomInterface(CalendarWeekView, [Ci.calICalendarView]);

    customElements.define("calendar-week-view", CalendarWeekView);

    /**
     * The calendar view for viewing multiple weeks.
     *
     * @extends {MozElements.CalendarMonthBaseView}
     */
    class CalendarMultiweekView extends MozElements.CalendarMonthBaseView {
        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            // this.hasConnected is set to true via super.connectedCallback.
            super.connectedCallback();

            this.mWeeksInView = Services.prefs.getIntPref("calendar.weeks.inview", 4);
        }

        set weeksInView(weeks) {
            this.mWeeksInView = weeks;
            Services.prefs.setIntPref("calendar.weeks.inview", Number(weeks));
            this.refreshView();
            return weeks;
        }

        get weeksInView() {
            return this.mWeeksInView;
        }

        // calICalendarView Methods and Properties

        get supportsZoom() {
            return true;
        }

        get observerID() {
            return "multiweek-view-observer";
        }

        zoomIn(level = 1) {
            const visibleWeeks = level + Services.prefs.getIntPref("calendar.weeks.inview", 4);

            Services.prefs.setIntPref("calendar.weeks.inview", Math.min(visibleWeeks, 6));
        }

        zoomOut(level = 1) {
            const visibleWeeks = level + Services.prefs.getIntPref("calendar.weeks.inview", 4);

            Services.prefs.setIntPref("calendar.weeks.inview", Math.max(visibleWeeks, 2));
        }

        zoomReset() {
            Services.prefs.setIntPref("calendar.view.visiblehours", 4);
        }

        goToDay(date) {
            this.showFullMonth = false;
            this.displayDaysOff = !this.mWorkdaysOnly;

            // If date is null it means that only a refresh is needed
            // without changing the start and end of the view.
            if (date) {
                date = date.getInTimezone(this.timezone);

                // Get the first date that should be shown. This is the
                // start of the week of the day that we're centering around
                // adjusted for the day the week starts on and the number
                // of previous weeks we're supposed to display.
                const dayStart = cal.getWeekInfoService().getStartOfWeek(date);
                dayStart.day -= 7 * Services.prefs.getIntPref("calendar.previousweeks.inview", 0);

                // The last day we're supposed to show.
                const dayEnd = dayStart.clone();
                dayEnd.day += (7 * this.mWeeksInView) - 1;
                this.setDateRange(dayStart, dayEnd);
                this.selectedDay = date;
            } else {
                this.refresh();
            }
        }

        moveView(weeksToMove) {
            if (weeksToMove) {
                const date = this.startDay.clone();
                const savedSelectedDay = this.selectedDay.clone();
                // weeksToMove only corresponds to the number of weeks to move
                // make sure to compensate for previous weeks in view too.
                const prevWeeks = Services.prefs.getIntPref("calendar.previousweeks.inview", 4);
                date.day += 7 * (weeksToMove + prevWeeks);
                this.goToDay(date);
                savedSelectedDay.day += 7 * weeksToMove;
                this.selectedDay = savedSelectedDay;
            } else {
                const date = cal.dtz.now();
                this.goToDay(date);
                this.selectedDay = date;
            }
        }

        // End calICalendarView Methods and Properties
    }

    MozXULElement.implementCustomInterface(CalendarMultiweekView, [Ci.calICalendarView]);

    customElements.define("calendar-multiweek-view", CalendarMultiweekView);

    /**
     * The calendar view for viewing a single month.
     *
     * @extends {MozElements.CalendarMonthBaseView}
     */
    class CalendarMonthView extends MozElements.CalendarMonthBaseView {
        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            // this.hasConnected is set to true via super.connectedCallback.
            super.connectedCallback();
        }

        // calICalendarView Methods and Properties

        get observerID() {
            return "month-view-observer";
        }

        goToDay(date) {
            this.displayDaysOff = !this.mWorkdaysOnly;

            const dateToShow = date || date.getInTimezone(this.timezone);

            this.showDate(dateToShow);
        }

        getRangeDescription() {
            const monthName = cal.l10n
                .formatMonth(this.rangeStartDate.month + 1, "calendar", "monthInYear");

            return cal.l10n.getCalString("monthInYear", [monthName, this.rangeStartDate.year]);
        }

        moveView(number) {
            const dates = this.getDateList({});
            this.displayDaysOff = !this.mWorkdaysOnly;

            if (number) {
                // The first few dates in this list are likely in the month
                // prior to the one actually being shown (since the month
                // probably doesn't start on a Sunday).  The 7th item must
                // be in correct month though.
                const date = dates[6].clone();

                date.month += number;
                // Store selected day before we move.
                const oldSelectedDay = this.selectedDay;

                this.goToDay(date);

                // Most of the time we want to select the date with the
                // same day number in the next month.
                const newSelectedDay = oldSelectedDay.clone();
                newSelectedDay.month += number;

                // Correct for accidental rollover into the next month.
                if ((newSelectedDay.month - number + 12) % 12 != oldSelectedDay.month) {
                    newSelectedDay.month -= 1;
                    newSelectedDay.day = newSelectedDay.endOfMonth.day;
                }

                this.selectedDay = newSelectedDay;
            } else {
                const date = cal.dtz.now();
                this.goToDay(date);
                this.selectedDay = date;
            }
        }

        // End calICalendarView Methods and Properties
    }

    MozXULElement.implementCustomInterface(CalendarMonthView, [Ci.calICalendarView]);

    customElements.define("calendar-month-view", CalendarMonthView);
}
