/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gAlarmsPane */

/* import-globals-from ../../../lightning/content/messenger-overlay-preferences.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

Preferences.addAll([
    { id: "calendar.alarms.playsound", type: "bool" },
    { id: "calendar.alarms.soundURL", type: "string" },
    { id: "calendar.alarms.soundType", type: "int" },
    { id: "calendar.alarms.show", type: "bool" },
    { id: "calendar.alarms.showmissed", type: "bool" },
    { id: "calendar.alarms.onforevents", type: "int" },
    { id: "calendar.alarms.onfortodos", type: "int" },
    { id: "calendar.alarms.eventalarmlen", type: "int" },
    { id: "calendar.alarms.eventalarmunit", type: "string" },
    { id: "calendar.alarms.todoalarmlen", type: "int" },
    { id: "calendar.alarms.todoalarmunit", type: "string" },
    { id: "calendar.alarms.defaultsnoozelength", type: "int" },
]);

/**
 * Global Object to hold methods for the alarms pref pane
 */
var gAlarmsPane = {
    /**
     * Initialize the alarms pref pane. Sets up dialog controls to match the
     * values set in prefs.
     */
    init: function() {
        // Enable/disable the alarm sound URL box and buttons
        this.alarmsPlaySoundPrefChanged();

        // Set the correct singular/plural for the time units
        updateMenuLabelsPlural("eventdefalarmlen", "eventdefalarmunit");
        updateMenuLabelsPlural("tododefalarmlen", "tododefalarmunit");
        updateUnitLabelPlural("defaultsnoozelength", "defaultsnoozelengthunit", "minutes");
    },

    /**
     * Converts the given file url to a nsIFile
     *
     * @param aFileURL    A string with a file:// url.
     * @return            The corresponding nsIFile.
     */
    convertURLToLocalFile: function(aFileURL) {
        // Convert the file url into a nsIFile
        if (aFileURL) {
            let fph = Services.io
                         .getProtocolHandler("file")
                         .QueryInterface(Ci.nsIFileProtocolHandler);
            return fph.getFileFromURLSpec(aFileURL);
        } else {
            return null;
        }
    },

    /**
     * Handler function to be called when the calendar.alarms.soundURL pref has
     * changed. Updates the label in the dialog.
     */
    readSoundLocation: function() {
        let soundUrl = document.getElementById("alarmSoundFileField");
        soundUrl.value = Preferences.get("calendar.alarms.soundURL").value;
        if (soundUrl.value.startsWith("file://")) {
            soundUrl.label = gAlarmsPane.convertURLToLocalFile(soundUrl.value).leafName;
        } else {
            soundUrl.label = soundUrl.value;
        }
        soundUrl.style.backgroundImage = "url(moz-icon://" + soundUrl.label + "?size=16)";
        return undefined;
    },

    /**
     * Causes the default sound to be selected in the dialog controls
     */
    useDefaultSound: function() {
        let defaultSoundUrl = "chrome://calendar/content/sound.wav";
        Preferences.get("calendar.alarms.soundURL").value = defaultSoundUrl;
        document.getElementById("alarmSoundCheckbox").checked = true;
        this.readSoundLocation();
    },

    /**
     * Opens a filepicker to open a local sound for the alarm.
     */
    browseAlarm: function() {
        let picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

        // If we already have a sound file, then use the path for that sound file
        // as the initial path in the dialog.
        let currentValue = Preferences.get("calendar.alarms.soundURL").value;
        if (currentValue && currentValue.startsWith("file://")) {
            let localFile = Services.io.newURI(currentValue).QueryInterface(Ci.nsIFileURL).file;
            picker.displayDirectory = localFile.parent;
        }

        let title = document.getElementById("bundlePreferences")
                            .getString("soundFilePickerTitle");

        picker.init(window, title, Ci.nsIFilePicker.modeOpen);
        picker.appendFilters(Ci.nsIFilePicker.filterAudio);
        picker.appendFilters(Ci.nsIFilePicker.filterAll);

        picker.open(rv => {
            if (rv != Ci.nsIFilePicker.returnOK || !picker.file) {
                return;
            }
            Preferences.get("calendar.alarms.soundURL").value = picker.fileURL.spec;
            document.getElementById("alarmSoundCheckbox").checked = true;
            this.readSoundLocation();
        });
    },

    /**
     * Plays the alarm sound currently selected.
     */
    previewAlarm: function() {
        let soundUrl;
        if (Preferences.get("calendar.alarms.soundType").value == 0) {
            soundUrl = "chrome://calendar/content/sound.wav";
        } else {
            soundUrl = Preferences.get("calendar.alarms.soundURL").value;
        }
        let soundIfc = Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound);
        let url;
        try {
            soundIfc.init();
            if (soundUrl && soundUrl.length && soundUrl.length > 0) {
                url = Services.io.newURI(soundUrl);
                soundIfc.play(url);
            } else {
                soundIfc.beep();
            }
        } catch (ex) {
            dump("alarms.js previewAlarm Exception caught! " + ex + "\n");
        }
    },

    /**
     * Handler function to call when the calendar.alarms.playsound preference
     * has been changed. Updates the disabled state of fields that depend on
     * playing a sound.
     */
    alarmsPlaySoundPrefChanged: function() {
        let alarmsPlaySoundPref = Preferences.get("calendar.alarms.playsound");
        let alarmsSoundType = Preferences.get("calendar.alarms.soundType");

        for (let item of ["alarmSoundType", "calendar.prefs.alarm.sound.play"]) {
            document.getElementById(item).disabled = !alarmsPlaySoundPref.value;
        }

        for (let item of ["alarmSoundFileField", "calendar.prefs.alarm.sound.browse"]) {
            document.getElementById(item).disabled = alarmsSoundType.value != 1;
        }
    }
};

Preferences.get("calendar.alarms.playsound").on("change", gAlarmsPane.alarmsPlaySoundPrefChanged);
Preferences.get("calendar.alarms.soundType").on("change", gAlarmsPane.alarmsPlaySoundPrefChanged);
Preferences.get("calendar.alarms.soundURL").on("change", gAlarmsPane.readSoundLocation);
