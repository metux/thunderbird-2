/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported taskDetailsView, sendMailToOrganizer, taskViewCopyLink */

/* import-globals-from ../../../mail/base/content/mailCore.js */
/* import-globals-from calendar-item-editing.js */
/* import-globals-from calendar-ui-utils.js */

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
var { recurrenceRule2String } = ChromeUtils.import("resource://calendar/modules/calRecurrenceUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

var taskDetailsView = {

    /**
     * Task Details Events
     *
     * XXXberend Please document this function, possibly also consolidate since
     * its the only function in taskDetailsView.
     */
    onSelect: function(event) {
        function displayElement(id, flag) {
            setBooleanAttribute(id, "hidden", !flag);
            return flag;
        }

        let dateFormatter = Cc["@mozilla.org/calendar/datetime-formatter;1"]
                              .getService(Ci.calIDateTimeFormatter);

        let item = document.getElementById("calendar-task-tree").currentTask;
        if (displayElement("calendar-task-details-container", item != null) &&
            displayElement("calendar-task-view-splitter", item != null)) {
            displayElement("calendar-task-details-title-row", true);
            document.getElementById("calendar-task-details-title").textContent =
                (item.title ? item.title.replace(/\n/g, " ") : "");

            let organizer = item.organizer;
            if (displayElement("calendar-task-details-organizer-row", organizer != null)) {
                let name = organizer.commonName;
                if (!name || name.length <= 0) {
                    if (organizer.id && organizer.id.length) {
                        name = organizer.id;
                        let re = new RegExp("^mailto:(.*)", "i");
                        let matches = re.exec(name);
                        if (matches) {
                            name = matches[1];
                        }
                    }
                }
                if (displayElement("calendar-task-details-organizer-row", name && name.length)) {
                    document.getElementById("calendar-task-details-organizer").value = name;
                }
            }

            let priority = 0;
            if (item.calendar.getProperty("capabilities.priority.supported")) {
                priority = parseInt(item.priority, 10);
            }
            displayElement("calendar-task-details-priority-label", priority > 0);
            displayElement("calendar-task-details-priority-low", priority >= 6 && priority <= 9);
            displayElement("calendar-task-details-priority-normal", priority == 5);
            displayElement("calendar-task-details-priority-high", priority >= 1 && priority <= 4);

            let status = item.getProperty("STATUS");
            if (displayElement("calendar-task-details-status-row", status && status.length > 0)) {
                let statusDetails = document.getElementById("calendar-task-details-status");
                switch (status) {
                    case "NEEDS-ACTION": {
                        statusDetails.value = cal.l10n.getCalString("taskDetailsStatusNeedsAction");
                        break;
                    }
                    case "IN-PROCESS": {
                        let percent = 0;
                        let property = item.getProperty("PERCENT-COMPLETE");
                        if (property != null) {
                            percent = parseInt(property, 10);
                        }
                        statusDetails.value = cal.l10n.getCalString(
                            "taskDetailsStatusInProgress", [percent]
                        );
                        break;
                    }
                    case "COMPLETED": {
                        if (item.completedDate) {
                            let completedDate = item.completedDate.getInTimezone(
                                                    cal.dtz.defaultTimezone);
                            statusDetails.value = cal.l10n.getCalString(
                                "taskDetailsStatusCompletedOn",
                                [dateFormatter.formatDateTime(completedDate)]
                            );
                        }
                        break;
                    }
                    case "CANCELLED": {
                        statusDetails.value = cal.l10n.getCalString("taskDetailsStatusCancelled");
                        break;
                    }
                    default: {
                        displayElement("calendar-task-details-status-row", false);
                        break;
                    }
                }
            }
            let categories = item.getCategories({});
            if (displayElement("calendar-task-details-category-row", categories.length > 0)) {
                document.getElementById("calendar-task-details-category").value = categories.join(", ");
            }
            document.getElementById("task-start-date").item = item;
            document.getElementById("task-due-date").item = item;

            let taskStartRowLabel = document.getElementById("task-start-row-label");
            let taskStartDate = item[cal.dtz.startDateProp(item)];
            taskStartRowLabel.style.visibility = taskStartDate ? "visible" : "collapse";

            let taskDueRowLabel = document.getElementById("task-due-row-label");
            let taskDueDate = item[cal.dtz.endDateProp(item)];
            taskDueRowLabel.style.visibility = taskDueDate ? "visible" : "collapse";

            let parentItem = item;
            if (parentItem.parentItem != parentItem) {
                // XXXdbo Didn't we want to get rid of these checks?
                parentItem = parentItem.parentItem;
            }
            let recurrenceInfo = parentItem.recurrenceInfo;
            let recurStart = parentItem.recurrenceStartDate;
            if (displayElement("calendar-task-details-repeat-row", recurrenceInfo && recurStart)) {
                let kDefaultTimezone = cal.dtz.defaultTimezone;
                let startDate = recurStart.getInTimezone(kDefaultTimezone);
                let endDate = item.dueDate ? item.dueDate.getInTimezone(kDefaultTimezone) : null;
                let detailsString = recurrenceRule2String(recurrenceInfo, startDate, endDate, startDate.isDate);
                if (detailsString) {
                    let rpv = document.getElementById("calendar-task-details-repeat");
                    rpv.value = detailsString.split("\n").join(" ");
                }
            }
            let textbox = document.getElementById("calendar-task-details-description");
            let description = item.hasProperty("DESCRIPTION") ? item.getProperty("DESCRIPTION") : null;
            textbox.value = description;
            textbox.readOnly = true;
            let attachmentRows = document.getElementById("calendar-task-details-attachment-rows");
            removeChildren(attachmentRows);
            let attachments = item.getAttachments({});
            if (displayElement("calendar-task-details-attachment-row", attachments.length > 0)) {
                displayElement("calendar-task-details-attachment-rows", true);
                for (let attachment of attachments) {
                    let url = attachment.calIAttachment.uri.spec;
                    let urlLabel = document.createXULElement("label");
                    urlLabel.setAttribute("class", "text-link");
                    urlLabel.setAttribute("value", url);
                    urlLabel.setAttribute("tooltiptext", url);
                    urlLabel.setAttribute("crop", "end");
                    urlLabel.setAttribute("onclick",
                                          "if (event.button != 2) launchBrowser(this.value);");
                    urlLabel.setAttribute("context", "taskview-link-context-menu");
                    attachmentRows.appendChild(urlLabel);
                }
            }
        }
    },

    loadCategories: function() {
        let categoryPopup = document.getElementById("task-actions-category-popup");
        let item = document.getElementById("calendar-task-tree").currentTask;

        let itemCategories = item.getCategories({});
        let categoryList = cal.category.fromPrefs();
        for (let cat of itemCategories) {
            if (!categoryList.includes(cat)) {
                categoryList.push(cat);
            }
        }
        cal.l10n.sortArrayByLocaleCollator(categoryList);

        let maxCount = item.calendar.getProperty("capabilities.categories.maxCount");

        while (categoryPopup.childElementCount > 2) {
            categoryPopup.lastElementChild.remove();
        }
        if (maxCount == 1) {
            let menuitem = document.createXULElement("menuitem");
            menuitem.setAttribute("class", "menuitem-iconic");
            menuitem.setAttribute("label", cal.l10n.getCalString("None"));
            menuitem.setAttribute("type", "radio");
            if (itemCategories.length === 0) {
                menuitem.setAttribute("checked", "true");
            }
            categoryPopup.appendChild(menuitem);
        }
        for (let cat of categoryList) {
            let menuitem = document.createXULElement("menuitem");
            menuitem.setAttribute("class", "menuitem-iconic calendar-category");
            menuitem.setAttribute("label", cat);
            menuitem.setAttribute("value", cat);
            menuitem.setAttribute("type", (maxCount === null || maxCount > 1) ? "checkbox" : "radio");
            if (itemCategories.includes(cat)) {
                menuitem.setAttribute("checked", "true");
            }
            categoryPopup.appendChild(menuitem);
        }
    },

    saveCategories: function(event) {
        let categoryPopup = document.getElementById("task-actions-category-popup");
        let item = document.getElementById("calendar-task-tree").currentTask;

        let oldCategories = item.getCategories({});
        let categories = Array.from(
            categoryPopup.querySelectorAll("menuitem.calendar-category[checked]"),
            menuitem => menuitem.value
        );
        let unchanged = oldCategories.length == categories.length;
        for (let i = 0; unchanged && i < categories.length; i++) {
            unchanged = oldCategories[i] == categories[i];
        }

        if (!unchanged) {
            let newItem = item.clone();
            newItem.setCategories(categories.length, categories);
            doTransaction("modify", newItem, newItem.calendar, item, null);
            return false;
        }

        return true;
    },

    categoryTextboxKeypress: function(event) {
        let category = event.target.value;
        let categoryPopup = document.getElementById("task-actions-category-popup");

        switch (event.key) {
            case " ": {
                // The menu popup seems to eat this keypress.
                let start = event.target.selectionStart;
                event.target.value =
                    category.substring(0, start) +
                    " " +
                    category.substring(event.target.selectionEnd);
                event.target.selectionStart = event.target.selectionEnd = start + 1;
                return;
            }
            case "Tab":
            case "ArrowDown":
            case "ArrowUp": {
                event.target.blur();
                event.preventDefault();

                let key = event.key == "ArrowUp" ? "ArrowUp" : "ArrowDown";
                categoryPopup.dispatchEvent(new KeyboardEvent("keydown", { key }));
                categoryPopup.dispatchEvent(new KeyboardEvent("keyup", { key }));
                return;
            }
            case "Escape":
                if (category) {
                    event.target.value = "";
                } else {
                    categoryPopup.hidePopup();
                }
                event.preventDefault();
                return;
            case "Enter":
                category = category.trim();
                if (category != "") {
                    break;
                }
                return;
            default: {
                return;
            }
        }

        event.preventDefault();

        let categoryList = categoryPopup.querySelectorAll("menuitem.calendar-category");
        let categories = Array.from(categoryList, cat => cat.getAttribute("value"));

        let modified = false;
        let newIndex = categories.indexOf(category);
        if (newIndex > -1) {
            if (categoryList[newIndex].getAttribute("checked") != "true") {
                categoryList[newIndex].setAttribute("checked", "true");
                modified = true;
            }
        } else {
            let localeCollator = cal.l10n.createLocaleCollator();
            let compare = localeCollator.compareString.bind(localeCollator, 0);
            newIndex = cal.data.binaryInsert(categories, category, compare, true);

            let item = document.getElementById("calendar-task-tree").currentTask;
            let maxCount = item.calendar.getProperty("capabilities.categories.maxCount");

            let menuitem = document.createXULElement("menuitem");
            menuitem.setAttribute("class", "menuitem-iconic calendar-category");
            menuitem.setAttribute("label", category);
            menuitem.setAttribute("value", category);
            menuitem.setAttribute("type", (maxCount === null || maxCount > 1) ? "checkbox" : "radio");
            menuitem.setAttribute("checked", true);
            categoryPopup.insertBefore(menuitem, categoryList[newIndex]);

            modified = true;
        }

        if (modified) {
            categoryList = categoryPopup.querySelectorAll("menuitem.calendar-category[checked]");
            categories = Array.from(categoryList, cat => cat.getAttribute("value"));

            let item = document.getElementById("calendar-task-tree").currentTask;
            let newItem = item.clone();
            newItem.setCategories(categories.length, categories);
            doTransaction("modify", newItem, newItem.calendar, item, null);
        }

        event.target.value = "";
    }
};


/**
 * Updates the currently applied filter for the task view and refreshes the task
 * tree.
 *
 * @param aFilter        The filter name to set.
 */
function taskViewUpdate(aFilter) {
    let tree = document.getElementById("calendar-task-tree");
    let broadcaster = document.getElementById("filterBroadcaster");
    let oldFilter = broadcaster.getAttribute("value");
    let filter = oldFilter;

    if (aFilter && !(aFilter instanceof Event)) {
        filter = aFilter;
    }

    if (filter && (filter != oldFilter)) {
        broadcaster.setAttribute("value", filter);
    }

    // update the filter
    tree.updateFilter(filter || "all");
}

/**
 * Prepares a dialog to send an email to the organizer of the currently selected
 * task in the task view.
 *
 * XXX We already have a function with this name in the event dialog. Either
 * consolidate or make name more clear.
 */
function sendMailToOrganizer() {
    let item = document.getElementById("calendar-task-tree").currentTask;
    if (item != null) {
        let organizer = item.organizer;
        let email = cal.email.getAttendeeEmail(organizer, true);
        let emailSubject = cal.l10n.getString("calendar-event-dialog", "emailSubjectReply", [item.title]);
        let identity = item.calendar.getProperty("imip.identity");
        cal.email.sendTo(email, emailSubject, null, identity);
    }
}

/**
 * Handler function to observe changing of the calendar display deck. Updates
 * the task tree if the task view was selected.
 *
 * TODO Consolidate this function and anything connected, its still from times
 * before we had view tabs.
 */
function taskViewObserveDisplayDeckChange(event) {
    let deck = event.target;

    // Bug 309505: The 'select' event also fires when we change the selected
    // panel of calendar-view-box.  Workaround with this check.
    if (deck.id != "calendarDisplayDeck") {
        return;
    }

    // In case we find that the task view has been made visible, we refresh the view.
    if (deck.selectedPanel && deck.selectedPanel.id == "calendar-task-box") {
        let taskFilterGroup = document.getElementById("task-tree-filtergroup");
        taskViewUpdate(taskFilterGroup.value || "all");
    }
}

// Install event listeners for the display deck change and connect task tree to filter field
function taskViewOnLoad() {
    let deck = document.getElementById("calendarDisplayDeck");
    let tree = document.getElementById("calendar-task-tree");

    if (deck && tree) {
        deck.addEventListener("select", taskViewObserveDisplayDeckChange, true);
        tree.textFilterField = "task-text-filter-field";

        // setup the platform-dependent placeholder for the text filter field
        let textFilter = document.getElementById("task-text-filter-field");
        if (textFilter) {
            let base = textFilter.getAttribute("emptytextbase");
            let keyLabel = textFilter.getAttribute(AppConstants.platform == "macosx" ?
                                                   "keyLabelMac" : "keyLabelNonMac");

            textFilter.setAttribute("placeholder", base.replace("#1", keyLabel));
            textFilter.value = "";
        }
    }

    // Setup customizeDone handler for the task action toolbox.
    let toolbox = document.getElementById("task-actions-toolbox");
    toolbox.customizeDone = function(aEvent) {
        MailToolboxCustomizeDone(aEvent, "CustomizeTaskActionsToolbar");
    };

    let toolbarset = document.getElementById("customToolbars");
    toolbox.toolbarset = toolbarset;

    Services.obs.notifyObservers(window, "calendar-taskview-startup-done");
}

/**
 * Copy the value of the given link node to the clipboard
 *
 * @param linkNode      The node containing the value to copy to the clipboard
 */
function taskViewCopyLink(linkNode) {
    if (linkNode) {
        let linkAddress = linkNode.value;
        let clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"]
                          .getService(Ci.nsIClipboardHelper);
        clipboard.copyString(linkAddress);
    }
}

window.addEventListener("load", taskViewOnLoad);
