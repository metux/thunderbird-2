/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calendar-common-sets.js */

/* globals MozXULElement CalendarTaskTreeView */

// Wrap in a block to prevent leaking to window scope.
{
    /**
     * An observer for the calendar event data source. This keeps the unifinder
     * display up to date when the calendar event data is changed.
     *
     * @implements {calIObserver}
     * @implements {calICompositeObserver}
     */
    class TaskTreeObserver {
        /**
         * Creates and connects the new observer to a CalendarTaskTree and sets up Query Interface.
         *
         * @param {CalendarTaskTree} taskTree    The tree to observe.
         */
        constructor(taskTree) {
            this.tree = taskTree;
            this.QueryInterface = cal.generateQI([Ci.calICompositeObserver, Ci.calIObserver]);
        }

        // calIObserver Methods

        onStartBatch() { }

        onEndBatch() { }

        onLoad() {
            this.tree.refresh();
        }

        onAddItem(item) {
            if (cal.item.isToDo(item)) {
                this.tree.mTreeView.addItems(this.tree.mFilter.getOccurrences(item));
            }
        }

        onModifyItem(newItem, oldItem) {
            if (cal.item.isToDo(newItem) || cal.item.isToDo(oldItem)) {
                this.tree.mTreeView.modifyItems(
                    this.tree.mFilter.getOccurrences(newItem),
                    this.tree.mFilter.getOccurrences(oldItem)
                );
                // We also need to notify potential listeners.
                let event = document.createEvent("Events");
                event.initEvent("select", true, false);
                this.tree.dispatchEvent(event);
            }
        }

        onDeleteItem(deletedItem) {
            if (cal.item.isToDo(deletedItem)) {
                this.tree.mTreeView.removeItems(
                    this.tree.mFilter.getOccurrences(deletedItem)
                );
            }
        }

        onError(calendar, errNo, message) { }

        onPropertyChanged(calendar, name, value, oldValue) {
            switch (name) {
                case "disabled":
                    if (value) {
                        this.tree.onCalendarRemoved(calendar);
                    } else {
                        this.tree.onCalendarAdded(calendar);
                    }
                    break;
            }
        }

        onPropertyDeleting(calendar, name) {
            this.onPropertyChanged(calendar, name, null, null);
        }

        // End calIObserver Methods
        // calICompositeObserver Methods

        onCalendarAdded(calendar) {
            if (!calendar.getProperty("disabled")) {
                this.tree.onCalendarAdded(calendar);
            }
        }

        onCalendarRemoved(calendar) {
            this.tree.onCalendarRemoved(calendar);
        }

        onDefaultCalendarChanged(newDefaultCalendar) { }

        // End calICompositeObserver Methods
    }

    /**
     * Custom element for table-style display of tasks (rows and columns).
     *
     * @extends {MozTree}
     */
    class CalendarTaskTree extends customElements.get("tree") {
        connectedCallback() {
            super.connectedCallback();
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            this.hasConnected = true;
            this.appendChild(MozXULElement.parseXULToFragment(`
                <treecols>
                  <treecol is="treecol-image" id="calendar-task-tree-col-completed"
                           class="calendar-task-tree-col-completed"
                           minwidth="19"
                           fixed="true"
                           cycler="true"
                           sortKey="completedDate"
                           itemproperty="completed"
                           label="&calendar.unifinder.tree.done.label;"
                           tooltiptext="&calendar.unifinder.tree.done.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="2"/>
                  <treecol is="treecol-image" id="calendar-task-tree-col-priority"
                           class="calendar-task-tree-col-priority"
                           minwidth="17"
                           fixed="true"
                           itemproperty="priority"
                           label="&calendar.unifinder.tree.priority.label;"
                           tooltiptext="&calendar.unifinder.tree.priority.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="4"/>
                  <treecol class="calendar-task-tree-col-title"
                           itemproperty="title"
                           flex="1"
                           label="&calendar.unifinder.tree.title.label;"
                           tooltiptext="&calendar.unifinder.tree.title.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="6"/>
                  <treecol class="calendar-task-tree-col-entrydate"
                           itemproperty="entryDate"
                           flex="1"
                           label="&calendar.unifinder.tree.startdate.label;"
                           tooltiptext="&calendar.unifinder.tree.startdate.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="8"/>
                  <treecol class="calendar-task-tree-col-duedate"
                           itemproperty="dueDate"
                           flex="1"
                           label="&calendar.unifinder.tree.duedate.label;"
                           tooltiptext="&calendar.unifinder.tree.duedate.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="10"/>
                  <treecol class="calendar-task-tree-col-duration"
                           itemproperty="duration"
                           sortKey="dueDate"
                           flex="1"
                           label="&calendar.unifinder.tree.duration.label;"
                           tooltiptext="&calendar.unifinder.tree.duration.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="12"/>
                  <treecol class="calendar-task-tree-col-completeddate"
                           itemproperty="completedDate"
                           flex="1"
                           label="&calendar.unifinder.tree.completeddate.label;"
                           tooltiptext="&calendar.unifinder.tree.completeddate.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="14"/>
                  <treecol class="calendar-task-tree-col-percentcomplete"
                           itemproperty="percentComplete"
                           flex="1"
                           minwidth="40"
                           label="&calendar.unifinder.tree.percentcomplete.label;"
                           tooltiptext="&calendar.unifinder.tree.percentcomplete.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="16"/>
                  <treecol class="calendar-task-tree-col-categories"
                           itemproperty="categories"
                           flex="1"
                           label="&calendar.unifinder.tree.categories.label;"
                           tooltiptext="&calendar.unifinder.tree.categories.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="18"/>
                  <treecol class="calendar-task-tree-col-location"
                           itemproperty="location"
                           flex="1"
                           label="&calendar.unifinder.tree.location.label;"
                           tooltiptext="&calendar.unifinder.tree.location.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="20"/>
                  <treecol class="calendar-task-tree-col-status"
                           itemproperty="status"
                           flex="1"
                           label="&calendar.unifinder.tree.status.label;"
                           tooltiptext="&calendar.unifinder.tree.status.tooltip2;"/>
                  <splitter class="tree-splitter" ordinal="22"/>
                  <treecol class="calendar-task-tree-col-calendar"
                           itemproperty="calendar"
                           flex="1"
                           label="&calendar.unifinder.tree.calendarname.label;"
                           tooltiptext="&calendar.unifinder.tree.calendarname.tooltip2;"/>
                </treecols>
                <treechildren class="calendar-task-treechildren"
                              tooltip="taskTreeTooltip"
                              ondblclick="mTreeView.onDoubleClick(event)"/>
                `,
                [
                    "chrome://calendar/locale/global.dtd",
                    "chrome://calendar/locale/calendar.dtd"
                ]
            ));

            this.classList.add("calendar-task-tree");
            // TODO: enableColumnDrag="false" does not seem to prevent dragging columns, remove?
            this.setAttribute("enableColumnDrag", "false");
            this.setAttribute("keepcurrentinview", "true");

            this.addEventListener("select", (event) => {
                this.mTreeView.onSelect(event);
                if (calendarController.todo_tasktree_focused) {
                    calendarController.onSelectionChanged({ detail: this.selectedTasks });
                }
            });

            this.addEventListener("focus", (event) => {
                this.updateFocus();
            });

            this.addEventListener("blur", (event) => {
                this.updateFocus();
            });

            this.addEventListener("keypress", (event) => {
                this.mTreeView.onKeyPress(event);
            });

            this.addEventListener("mousedown", (event) => {
                this.mTreeView.onMouseDown(event);
            });

            this.addEventListener("dragstart", (event) => {
                if (event.originalTarget.localName != "treechildren") {
                    // We should only drag treechildren, not for example the scrollbar.
                    return;
                }
                let item = this.mTreeView.getItemFromEvent(event);
                if (!item || item.calendar.readOnly) {
                    return;
                }
                invokeEventDragSession(item, event.target);
            });

            this.mTaskArray = [];
            this.mHash2Index = {};
            this.mPendingRefreshJobs = {};
            this.mShowCompletedTasks = true;
            this.mFilter = null;
            this.mStartDate = null;
            this.mEndDate = null;
            this.mDateRangeFilter = null;
            this.mTextFilterField = null;

            this.mTreeView = null;
            this.mTaskTreeObserver = new TaskTreeObserver(this);

            // Observes and responds to changes to calendar preferences.
            this.mPrefObserver = (subject, topic, prefName) => {
                switch (prefName) {
                    case "calendar.date.format":
                    case "calendar.timezone.local":
                        this.refresh();
                        break;
                }
            };

            // Set up the tree filter.
            this.mFilter = new calFilter();

            // This refresh call sets up the tree view and observers.
            this.refresh();

            // We want to make several attributes on the column
            // elements persistent, but unfortunately there's no
            // reliable way with the 'persist' feature.
            // That's why we need to store the necessary bits and
            // pieces on the calendar-task-tree element.
            let visibleColumns = this.getAttribute("visible-columns").split(" ");
            let ordinals = this.getAttribute("ordinals").split(" ");
            let widths = this.getAttribute("widths").split(" ");
            let sorted = this.getAttribute("sortActive");
            let sortDirection = this.getAttribute("sortDirection") || "ascending";

            this.querySelectorAll("treecol").forEach((col) => {
                const itemProperty = col.getAttribute("itemproperty");
                if (visibleColumns.some(visCol => visCol == itemProperty)) {
                    col.removeAttribute("hidden");
                } else {
                    col.setAttribute("hidden", "true");
                }
                if (ordinals && ordinals.length > 0) {
                    col.ordinal = Number(ordinals.shift());
                }
                if (widths && widths.length > 0) {
                    col.width = Number(widths.shift());
                }
                if (sorted && sorted == itemProperty) {
                    this.mTreeView.sortDirection = sortDirection;
                    this.mTreeView.selectedColumn = col;
                }
            });

            this.dispatchEvent(new CustomEvent("bindingattached", { bubbles: false }));
        }

        get currentTask() {
            const index = this.currentIndex;

            const isSelected = this.view && this.view.selection &&
                this.view.selection.isSelected(index);

            return isSelected ? this.mTaskArray[index] : null;
        }

        get selectedTasks() {
            let tasks = [];
            let start = {};
            let end = {};
            if (!this.mTreeView.selection) {
                return tasks;
            }

            const rangeCount = this.mTreeView.selection.getRangeCount();

            for (let range = 0; range < rangeCount; range++) {
                this.mTreeView.selection.getRangeAt(range, start, end);

                for (let i = start.value; i <= end.value; i++) {
                    let task = this.getTaskAtRow(i);
                    if (task) {
                        tasks.push(this.getTaskAtRow(i));
                    }
                }
            }
            return tasks;
        }

        set showCompleted(val) {
            this.mShowCompletedTasks = val;
        }

        get showCompleted() {
            return this.mShowCompletedTasks;
        }

        set textFilterField(val) {
            this.mTextFilterField = val;
        }

        get textFilterField() {
            return this.mTextFilterField;
        }

        /**
         * Calculates the text to display in the "Due In" column for the given task,
         * the amount of time between now and when the task is due.
         *
         * @param {Object} task    A task object.
         * @return {string}        A formatted string for the "Due In" column for the task.
         */
        duration(task) {
            const noValidDueDate = !(task && task.dueDate && task.dueDate.isValid);
            if (noValidDueDate) {
                return "";
            }

            const isCompleted = task.completedDate && task.completedDate.isValid;
            const dur = task.dueDate.subtractDate(cal.dtz.now());
            if (isCompleted && dur.isNegative) {
                return "";
            }

            const absSeconds = Math.abs(dur.inSeconds);
            const absMinutes = Math.ceil(absSeconds / 60);
            const prefix = dur.isNegative ? "-" : "";

            if (absMinutes >= 1440) {
                // 1 day or more.
                return prefix + PluralForm
                    .get(dur.days, cal.l10n.getCalString("dueInDays"))
                    .replace("#1", dur.days);
            } else if (absMinutes >= 60) {
                // 1 hour or more.
                return prefix + PluralForm
                    .get(dur.hours, cal.l10n.getCalString("dueInHours"))
                    .replace("#1", dur.hours);
            } else {
                // Less than one hour.
                return cal.l10n.getCalString("dueInLessThanOneHour");
            }
        }

        /**
         * Return the task object at a given row.
         *
         * @param {number} row        The index number identifying the row.
         * @return {Object | null}    A task object or null if none found.
         */
        getTaskAtRow(row) {
            return row > -1 ? this.mTaskArray[row] : null;
        }

        /**
         * Return the task object related to a given event.
         *
         * @param {Event} event        The event.
         * @return {Object | false}    The task object related to the event or false if none found.
         */
        getTaskFromEvent(event) {
            return this.mTreeView.getItemFromEvent(event);
        }

        refreshFromCalendar(calendar) {
            let refreshJob = {
                QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
                tree: this,
                calendar: null,
                items: null,
                operation: null,

                onOperationComplete(opCalendar, status, operationType, id, dateTime) {
                    if (opCalendar.id in this.tree.mPendingRefreshJobs) {
                        delete this.tree.mPendingRefreshJobs[opCalendar.id];
                    }

                    let oldItems = this.tree.mTaskArray.filter(item => item.calendar.id == opCalendar.id);
                    this.tree.mTreeView.modifyItems(this.items, oldItems);
                },

                onGetResult(opCalendar, status, itemType, detail, count, items) {
                    this.items = this.items.concat(items);
                },

                cancel() {
                    if (this.operation && this.operation.isPending) {
                        this.operation.cancel();
                        this.operation = null;
                        this.items = [];
                    }
                },

                execute() {
                    if (calendar.id in this.tree.mPendingRefreshJobs) {
                        this.tree.mPendingRefreshJobs[calendar.id].cancel();
                    }
                    this.calendar = calendar;
                    this.items = [];

                    let operation = this.tree.mFilter.getItems(calendar,
                        calendar.ITEM_FILTER_TYPE_TODO,
                        this);
                    if (operation && operation.isPending) {
                        this.operation = operation;
                        this.tree.mPendingRefreshJobs[calendar.id] = this;
                    }
                }
            };

            refreshJob.execute();
        }

        selectAll() {
            if (this.mTreeView.selection) {
                this.mTreeView.selection.selectAll();
            }
        }

        /**
         * Refreshes the display. Called during connectedCallback and by event observers.
         * Sets up the tree view, calendar event observer, and preference observer.
         */
        refresh() {
            let tree = this.closest(".calendar-task-tree");

            // Note: attempting to merge this.mTreeView and tree.view did not work.
            this.mTreeView = new CalendarTaskTreeView(tree);
            tree.view = this.mTreeView;

            cal.view.getCompositeCalendar(window).addObserver(this.mTaskTreeObserver);

            Services.prefs.getBranch("").addObserver("calendar.", this.mPrefObserver);

            const cals = cal.view.getCompositeCalendar(window).getCalendars({}) || [];
            const enabledCals = cals.filter(calendar => !calendar.getProperty("disabled"));

            enabledCals.forEach(calendar => this.refreshFromCalendar(calendar));
        }

        onCalendarAdded(calendar) {
            if (!calendar.getProperty("disabled")) {
                this.refreshFromCalendar(calendar);
            }
        }

        onCalendarRemoved(calendar) {
            const tasks = this.mTaskArray.filter(task => task.calendar.id == calendar.id);
            this.mTreeView.removeItems(tasks);
        }

        sortItems() {
            if (this.mTreeView.selectedColumn) {
                let column = this.mTreeView.selectedColumn;
                let modifier = this.mTreeView.sortDirection == "descending" ? -1 : 1;
                let sortKey = column.getAttribute("sortKey") || column.getAttribute("itemproperty");

                cal.unifinder.sortItems(this.mTaskArray, sortKey, modifier);
            }

            this.recreateHashTable();
        }

        recreateHashTable() {
            this.mHash2Index = this.mTaskArray.reduce((hash2Index, task, i) => {
                hash2Index[task.hashId] = i;
                return hash2Index;
            }, {});

            if (this.mTreeView.tree) {
                this.mTreeView.tree.invalidate();
            }
        }

        getInitialDate() {
            return currentView().selectedDay || cal.dtz.now();
        }

        doUpdateFilter(filter) {
            let needsRefresh = false;
            let oldStart = this.mFilter.mStartDate;
            let oldEnd = this.mFilter.mEndDate;
            let filterText = this.mFilter.filterText || "";

            if (filter) {
                let props = this.mFilter.filterProperties;
                this.mFilter.applyFilter(filter);
                needsRefresh = !props || !props.equals(this.mFilter.filterProperties);
            } else {
                this.mFilter.updateFilterDates();
            }

            if (this.mTextFilterField) {
                let field = document.getElementById(this.mTextFilterField);
                if (field) {
                    this.mFilter.filterText = field.value;
                    needsRefresh = needsRefresh ||
                        filterText.toLowerCase() != this.mFilter.filterText.toLowerCase();
                }
            }

            // We only need to refresh the tree if the filter properties or date range changed.
            const start = this.mFilter.startDate;
            const end = this.mFilter.mEndDate;

            const sameStartDates = start && oldStart && oldStart.compare(start) == 0;
            const sameEndDates = end && oldEnd && oldEnd.compare(end) == 0;

            if (needsRefresh ||
                ((start || oldStart) && !sameStartDates) ||
                ((end || oldEnd) && !sameEndDates)) {
                this.refresh();
            }
        }

        updateFilter(filter) {
            this.doUpdateFilter(filter);
        }

        updateFocus() {
            let menuOpen = false;

            // We need to consider the tree focused if the context menu is open.
            if (this.hasAttribute("context")) {
                let context = document.getElementById(this.getAttribute("context"));
                if (context && context.state) {
                    menuOpen = (context.state == "open") || (context.state == "showing");
                }
            }

            let focused = (document.activeElement == this) || menuOpen;

            calendarController.onSelectionChanged({ detail: focused ? this.selectedTasks : [] });
            calendarController.todo_tasktree_focused = focused;
        }

        disconnectedCallback() {
            super.disconnectedCallback();

            this.mTreeView = null;

            let widths = "";
            let ordinals = "";
            let visible = "";
            let sorted = this.mTreeView.selectedColumn;

            this.querySelectorAll("treecol").forEach((col) => {
                if (col.getAttribute("hidden") != "true") {
                    let content = col.getAttribute("itemproperty");
                    visible += visible.length > 0 ? " " + content : content;
                }
                if (ordinals.length > 0) {
                    ordinals += " ";
                }
                ordinals += col.ordinal;
                if (widths.length > 0) {
                    widths += " ";
                }
                widths += col.width || 0;
            });
            this.setAttribute("visible-columns", visible);
            this.setAttribute("ordinals", ordinals);
            this.setAttribute("widths", widths);
            if (sorted) {
                this.setAttribute("sort-active", sorted.getAttribute("itemproperty"));
                this.setAttribute("sort-direction", this.mTreeView.sortDirection);
            } else {
                this.removeAttribute("sort-active");
                this.removeAttribute("sort-direction");
            }
        }
    }

    customElements.define("calendar-task-tree", CalendarTaskTree, { "extends": "tree" });

    /**
     * Custom element for the task tree that appears in the todaypane.
     */
    class CalendarTaskTreeTodaypane extends CalendarTaskTree {
        getInitialDate() {
            return (agendaListbox.today && agendaListbox.today.start) || cal.dtz.now();
        }

        updateFilter(filter) {
            this.mFilter.selectedDate = this.getInitialDate();
            this.doUpdateFilter(filter);
        }
    }

    customElements.define("calendar-task-tree-todaypane",
        CalendarTaskTreeTodaypane, { "extends": "tree" });
}
