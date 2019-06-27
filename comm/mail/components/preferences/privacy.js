/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

Preferences.addAll([
  { id: "pref.privacy.disable_button.cookie_exceptions", type: "bool" },
  { id: "pref.privacy.disable_button.view_cookies", type: "bool" },
  { id: "mailnews.message_display.disable_remote_image", type: "bool", inverted: "true" },
  { id: "places.history.enabled", type: "bool" },
  { id: "network.cookie.cookieBehavior", type: "int" },
  { id: "network.cookie.lifetimePolicy", type: "int" },
  { id: "network.cookie.blockFutureCookies", type: "bool" },
  { id: "privacy.donottrackheader.enabled", type: "bool" },
]);

document.getElementById("panePrivacy")
        .addEventListener("paneload", function() { gPrivacyPane.init(); });

var gPrivacyPane = {

  init() {
  },

  /**
   * Reload the current message after a preference affecting the view
   * has been changed and we are in instantApply mode.
   */
  reloadMessageInOpener() {
    if (Services.prefs.getBoolPref("browser.preferences.instantApply") &&
        window.opener && typeof(window.opener.ReloadMessage) == "function")
      window.opener.ReloadMessage();
  },

  /**
   * Reads the network.cookie.cookieBehavior preference value and
   * enables/disables the rest of the cookie UI accordingly, returning true
   * if cookies are enabled.
   */
  readAcceptCookies() {
    let pref = Preferences.get("network.cookie.cookieBehavior");
    let acceptThirdPartyLabel = document.getElementById("acceptThirdPartyLabel");
    let acceptThirdPartyMenu = document.getElementById("acceptThirdPartyMenu");
    let keepUntil = document.getElementById("keepUntil");
    let menu = document.getElementById("keepCookiesUntil");

    // enable the rest of the UI for anything other than "disable all cookies"
    let acceptCookies = (pref.value != 2);

    acceptThirdPartyLabel.disabled = acceptThirdPartyMenu.disabled = !acceptCookies;
    keepUntil.disabled = menu.disabled = !acceptCookies;

    return acceptCookies;
  },

  /**
   * Enables/disables the "keep until" label and menulist in response to the
   * "accept cookies" checkbox being checked or unchecked.
   * @return 0 if cookies are accepted, 2 if they are not;
   *         the value network.cookie.cookieBehavior should get
   */
  writeAcceptCookies() {
    let accept = document.getElementById("acceptCookies");
    let acceptThirdPartyMenu = document.getElementById("acceptThirdPartyMenu");
    // if we're enabling cookies, automatically select 'accept third party always'
    if (accept.checked)
      acceptThirdPartyMenu.selectedIndex = 0;

    return accept.checked ? 0 : 2;
  },

  /**
   * Displays fine-grained, per-site preferences for cookies.
   */
  showCookieExceptions() {
    let bundle = document.getElementById("bundlePreferences");
    let params = {
      blockVisible: true,
      sessionVisible: true,
      allowVisible: true,
      prefilledHost: "",
      permissionType: "cookie",
      windowTitle: bundle.getString("cookiepermissionstitle"),
      introText: bundle.getString("cookiepermissionstext"),
    };
    gSubDialog.open("chrome://messenger/content/preferences/permissions.xul",
                    null, params);
  },

  /**
   * Displays all the user's cookies in a dialog.
   */
  showCookies(aCategory) {
    gSubDialog.open("chrome://messenger/content/preferences/cookies.xul");
  },

  /**
   * Converts between network.cookie.cookieBehavior and the third-party cookie UI
   */
  readAcceptThirdPartyCookies() {
    let pref = Preferences.get("network.cookie.cookieBehavior");
    switch (pref.value) {
      case 0:
        return "always";
      case 1:
        return "never";
      case 2:
        return "never";
      case 3:
        return "visited";
      default:
        return undefined;
    }
  },

  writeAcceptThirdPartyCookies() {
    let accept = document.getElementById("acceptThirdPartyMenu").selectedItem;
    switch (accept.value) {
      case "always":
        return 0;
      case "visited":
        return 3;
      case "never":
        return 1;
      default:
        return undefined;
    }
  },

  /**
   * Displays fine-grained, per-site preferences for remote content.
   * We use the "image" type for that, but it can also be stylesheets or
   * iframes.
   */
  showRemoteContentExceptions() {
    let bundle = document.getElementById("bundlePreferences");
    let params = {
      blockVisible: true,
      sessionVisible: false,
      allowVisible: true,
      prefilledHost: "",
      permissionType: "image",
      windowTitle: bundle.getString("imagepermissionstitle"),
      introText: bundle.getString("imagepermissionstext"),
    };
    gSubDialog.open("chrome://messenger/content/preferences/permissions.xul",
                    null, params);
  },
};

Preferences.get("mailnews.message_display.disable_remote_image").on("change", gPrivacyPane.reloadMessageInOpener);
