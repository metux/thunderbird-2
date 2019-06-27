/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/*
 * Localization and locale functions
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.l10n namespace.

this.EXPORTED_SYMBOLS = ["call10n"]; /* exported call10n */

/**
 * Gets the value of a string in a .properties file.
 *
 * @param {String} aComponent       Stringbundle component name
 * @param {String} aBundleName      The name of the properties file
 * @param {String} aStringName      The name of the string within the properties file
 * @param {String[]} aParams        (optional) Parameters to format the string
 * @return {String}                 The formatted string
 */
function _getString(aComponent, aBundleName, aStringName, aParams=[]) {
    let propName = `chrome://${aComponent}/locale/${aBundleName}.properties`;

    try {
        if (!(propName in _getString._bundleCache)) {
            _getString._bundleCache[propName] = Services.strings.createBundle(propName);
        }
        let props = _getString._bundleCache[propName];

        if (aParams && aParams.length) {
            return props.formatStringFromName(aStringName, aParams, aParams.length);
        } else {
            return props.GetStringFromName(aStringName);
        }
    } catch (ex) {
        let msg = `Failed to read '${aStringName}' from ${propName}.`;
        Cu.reportError(`${msg} Error: ${ex}`);
        return aStringName;
    }
}
_getString._bundleCache = {};

/**
 * Provides locale dependent parameters for displaying calendar views
 *
 * @param {String}  aLocale      The locale to get the info for, e.g. "en-US",
 *                                 "de-DE" or null for the current locale
 * @param {Bollean} aResetCache  Whether to reset the internal cache - for test
 *                                 purposes only don't use it otherwise atm
 * @return {Object}              The getCalendarInfo object from mozIMozIntl
 */
function _calendarInfo(aLocale=null, aResetCache=false) {
    if (aResetCache) {
        _calendarInfo._startup = {};
    }
    // we cache the result to prevent updates at runtime except for test
    // purposes since changing intl.regional_prefs.use_os_locales preference
    // would provide different result when called without aLocale and we
    // need to investigate whether this is wanted or chaching more selctively.
    // when starting to use it to deteremine the first week of a year, we would
    // need to at least reset that cached properties on pref change.
    if (!("firstDayOfWeek" in _calendarInfo._startup) || aLocale) {
        let info = Services.intl.getCalendarInfo(aLocale);
        if (aLocale) {
            return info;
        }
        _calendarInfo._startup = info;
    }
    return _calendarInfo._startup;
}
_calendarInfo._startup = {};

var call10n = {
    /**
     * Gets the value of a string in a .properties file.
     *
     * @param {String} aComponent       Stringbundle component name
     * @param {String} aBundleName      The name of the properties file
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getAnyString: _getString,

    /**
     * Gets a string from a bundle from chrome://calendar/
     *
     * @param {String} aBundleName      The name of the properties file
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getString: _getString.bind(undefined, "calendar"),

    /**
     * Gets a string from chrome://calendar/locale/calendar.properties bundle
     *
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getCalString: _getString.bind(undefined, "calendar", "calendar"),

    /**
     * Gets a string from chrome://lightning/locale/lightning.properties
     *
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getLtnString: _getString.bind(undefined, "lightning", "lightning"),

    /**
     * Gets a date format string from chrome://calendar/locale/dateFormat.properties bundle
     *
     * @param {String} aStringName      The name of the string within the properties file
     * @param {String[]} aParams        (optional) Parameters to format the string
     * @return {String}                 The formatted string
     */
    getDateFmtString: _getString.bind(undefined, "calendar", "dateFormat"),

    /**
     * Gets the month name string in the right form depending on a base string.
     *
     * @param {Number} aMonthNum     The month number to get, 1-based.
     * @param {String} aBundleName   The Bundle to get the string from
     * @param {String} aStringBase   The base string name, .monthFormat will be appended
     * @return {String}              The formatted month name
     */
    formatMonth: function(aMonthNum, aBundleName, aStringBase) {
        let monthForm = call10n.getString(aBundleName, aStringBase + ".monthFormat") || "nominative";

        if (monthForm == "nominative") {
            // Fall back to the default name format
            monthForm = "name";
        }

        return call10n.getDateFmtString(`month.${aMonthNum}.${monthForm}`);
    },

    /**
     * Create a new locale collator
     *
     * @return {nsICollation}       A new locale collator
     */
    createLocaleCollator: function() {
        return Cc["@mozilla.org/intl/collation-factory;1"]
                 .getService(Ci.nsICollationFactory)
                 .CreateCollation();
    },

    /**
     * Sort an array of strings in place, according to the current locale.
     *
     * @param {String[]} aStringArray   The strings to sort
     * @return {String[]}               The sorted strings, more specifically aStringArray
     */
    sortArrayByLocaleCollator: function(aStringArray) {
        let collator = call10n.createLocaleCollator();
        aStringArray.sort((a, b) => collator.compareString(0, a, b));
        return aStringArray;
    },

    /**
     * Provides locale dependent parameters for displaying calendar views
     *
     * @param {String} aLocale     The locale to get the info for, e.g. "en-US",
     *                               "de-DE" or null for the current locale
     * @return {Object}            The getCalendarInfo object from mozIMozIntl
     */
    calendarInfo: _calendarInfo
};
