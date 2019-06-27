/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals cal currentView MozElements MozXULElement Services toggleOrientation */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
    /**
     * Calendar observer for calendar view elements. Used in CalendarBaseView class.
     *
     * @implements {calIObserver}
     * @implements {calICompositeObserver}
     * @implements {calIAlarmServiceObserver}
     */
    class CalendarViewObserver {
        /**
         * Constructor for CalendarViewObserver.
         *
         * @param {CalendarBaseView} calendarView    A calendar view.
         */
        constructor(calendarView) {
            this.QueryInterface = cal.generateQI([
                Ci.calIObserver,
                Ci.calIAlarmServiceObserver,
                Ci.calICompositeObserver
            ]);

            this.calView = calendarView.calICalendarView;
        }

        // calIObserver

        onStartBatch() {}
        onEndBatch() {}

        onLoad() {
            this.calView.refresh();
        }

        onAddItem(item) {
            if (cal.item.isToDo(item)) {
                if ((!item.entryDate && !item.dueDate) ||
                    !this.calView.mTasksInView ||
                    (item.isCompleted && !this.calView.mShowCompleted)) {
                    return;
                }
            }

            const occs = item.getOccurrencesBetween(this.calView.startDate,
                this.calView.queryEndDate, {});
            for (const occ of occs) {
                if (cal.item.isToDo(occ)) {
                    this.calView.doAddItem(occ.QueryInterface(Ci.calITodo));
                } else {
                    this.calView.doAddItem(occ.QueryInterface(Ci.calIEvent));
                }
            }
        }

        onModifyItem(newItem, oldItem) {
            if (cal.item.isToDo(newItem) && cal.item.isToDo(oldItem) &&
                !this.calView.mTasksInView) {
                return;
            }
            if (!cal.item.isToDo(oldItem) || oldItem.entryDate || oldItem.dueDate) {
                let occs = oldItem.getOccurrencesBetween(this.calView.startDate,
                    this.calView.queryEndDate, {});
                for (const occ of occs) {
                    if (cal.item.isToDo(occ)) {
                        this.calView.doDeleteItem(occ.QueryInterface(Ci.calITodo));
                    } else {
                        this.calView.doDeleteItem(occ.QueryInterface(Ci.calIEvent));
                    }
                }
            }
            if (cal.item.isToDo(newItem)) {
                if ((!newItem.entryDate && !newItem.dueDate) || !this.calView.mTasksInView) {
                    return;
                }
                if (newItem.isCompleted && !this.calView.mShowCompleted) {
                    return;
                }
            }

            let occs = newItem.getOccurrencesBetween(this.calView.startDate,
                this.calView.queryEndDate, {});
            for (const occ of occs) {
                if (cal.item.isToDo(occ)) {
                    this.calView.doAddItem(occ.QueryInterface(Ci.calITodo));
                } else {
                    this.calView.doAddItem(occ.QueryInterface(Ci.calIEvent));
                }
            }
        }

        onDeleteItem(item) {
            if (cal.item.isToDo(item)) {
                if (!this.calView.mTasksInView) {
                    return;
                }
                if (!item.entryDate && !item.dueDate) {
                    return;
                }
                if (item.isCompleted && !this.calView.mShowCompleted) {
                    return;
                }
            }

            const occs = item.getOccurrencesBetween(this.calView.startDate,
                this.calView.queryEndDate, {});
            for (const occ of occs) {
                if (cal.item.isToDo(occ)) {
                    this.calView.doDeleteItem(occ.QueryInterface(Ci.calITodo));
                } else {
                    this.calView.doDeleteItem(occ.QueryInterface(Ci.calIEvent));
                }
            }
        }

        onError(calendar, errNo, message) {}

        onPropertyChanged(calendar, name, value, oldValue) {
            switch (name) {
                case "suppressAlarms":
                    if (!Services.prefs.getBoolPref("calendar.alarms.indicator.show", true) ||
                        calendar.getProperty("capabilities.alarms.popup.supported") === false) {
                        break;
                    }
                // Else fall through.
                case "readOnly":
                case "disabled":
                    // XXXvv We can be smarter about how we handle this stuff.
                    this.calView.refresh();
                    break;
            }
        }

        onPropertyDeleting(calendar, name) {
            // Values are not important here yet.
            this.onPropertyChanged(calendar, name, null, null);
        }

        // End calIObserver
        // calIAlarmServiceObserver

        onAlarm(alarmItem) {
            this.calView.flashAlarm(alarmItem, false);
        }

        onRemoveAlarmsByItem(item) {
            // Stop the flashing for the item.
            this.calView.flashAlarm(item, true);
        }

        onRemoveAlarmsByCalendar(calendar) {
            // Stop the flashing for all items of this calendar.
            for (const key in this.calView.mFlashingEvents) {
                const item = this.calView.mFlashingEvents[key];
                if (item.calendar.id == calendar.id) {
                    this.calView.flashAlarm(item, true);
                }
            }
        }

        onAlarmsLoaded(calendar) {}

        // End calIAlarmServiceObserver
        // calICompositeObserver
        // XXXvv We can be smarter about how we handle this stuff.

        onCalendarAdded(calendar) {
            if (!calendar.getProperty("disabled")) {
                this.calView.addItemsFromCalendar(calendar);
            }
        }

        onCalendarRemoved(calendar) {
            if (!calendar.getProperty("disabled")) {
                this.calView.deleteItemsFromCalendar(calendar);
            }
        }

        onDefaultCalendarChanged(newDefaultCalendar) {
            // We don't care, for now.
        }

        // End calICompositeObserver
    }

    /**
     * Class for a refresh job object that is used in CalendarBaseView.addItemsFromCalendar.
     */
    class CalendarViewRefreshJob {
        /**
         * Constructor for CalendarViewRefreshJob.
         *
         * @param {CalendarBaseView} calendarView                   A calendar view.
         * @param {calICalendar|calICompositeCalendar} calendar     A calendar object.
         */
        constructor(calendarView, calendar) {
            this.QueryInterface = ChromeUtils.generateQI([Ci.calIOperationListener]);
            this.calView = calendarView;
            this.calendar = calendar;
            this.calId = null;
            this.operation = null;
            this.cancelled = false;
        }

        onOperationComplete(opCalendar, status, operationType, id, dateTime) {
            this.calView.mLog.info("Refresh complete of calendar " + this.calId);
            if (this.calView.mPendingRefreshJobs.has(this.calId)) {
                this.calView.mPendingRefreshJobs.delete(this.calId);
            }

            if (!this.cancelled) {
                this.calView.fireEvent("viewloaded", operationType);
            }
        }

        onGetResult(opCalendar, status, itemType, detail, count, items) {
            if (this.cancelled || !Components.isSuccessCode(status)) {
                return;
            }

            for (const item of items) {
                if (!cal.item.isToDo(item) || item.entryDate || item.dueDate) {
                    this.calView.doAddItem(item);
                }
            }
        }

        cancel() {
            this.calView.mLog.info("Refresh cancelled for calendar " + this.calId);
            this.cancelled = true;
            const operation = cal.wrapInstance(this.operation, Ci.calIOperation);
            if (operation && operation.isPending) {
                operation.cancel();
                this.operation = null;
            }
        }

        execute() {
            if (!this.calView.startDate || !this.calView.endDate || !this.calendar) {
                return;
            }

            if (this.calendar.type == "composite") {
                // We're refreshing from the composite calendar, so we can cancel
                // all other pending refresh jobs.
                this.calView.mLog.info("Refreshing composite calendar, cancelling all pending refreshes");
                this.calId = "composite";
                for (const job of this.calView.mPendingRefreshJobs.values()) {
                    job.cancel();
                }
                this.calView.mPendingRefreshJobs.clear();
                this.calView.relayout();
            } else {
                this.calId = this.calendar.id;
                if (this.calView.mPendingRefreshJobs.has(this.calId)) {
                    this.calView.mPendingRefreshJobs.get(this.calId).cancel();
                    this.calView.mPendingRefreshJobs.delete(this.calId);
                }
            }

            // Start our items query. For a disjoint date range we get all the items,
            // and just filter out the ones we don't care about in addItem.
            let filter = this.calendar.ITEM_FILTER_CLASS_OCCURRENCES;
            if (this.calView.mShowCompleted) {
                filter |= this.calendar.ITEM_FILTER_COMPLETED_ALL;
            } else {
                filter |= this.calendar.ITEM_FILTER_COMPLETED_NO;
            }

            if (this.calView.mTasksInView) {
                filter |= this.calendar.ITEM_FILTER_TYPE_ALL;
            } else {
                filter |= this.calendar.ITEM_FILTER_TYPE_EVENT;
            }

            let operation = this.calendar.getItems(filter,
                0,
                this.calView.startDate,
                this.calView.queryEndDate,
                this);

            operation = cal.wrapInstance(operation, Ci.calIOperation);
            if (operation && operation.isPending) {
                this.operation = operation;
                this.calView.mPendingRefreshJobs.set(this.calId, this);
            }
        }
    }


    /**
     * Abstract base class for calendar view elements (day, week, multiweek, month).
     *
     * @implements {calICalendarView}
     * @abstract
     */
    class CalendarBaseView extends MozXULElement {
        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            this.hasConnected = true;

            this.calICalendarView = this.getCustomInterfaceCallback(Ci.calICalendarView);

            this.addEventListener("move", (event) => {
                this.moveView(event.detail);
            });

            this.addEventListener("keypress", (event) => {
                switch (event.key) {
                    case "PageUp":
                        this.moveView(-1);
                        break;
                    case "PageDown":
                        this.moveView(1);
                        break;
                }
            });

            this.addEventListener("wheel", (event) => {
                const pixelThreshold = 150;

                if (event.shiftKey &&
                    Services.prefs.getBoolPref("calendar.view.mousescroll", true)) {
                    let deltaView = 0;
                    if (event.deltaMode == event.DOM_DELTA_LINE) {
                        if (event.deltaY != 0) {
                            deltaView = event.deltaY < 0 ? -1 : 1;
                        }
                    } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
                        this.mPixelScrollDelta += event.deltaY;
                        if (this.mPixelScrollDelta > pixelThreshold) {
                            deltaView = 1;
                            this.mPixelScrollDelta = 0;
                        } else if (this.mPixelScrollDelta < -pixelThreshold) {
                            deltaView = -1;
                            this.mPixelScrollDelta = 0;
                        }
                    }

                    if (deltaView != 0) {
                        this.moveView(deltaView);
                    }
                }

                event.preventDefault();
            });

            this.addEventListener("MozRotateGesture", (event) => {
                // Threshold for the minimum and maximum angle we should accept
                // rotation for. 90 degrees minimum is most logical, but 45 degrees
                // allows you to rotate with one hand.
                const MIN_ROTATE_ANGLE = 45;
                const MAX_ROTATE_ANGLE = 180;

                const absval = Math.abs(event.delta);
                if (this.supportsRotation &&
                    absval >= MIN_ROTATE_ANGLE &&
                    absval < MAX_ROTATE_ANGLE) {
                    toggleOrientation();
                    event.preventDefault();
                }
            });

            this.addEventListener("MozMagnifyGestureStart", (event) => {
                this.mMagnifyAmount = 0;
            });

            this.addEventListener("MozMagnifyGestureUpdate", (event) => {
                // Threshold as to how much magnification causes the zoom to happen.
                const THRESHOLD = 30;

                if (this.supportsZoom) {
                    this.mMagnifyAmount += event.delta;

                    if (this.mMagnifyAmount > THRESHOLD) {
                        this.zoomOut();
                        this.mMagnifyAmount = 0;
                    } else if (this.mMagnifyAmount < -THRESHOLD) {
                        this.zoomIn();
                        this.mMagnifyAmount = 0;
                    }
                    event.preventDefault();
                }
            });

            this.addEventListener("MozSwipeGesture", (event) => {
                if ((event.direction == SimpleGestureEvent.DIRECTION_UP && !this.rotated) ||
                    (event.direction == SimpleGestureEvent.DIRECTION_LEFT && this.rotated)) {
                    this.moveView(-1);
                } else if ((event.direction == SimpleGestureEvent.DIRECTION_DOWN && !this.rotated) ||
                    (event.direction == SimpleGestureEvent.DIRECTION_RIGHT && this.rotated)) {
                    this.moveView(1);
                }
            });

            this.mWeekStartOffset = 0;

            this.mRangeStartDate = null;
            this.mRangeEndDate = null;

            this.mWorkdaysOnly = false;
            this.mPendingRefreshJobs = null;

            this.mCalendar = null;
            this.mController = null;

            this.mStartDate = null;
            this.mEndDate = null;

            this.mTasksInView = false;
            this.mShowCompleted = false;

            this.mDisplayDaysOff = true;
            this.mDaysOffArray = [0, 6];

            this.mTimezone = null;
            this.mFlashingEvents = null;

            this.mSelectedItems = [];
            this.mLongWeekdayTotalPixels = -1;

            this.mResizeHandler = null;
            this.mDropShadowsLength = null;

            this.mShadowOffset = null;
            this.mDropShadows = null;

            this.mMagnifyAmount = 0;
            this.mPixelScrollDelta = 0;

            this.mViewStart = null;
            this.mViewEnd = null;

            this.mToggleStatus = 0;
            this.mLog = null;

            this.mToggleStatusFlag = {
                WorkdaysOnly: 1,
                TasksInView: 2,
                ShowCompleted: 4,
            };

            this.mTimezoneObserver = {
                observe: () => {
                    this.timezone = cal.dtz.defaultTimezone;
                    this.refreshView();

                    if (this.updateTimeIndicatorPosition) {
                        this.updateTimeIndicatorPosition(true);
                    }
                }
            };

            this.mPrefObserver = {
                calView: this.calICalendarView,

                observe(subj, topic, pref) {
                    this.calView.handlePreference(subj, topic, pref);
                }
            };

            this.mObserver = new CalendarViewObserver(this);

            const isChecked = id => document.getElementById(id).getAttribute("checked") == "true";

            this.workdaysOnly = isChecked("calendar_toggle_workdays_only_command");
            this.tasksInView = isChecked("calendar_toggle_tasks_in_view_command");
            this.rotated = isChecked("calendar_toggle_orientation_command");
            this.showCompleted = isChecked("calendar_toggle_show_completed_in_view_command");

            this.mTimezone = cal.dtz.defaultTimezone;
            const alarmService = Cc["@mozilla.org/calendar/alarm-service;1"]
                .getService(Ci.calIAlarmService);

            alarmService.addObserver(this.mObserver);

            this.setAttribute("type", this.type);
            this.mResizeHandler = () => {
                this.onResize(this);
            };
            document.getElementById("calendarviewBroadcaster").addEventListener(
                this.getAttribute("type") + "viewresized",
                this.mResizeHandler, true
            );

            // Add a preference observer to monitor changes.
            Services.prefs.addObserver("calendar.", this.mPrefObserver);
            Services.obs.addObserver(this.mTimezoneObserver, "defaultTimezoneChanged");

            this.weekStartOffset = Services.prefs.getIntPref("calendar.week.start", 0);
            this.updateDaysOffPrefs();
            this.mPendingRefreshJobs = new Map();

            const { Log4Moz } = ChromeUtils.import("resource:///modules/gloda/log4moz.js");
            this.mLog = Log4Moz.getConfiguredLogger("calBaseView");
            this.mFlashingEvents = {};

            // Remove observers and listeners on window unload.
            window.addEventListener("unload", () => {
                if (this.mCalendar) {
                    this.mCalendar.removeObserver(this.mObserver);
                }

                alarmService.removeObserver(this.mObserver);

                document.getElementById("calendarviewBroadcaster").removeEventListener(
                    this.getAttribute("type") + "viewresized",
                    this.mResizeHandler,
                    true);

                Services.prefs.removeObserver("calendar.", this.mPrefObserver);
                Services.obs.removeObserver(this.mTimezoneObserver, "defaultTimezoneChanged");
            }, { once: true });
        }

        get type() {
            const typelist = this.id.split("-");
            return typelist[0];
        }

        get labeldaybox() {
            return this.querySelector(".labeldaybox");
        }

        set rotated(rotated) {
            return (this.orient = (rotated ? "horizontal" : "vertical"));
        }

        get rotated() {
            return (this.orient == "horizontal");
        }

        get supportsRotation() {
            return false;
        }

        set displayDaysOff(displayDaysOff) {
            return (this.mDisplayDaysOff = displayDaysOff);
        }

        get displayDaysOff() {
            return this.mDisplayDaysOff;
        }

        set controller(controller) {
            return (this.mController = controller);
        }

        get controller() {
            return this.mController;
        }

        set daysOffArray(daysOffArray) {
            return (this.mDaysOffArray = daysOffArray);
        }

        get daysOffArray() {
            return this.mDaysOffArray;
        }

        set tasksInView(tasksInView) {
            return (this.mTasksInView = tasksInView);
        }

        get tasksInView() {
            return this.mTasksInView;
        }

        set showCompleted(showCompleted) {
            return (this.mShowCompleted = showCompleted);
        }

        get showCompleted() {
            return this.mShowCompleted;
        }

        set timezone(timezone) {
            return (this.mTimezone = timezone);
        }

        get timezone() {
            return this.mTimezone;
        }

        set workdaysOnly(workdaysOnly) {
            return (this.mWorkdaysOnly = workdaysOnly);
        }

        get workdaysOnly() {
            return this.mWorkdaysOnly;
        }

        get supportsWorkdaysOnly() {
            return true;
        }

        get supportsZoom() {
            return false;
        }

        get selectionObserver() {
            return this.mSelectionObserver;
        }

        get startDay() {
            return this.startDate;
        }

        get endDay() {
            return this.endDate;
        }

        get supportDisjointDates() {
            return false;
        }

        get hasDisjointDates() {
            return false;
        }

        set rangeStartDate(startDate) {
            return (this.mRangeStartDate = startDate);
        }

        get rangeStartDate() {
            return this.mRangeStartDate;
        }

        set rangeEndDate(endDate) {
            return (this.mRangeEndDate = endDate);
        }

        get rangeEndDate() {
            return this.mRangeEndDate;
        }

        get observerID() {
            return "base-view-observer";
        }

        set weekStartOffset(offset) {
            this.mWeekStartOffset = offset;
            return offset;
        }

        get weekStartOffset() {
            return this.mWeekStartOffset;
        }

        set displayCalendar(calendar) {
            if (this.mCalendar) {
                this.mCalendar.removeObserver(this.mObserver);
            }
            this.mCalendar = calendar;
            this.mCalendar.addObserver(this.mObserver);
            this.refresh();
            return calendar;
        }

        get displayCalendar() {
            return this.mCalendar;
        }

        get initialized() {
            let retval;

            // Some views throw when accessing an uninitialized startDay.
            try {
                retval = this.displayCalendar && this.startDay && this.endDay;
            } catch (ex) {
                return false;
            }
            return retval;
        }

        // The end date that should be used for getItems and similar queries.
        get queryEndDate() {
            if (!this.endDate) {
                return null;
            }
            const end = this.endDate.clone();
            end.day += 1;
            end.isDate = true;
            return end;
        }

        /**
         * Guarantee that the labels are clipped when an overflow occurs, to
         * prevent horizontal scrollbars from appearing briefly.
         *
         * @param {boolean} forceShortName  Whether to force the use of a short name.
         */
        adjustWeekdayLength(forceShortName) {
            const labelDayBoxKids = this.labeldaybox.childNodes;
            let useShortNames = false;

            if (!labelDayBoxKids || !labelDayBoxKids[0] || forceShortName === true) {
                useShortNames = true;
            } else {
                const clientWidth = this.querySelector(".mainbox").clientWidth;
                const timespacer = this.querySelector(".headertimespacer");

                const width = timespacer
                    ? clientWidth - timespacer.clientWidth
                    : clientWidth;

                if (this.longWeekdayTotalPixels > 0.95 * width) {
                    useShortNames = true;
                }
            }

            for (const kid of labelDayBoxKids) {
                kid.shortWeekNames = useShortNames;
            }
        }

        /**
         * The width in pixels of the widest weekday label.
         *
         * @return {number}  A number of pixels.
         */
        get longWeekdayTotalPixels() {
            if (this.mLongWeekdayTotalPixels <= 0) {
                let maxDayWidth = 0;

                for (const label of this.labeldaybox.childNodes) {
                    if (label.localName == "calendar-day-label") {
                        label.shortWeekNames = false;
                        const curPixelLength = label.getLongWeekdayPixels();
                        maxDayWidth = Math.max(maxDayWidth, curPixelLength);
                    }
                }
                if (maxDayWidth > 0) {
                    this.mLongWeekdayTotalPixels = (maxDayWidth * this.labeldaybox.childNodes.length) + 10;
                }
            }
            return this.mLongWeekdayTotalPixels;
        }

        /**
         * Return a date object representing the current day.
         *
         * @return {calIDateTime}    A date object.
         */
        today() {
            const date = cal.dtz.jsDateToDateTime(new Date()).getInTimezone(this.mTimezone);
            date.isDate = true;
            return date;
        }

        /**
         * Return whether this view is currently active and visible in the UI.
         *
         * @return {boolean}
         */
        isVisible() {
            return this.nodeName == currentView().nodeName;
        }

        /**
         * Refresh the view if it is active and visible, or if refresh is forced.
         *
         * @param {boolean} [force]    Whether to force a refresh.
         */
        refresh(force) {
            if (this.isVisible() || force) {
                this.addItemsFromCalendar(this.mCalendar);
            }
        }

        /**
         * Force the view to refresh, even if it is not visible.
         * This method is needed because when only a preference is toggled, the start
         * and end date of the views are unchanged, therefore the inactive/invisible views
         * may remain the same when switching to them.
         */
        forceRefresh() {
            this.refresh(true);
        }

        /**
         * Add items from a calendar to the view. Also used for refreshing the view.
         *
         * @param {calICalendar|calICompositeCalendar} calendar    A calendar object.
         */
        addItemsFromCalendar(calendar) {
            const refreshJob = new CalendarViewRefreshJob(this, calendar);
            refreshJob.execute();
        }

        /**
         * Delete items from a calendar. Must be implemented in subclasses.
         *
         * @param {calICalendar|calICompositeCalendar} calendar    A calendar object.
         */
        deleteItemsFromCalendar(calendar) {
            throw Cr.NS_ERROR_NOT_IMPLEMENTED;
        }

        /**
         * Create and fire an event.
         *
         * @param {string} eventName      Name of the event.
         * @param {Object} eventDetail    The details to add to the event.
         */
        fireEvent(eventName, eventDetail) {
            this.dispatchEvent(new CustomEvent(eventName,
                { bubbles: true, cancelable: false, detail: eventDetail }));
        }

        /**
         * A preference handler typically called by a preferences observer when a preference
         * changes. Handles common preferences while other preferences are handled in subclasses.
         *
         * @param {Object} subject       A subject, a prefs object.
         * @param {string} topic         A topic.
         * @param {string} preference    A preference that has changed.
         */
        handleCommonPreference(subject, topic, preference) {
            // Refresh view if categories seem to have changed.
            if (preference.startsWith("calendar.category.color")) {
                this.refreshView();
                return;
            }
            switch (preference) {
                case "calendar.week.d0sundaysoff":
                case "calendar.week.d1mondaysoff":
                case "calendar.week.d2tuesdaysoff":
                case "calendar.week.d3wednesdaysoff":
                case "calendar.week.d4thursdaysoff":
                case "calendar.week.d5fridaysoff":
                case "calendar.week.d6saturdaysoff":
                    this.updateDaysOffPrefs();
                    break;
                case "calendar.alarms.indicator.show":
                    // Break here to ensure the view is refreshed.
                    break;
                case "calendar.week.start":
                    this.weekStartOffset = subject.getIntPref(preference);
                    break;
                case "calendar.date.format":
                case "calendar.view.showLocation":
                    this.refreshView();
                    break;
                default:
                    return;
            }
            this.refreshView();
        }

        /**
         * Check preferences and update which days are days off.
         */
        updateDaysOffPrefs() {
            const prefix = "calendar.week.";
            const daysOffPrefs = [
                [0, "d0sundaysoff", "true"],
                [1, "d1mondaysoff", "false"],
                [2, "d2tuesdaysoff", "false"],
                [3, "d3wednesdaysoff", "false"],
                [4, "d4thursdaysoff", "false"],
                [5, "d5fridaysoff", "false"],
                [6, "d6saturdaysoff", "true"]
            ];
            const filterDaysOff = ([number, name, defaultValue]) =>
                Services.prefs.getBoolPref(prefix + name, defaultValue);

            this.daysOffArray = daysOffPrefs.filter(filterDaysOff).map(pref => pref[0]);
        }

        /**
         * Refresh the view.
         */
        refreshView() {
            if (!this.startDay || !this.endDay) {
                // Don't refresh if we're not initialized.
                return;
            }
            this.goToDay(this.selectedDay);
            this.forceRefresh();
        }

        handlePreference(subject, topic, pref) {
            // Do nothing by default.
        }

        flashAlarm(alarmItem, stop) {
            // Do nothing by default.
        }

        // calICalendarView Methods

        goToDay(date) {
            this.showDate(date);
        }

        getRangeDescription() {
            return cal.getDateFormatter().formatInterval(this.rangeStartDate, this.rangeEndDate);
        }

        removeDropShadows() {
            const dropbox = document.getAnonymousElementByAttribute(this, "dropbox", "true");
            if (dropbox) {
                dropbox.setAttribute("dropbox", "false");
            }
        }

        setDateRange(startDate, endDate) {
            cal.navigationBar.setDateRange(startDate, endDate);
        }

        getSelectedItems(count) {
            count.value = this.mSelectedItems.length;
            return this.mSelectedItems;
        }

        setSelectedItems(count, items) {
            this.mSelectedItems = items.concat([]);
            return this.mSelectedItems;
        }

        getDateList(count, dates) {
            const start = this.startDate.clone();
            const dateList = [];
            while (start.compare(this.endDate) <= 0) {
                dateList.push(start);
                start.day++;
            }
            count.value = dateList.length;
            return dateList;
        }

        zoomIn(level) {}

        zoomOut(level) {}

        zoomReset() {}

        // End calICalendarView Methods
    }

    MozXULElement.implementCustomInterface(CalendarBaseView, [Ci.calICalendarView]);

    MozElements.CalendarBaseView = CalendarBaseView;
}
