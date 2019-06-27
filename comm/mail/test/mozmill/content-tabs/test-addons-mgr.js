/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-addons-mgr";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "content-tab-helpers", "window-helpers"];

var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

function test_open_addons_with_url() {
  mc.window.openAddonsMgr("addons://list/theme");
  mc.sleep(0);

  let tab = mc.tabmail.currentTabInfo;
  wait_for_content_tab_load(tab, "about:addons", 10000);
  assert_true(content_tab_e(tab, "category-theme").selected,
              "Themes category should be selected!");

  mc.tabmail.switchToTab(0); // switch to 3pane

  mc.window.openAddonsMgr("addons://list/plugin");
  mc.sleep(0);

  tab = mc.tabmail.currentTabInfo;
  wait_for_content_tab_load(tab, "about:addons", 10000);
  assert_true(content_tab_e(tab, "category-plugin").selected,
              "Plugins category should be selected!");

  mc.tabmail.closeTab(tab);
}

/**
 * Bug 1462923
 * Check if the "Tools->Add-on Options" menu item works and shows our add-on.
 * This relies on the MozMill extension having optionsURL defined in install.rdf,
 * however simplistic the preferences XUL document may be.
 */
function test_addon_prefs() {
  // Open Add-on Options.
  const subview = mc.click_through_appmenu([{id: "appmenu_addons"}]);

  plan_for_modal_dialog("mozmill-prefs", function(controller) {
    // Add |mc.sleep(1000);| here to see the popup dialog.
    controller.window.close();
  });

  // MozMill add-on should be somewhere in the list. When found, click it.
  let foundAddon = false;
  for (let item of subview.children) {
    if (item.tagName == "toolbarbutton" &&
        item.getAttribute("collapsed") != "true" &&
        item.label == "MozMill") {
      foundAddon = true;
      mc.click(new elib.Elem(item));
      break;
    }
  }
  assert_true(foundAddon);

  // Wait for the options dialog to open and close.
  wait_for_modal_dialog();
  wait_for_window_close();
}
