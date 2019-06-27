/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that opening an .eml file with empty subject works.
 */

"use strict";

/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-eml-subject";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers"];

var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");
var {StringBundle} = ChromeUtils.import("resource:///modules/StringBundle.js");
var {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

var setupModule = function(module) {
  let fdh = collector.getModule("folder-display-helpers");
  fdh.installInto(module);
  let wh = collector.getModule("window-helpers");
  wh.installInto(module);
};

function check_eml_window_title(subject, eml) {
  let file = os.getFileForPath(os.abspath(eml, os.getFileForPath(__file__)));
  let msgc = open_message_from_file(file);

  let brandBundle = new StringBundle("chrome://branding/locale/brand.properties");
  let productName = brandBundle.get("brandFullName");
  let expectedTitle = subject;
  if (expectedTitle && (AppConstants.platform != "macosx"))
    expectedTitle += " - ";

  if (!expectedTitle || (AppConstants.platform != "macosx"))
    expectedTitle += productName;

  assert_equals(msgc.window.document.title, expectedTitle);
  close_window(msgc);
}

function test_eml_empty_subject() {
  check_eml_window_title("", "./emptySubject.eml");
}

function test_eml_normal_subject() {
  check_eml_window_title("An email", "./evil.eml");
}
