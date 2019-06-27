/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

var {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

Preferences.addAll([
  { id: "mail.pane_config.dynamic", type: "int" },
  { id: "mailnews.reuse_message_window", type: "bool" },
  { id: "mailnews.start_page.enabled", type: "bool" },
  { id: "mailnews.start_page.url", type: "string" },
  { id: "mail.biff.show_tray_icon", type: "bool"  },
  { id: "mail.biff.play_sound", type: "bool" },
  { id: "mail.biff.play_sound.type", type: "int" },
  { id: "mail.biff.play_sound.url", type: "string" },
]);
if (AppConstants.platform != "macosx") {
  Preferences.add({ id: "mail.biff.show_alert", type: "bool" });
}

document.getElementById("paneGeneral")
        .addEventListener("paneload", function() { gGeneralPane.init(); });

var gGeneralPane = {
  mPane: null,
  mStartPageUrl: "",

  init() {
    this.mPane = document.getElementById("paneGeneral");

    this.updateStartPage();
    this.updatePlaySound(
      !Preferences.get("mail.biff.play_sound").value,
      Preferences.get("mail.biff.play_sound.url").value,
      Preferences.get("mail.biff.play_sound.type").value
    );
    if (AppConstants.platform != "macosx") {
      this.updateCustomizeAlert();
    }
    this.updateWebSearch();
  },

  /**
   * Restores the default start page as the user's start page
   */
  restoreDefaultStartPage() {
    var startPage = Preferences.get("mailnews.start_page.url");
    startPage.value = startPage.defaultValue;
  },

  /**
   * Returns a formatted url corresponding to the value of mailnews.start_page.url
   * Stores the original value of mailnews.start_page.url
   */
  readStartPageUrl() {
    var pref = Preferences.get("mailnews.start_page.url");
    this.mStartPageUrl = pref.value;
    return Services.urlFormatter.formatURL(this.mStartPageUrl);
  },

  /**
   * Returns the value of the mailnews start page url represented by the UI.
   * If the url matches the formatted version of our stored value, then
   * return the unformatted url.
   */
  writeStartPageUrl() {
    var startPage = document.getElementById("mailnewsStartPageUrl");
    return Services.urlFormatter.formatURL(this.mStartPageUrl) == startPage.value ? this.mStartPageUrl : startPage.value;
  },

  customizeMailAlert() {
    gSubDialog.open("chrome://messenger/content/preferences/notifications.xul",
                    "resizable=no");
  },

  configureDockOptions() {
    gSubDialog.open("chrome://messenger/content/preferences/dockoptions.xul",
                    "resizable=no");
  },

  convertURLToLocalFile(aFileURL) {
    // convert the file url into a nsIFile
    if (aFileURL) {
      return Services.io
                     .getProtocolHandler("file")
                     .QueryInterface(Ci.nsIFileProtocolHandler)
                     .getFileFromURLSpec(aFileURL);
    }
    return null;
  },

  readSoundLocation() {
    var soundUrlLocation = document.getElementById("soundUrlLocation");
    soundUrlLocation.value = Preferences.get("mail.biff.play_sound.url").value;
    if (soundUrlLocation.value) {
      soundUrlLocation.label = this.convertURLToLocalFile(soundUrlLocation.value).leafName;
      soundUrlLocation.style.backgroundImage = "url(moz-icon://" + soundUrlLocation.label + "?size=16)";
    }
    return undefined;
  },

  previewSound() {
    let sound = Cc["@mozilla.org/sound;1"]
                  .createInstance(Ci.nsISound);

    let soundLocation;
    // soundType radio-group isn't used for macOS so it is not in the XUL file
    // for the platform.
    soundLocation = (AppConstants.platform == "macosx" ||
                     document.getElementById("soundType").value == 1) ?
                       document.getElementById("soundUrlLocation").value : "";

    if (!soundLocation.includes("file://")) {
      // User has not set any custom sound file to be played
      sound.playEventSound(Ci.nsISound.EVENT_NEW_MAIL_RECEIVED);
    } else {
      // User has set a custom audio file to be played along the alert.
      sound.play(Services.io.newURI(soundLocation));
    }
  },

  browseForSoundFile() {
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

    // if we already have a sound file, then use the path for that sound file
    // as the initial path in the dialog.
    var localFile = this.convertURLToLocalFile(document.getElementById("soundUrlLocation").value);
    if (localFile)
      fp.displayDirectory = localFile.parent;

    // XXX todo, persist the last sound directory and pass it in
    fp.init(window, document.getElementById("bundlePreferences").getString("soundFilePickerTitle"), nsIFilePicker.modeOpen);
    fp.appendFilters(Ci.nsIFilePicker.filterAudio);
    fp.appendFilters(Ci.nsIFilePicker.filterAll);

    fp.open(rv => {
      if (rv != nsIFilePicker.returnOK || !fp.file) {
        return;
      }
      // convert the nsIFile into a nsIFile url
      Preferences.get("mail.biff.play_sound.url").value = fp.fileURL.spec;
      this.readSoundLocation(); // XXX We shouldn't have to be doing this by hand
      this.updatePlaySound();
    });
  },

  updatePlaySound(soundsDisabled, soundUrlLocation, soundType) {
    // Update the sound type radio buttons based on the state of the
    // play sound checkbox.
    if (soundsDisabled === undefined) {
      soundsDisabled = !document.getElementById("newMailNotification").checked;
      soundUrlLocation = document.getElementById("soundUrlLocation").value;
    }

    // The UI is different on OS X as the user can only choose between letting
    // the system play a default sound or setting a custom one. Therefore,
    // "soundTypeEl" does not exist on OS X.
    if (AppConstants.platform != "macosx") {
      var soundTypeEl = document.getElementById("soundType");
      if (soundType === undefined) {
        soundType = soundTypeEl.value;
      }

      soundTypeEl.disabled = soundsDisabled;
      document.getElementById("soundUrlLocation").disabled =
        soundsDisabled || soundType != 1;
      document.getElementById("playSound").disabled =
        soundsDisabled || (!soundUrlLocation && soundType != 0);
    } else {
      // On OS X, if there is no selected custom sound then default one will
      // be played. We keep consistency by disabling the "Play sound" checkbox
      // if the user hasn't selected a custom sound file yet.
      document.getElementById("newMailNotification").disabled = !soundUrlLocation;
      document.getElementById("playSound").disabled = !soundUrlLocation;
      // The sound type radiogroup is hidden, but we have to keep the
      // play_sound.type pref set appropriately.
      Preferences.get("mail.biff.play_sound.type").value =
        (!soundsDisabled && soundUrlLocation) ? 1 : 0;
    }
  },

  updateStartPage() {
    document.getElementById("mailnewsStartPageUrl").disabled =
      !Preferences.get("mailnews.start_page.enabled").value;
  },

  updateCustomizeAlert() {
    // The button does not exist on all platforms.
    let customizeAlertButton = document.getElementById("customizeMailAlert");
    if (customizeAlertButton) {
      customizeAlertButton.disabled = !Preferences.get("mail.biff.show_alert").value;
    }
  },

  updateWebSearch() {
    let self = this;
    Services.search.init().then(async () => {
      let defaultEngine = await Services.search.getDefault();
      let engineList = document.getElementById("defaultWebSearch");
      for (let engine of await Services.search.getVisibleEngines()) {
        let item = engineList.appendItem(engine.name);
        item.engine = engine;
        item.className = "menuitem-iconic";
        item.setAttribute("image", engine.iconURI ? engine.iconURI.spec :
          "resource://gre-resources/broken-image.png"
        );
        if (engine == defaultEngine) {
          engineList.selectedItem = item;
        }
      }
      self.defaultEngines = await Services.search.getDefaultEngines();
      self.updateRemoveButton();

      engineList.addEventListener("command", async () => {
        await Services.search.setDefault(engineList.selectedItem.engine);
        self.updateRemoveButton();
      });
    });
  },

  // Caches the default engines so we only retrieve them once.
  defaultEngines: null,

  async updateRemoveButton() {
    let engineList = document.getElementById("defaultWebSearch");
    let removeButton = document.getElementById("removeSearchEngine");
    if (this.defaultEngines.includes(await Services.search.getDefault())) {
      // Don't allow deletion of a default engine (saves us having a 'restore' button).
      removeButton.disabled = true;
    } else {
      // Don't allow removal of last engine. This shouldn't happen since there should
      // always be default engines.
      removeButton.disabled = engineList.itemCount <= 1;
    }
  },

  addSearchEngine() {
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window, document.getElementById("bundlePreferences")
                            .getString("searchEnginePickerTitle"), Ci.nsIFilePicker.modeOpen);

    // Filter on XML files only.
    fp.appendFilter(document.getElementById("bundlePreferences")
                            .getString("searchEngineType"), "*.xml");

    fp.open(async rv => {
      if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
        return;
      }
      let engineAdd = fp.fileURL.spec;
      let engine = await Services.search.addEngine(engineAdd, null, false);

      // Add new engine to the list.
      let engineList = document.getElementById("defaultWebSearch");

      let item = engineList.appendItem(engine.name);
      item.engine = engine;
      item.className = "menuitem-iconic";
      item.setAttribute(
        "image", engine.iconURI ? engine.iconURI.spec :
                 "resource://gre-resources/broken-image.png"
      );

      this.updateRemoveButton();
    });
  },

  async removeSearchEngine() {
    // Deletes the current engine. Firefox does a better job since it
    // shows all the engines in the list. But better than nothing.
    let defaultEngine = await Services.search.getDefault();
    let engineList = document.getElementById("defaultWebSearch");
    for (let i = 0; i < engineList.itemCount; i++) {
      let item = engineList.getItemAtIndex(i);
      if (item.engine == defaultEngine) {
        await Services.search.removeEngine(item.engine);
        item.remove();
        engineList.selectedIndex = 0;
        await Services.search.setDefault(engineList.selectedItem.engine);
        this.updateRemoveButton();
        break;
      }
    }
  },
};

Preferences.get("mailnews.start_page.enabled").on("change", gGeneralPane.updateStartPage);
if (AppConstants.platform != "macosx") {
  Preferences.get("mail.biff.show_alert").on("change", gGeneralPane.updateCustomizeAlert);
}
