/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement, setBooleanAttribute, getSummarizedStyleValues */

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

class MozCalendarDayLabel extends MozXULElement {
    static get observedAttributes() {
        return ["selected", "relation"];
    }

    connectedCallback() {
        if (this.delayConnectedCallback()) {
            return;
        }
        this.textContent = "";
        this.setAttribute("flex", "1");
        this.setAttribute("pack", "center");

        this.longWeekdayName = document.createXULElement("label");
        this.longWeekdayName.classList.add("calendar-day-label-name");

        this.shortWeekdayName = document.createXULElement("label");
        this.shortWeekdayName.classList.add("calendar-day-label-name");
        this.shortWeekdayName.setAttribute("hidden", "true");

        this.appendChild(this.longWeekdayName);
        this.appendChild(this.shortWeekdayName);

        this.mWeekday = -1;

        this.longWeekdayPixels = 0;

        this.mDate = null;

        this._updateAttributes();
    }

    attributeChangedCallback() {
        this._updateAttributes();
    }

    _updateAttributes() {
        if (!this.longWeekdayName || !this.shortWeekdayName) {
            return;
        }

        if (this.hasAttribute("selected")) {
            this.longWeekdayName.setAttribute("selected", this.getAttribute("selected"));
            this.shortWeekdayName.setAttribute("selected", this.getAttribute("selected"));
        } else {
            this.longWeekdayName.removeAttribute("selected");
            this.shortWeekdayName.removeAttribute("selected");
        }

        if (this.hasAttribute("relation")) {
            this.longWeekdayName.setAttribute("relation", this.getAttribute("relation"));
            this.shortWeekdayName.setAttribute("relation", this.getAttribute("relation"));
        } else {
            this.longWeekdayName.removeAttribute("relation");
            this.shortWeekdayName.removeAttribute("relation");
        }
    }

    set weekDay(val) {
        this.mWeekday = val % 7;
        this.longWeekdayName.value = cal.getDateFormatter().dayName(val);
        this.shortWeekdayName.value = cal.getDateFormatter().shortDayName(val);
        return this.mWeekday;
    }

    get weekDay() {
        return this.mWeekday;
    }

    set date(val) {
        this.mDate = val;
        let dateFormatter = cal.getDateFormatter();
        let label = cal.l10n.getCalString("dayHeaderLabel", [
            dateFormatter.shortDayName(val.weekday),
            dateFormatter.formatDateWithoutYear(val)
        ]);
        this.shortWeekdayName.setAttribute("value", label);
        label = cal.l10n.getCalString("dayHeaderLabel", [
            dateFormatter.dayName(val.weekday),
            dateFormatter.formatDateWithoutYear(val)
        ]);
        this.longWeekdayName.setAttribute("value", label);
        return val;
    }

    get date() {
        return this.mDate;
    }

    set shortWeekNames(val) {
        // cache before change, in case we are switching to short
        this.getLongWeekdayPixels();
        setBooleanAttribute(this.longWeekdayName, "hidden", val);
        setBooleanAttribute(this.shortWeekdayName, "hidden", !val);
        return val;
    }

    getLongWeekdayPixels() {
        // Only do this if the long weekdays are visible and we haven't already cached.
        let longNameWidth = this.longWeekdayName.getBoundingClientRect().width;

        if (longNameWidth == 0) {
            // weekdaypixels have not yet been laid out
            return 0;
        }

        this.longWeekdayPixels = longNameWidth +
            getSummarizedStyleValues(this.longWeekdayName, ["margin-left", "margin-right"]);
        this.longWeekdayPixels += getSummarizedStyleValues(this, [
            "border-left-width", "padding-left", "padding-right"
        ]);

        return this.longWeekdayPixels;
    }
}

customElements.define("calendar-day-label", MozCalendarDayLabel);
