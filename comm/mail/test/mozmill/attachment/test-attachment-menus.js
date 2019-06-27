/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../shared-modules/test-attachment-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-attachment-menus";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers", "attachment-helpers"];

var folder;
var messenger;
var epsilon;

var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");
var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");
var controller = ChromeUtils.import("chrome://mozmill/content/modules/controller.jsm");

var textAttachment =
  "Can't make the frug contest, Helen; stomach's upset. I'll fix you, " +
  "Ubik! Ubik drops you back in the thick of things fast. Taken as " +
  "directed, Ubik speeds relief to head and stomach. Remember: Ubik is " +
  "only seconds away. Avoid prolonged use.";

var detachedName = "./attachment.txt";
var missingName = "./nonexistent.txt";
var deletedName = "deleted.txt";

// create some messages that have various types of attachments
var messages = [
  { name: "regular_attachment",
    attachments: [{ body: textAttachment,
                    filename: "ubik.txt",
                    format: "" }],
    menuStates: [{ open: true, save: true, detach: true, delete_: true }],
    allMenuStates: { open: true, save: true, detach: true, delete_: true },
  },
  { name: "detached_attachment",
    bodyPart: null,
    menuStates: [{ open: true, save: true, detach: false, delete_: false }],
    allMenuStates: { open: true, save: true, detach: false, delete_: false },
  },
  { name: "detached_attachment_with_missing_file",
    bodyPart: null,
    menuStates: [{ open: false, save: false, detach: false, delete_: false }],
    allMenuStates: { open: false, save: false, detach: false, delete_: false },
  },
  { name: "deleted_attachment",
    bodyPart: null,
    menuStates: [{ open: false, save: false, detach: false, delete_: false }],
    allMenuStates: { open: false, save: false, detach: false, delete_: false },
  },
  { name: "multiple_attachments",
    attachments: [{ body: textAttachment,
                    filename: "ubik.txt",
                    format: "" },
                  { body: textAttachment,
                    filename: "ubik2.txt",
                    format: "" }],
    menuStates: [{ open: true, save: true, detach: true, delete_: true },
                 { open: true, save: true, detach: true, delete_: true }],
    allMenuStates: { open: true, save: true, detach: true, delete_: true },
  },
  { name: "multiple_attachments_one_detached",
    bodyPart: null,
    attachments: [{ body: textAttachment,
                    filename: "ubik.txt",
                    format: "" }],
    menuStates: [{ open: true, save: true, detach: false, delete_: false },
                 { open: true, save: true, detach: true, delete_: true }],
    allMenuStates: { open: true, save: true, detach: true, delete_: true },
  },
  { name: "multiple_attachments_one_detached_with_missing_file",
    bodyPart: null,
    attachments: [{ body: textAttachment,
                    filename: "ubik.txt",
                    format: "" }],
    menuStates: [{ open: false, save: false, detach: false, delete_: false },
                 { open: true, save: true, detach: true, delete_: true }],
    allMenuStates: { open: true, save: true, detach: true, delete_: true },
  },
  { name: "multiple_attachments_one_deleted",
    bodyPart: null,
    attachments: [{ body: textAttachment,
                    filename: "ubik.txt",
                    format: "" }],
    menuStates: [{ open: false, save: false, detach: false, delete_: false },
                 { open: true, save: true, detach: true, delete_: true }],
    allMenuStates: { open: true, save: true, detach: true, delete_: true },
  },
  { name: "multiple_attachments_all_detached",
    bodyPart: null,
    menuStates: [{ open: true, save: true, detach: false, delete_: false },
                 { open: true, save: true, detach: false, delete_: false }],
    allMenuStates: { open: true, save: true, detach: false, delete_: false },
  },
  { name: "multiple_attachments_all_detached_with_missing_files",
    bodyPart: null,
    menuStates: [{ open: false, save: false, detach: false, delete_: false },
                 { open: false, save: false, detach: false, delete_: false }],
    allMenuStates: { open: false, save: false, detach: false, delete_: false },
  },
  { name: "multiple_attachments_all_deleted",
    bodyPart: null,
    menuStates: [{ open: false, save: false, detach: false, delete_: false },
                 { open: false, save: false, detach: false, delete_: false }],
    allMenuStates: { open: false, save: false, detach: false, delete_: false },
  },
  { name: "link_enclosure_valid",
    bodyPart: null,
    menuStates: [{ open: true, save: true, detach: false, delete_: false }],
    allMenuStates: { open: true, save: true, detach: false, delete_: false },
  },
  { name: "link_enclosure_invalid",
    bodyPart: null,
    menuStates: [{ open: false, save: false, detach: false, delete_: false }],
    allMenuStates: { open: false, save: false, detach: false, delete_: false },
  },
  { name: "link_multiple_enclosures",
    bodyPart: null,
    menuStates: [{ open: true, save: true, detach: false, delete_: false },
                 { open: true, save: true, detach: false, delete_: false }],
    allMenuStates: { open: true, save: true, detach: false, delete_: false },
  },
  { name: "link_multiple_enclosures_one_invalid",
    bodyPart: null,
    menuStates: [{ open: true, save: true, detach: false, delete_: false },
                 { open: false, save: false, detach: false, delete_: false }],
    allMenuStates: { open: true, save: true, detach: false, delete_: false },
  },
  { name: "link_multiple_enclosures_all_invalid",
    bodyPart: null,
    menuStates: [{ open: false, save: false, detach: false, delete_: false },
                 { open: false, save: false, detach: false, delete_: false }],
    allMenuStates: { open: false, save: false, detach: false, delete_: false },
  },
];

function setupModule(module) {
  let fdh = collector.getModule("folder-display-helpers");
  fdh.installInto(module);
  let wh = collector.getModule("window-helpers");
  wh.installInto(module);
  let ah = collector.getModule("attachment-helpers");
  ah.installInto(module);

  messenger = Cc["@mozilla.org/messenger;1"]
                .createInstance(Ci.nsIMessenger);

  /* Today's gory details (thanks to Jonathan Protzenko): libmime somehow
   * counts the trailing newline for an attachment MIME part. Most of the time,
   * assuming attachment has N bytes (no matter what's inside, newlines or
   * not), libmime will return N + 1 bytes. On Linux and Mac, this always
   * holds. However, on Windows, if the attachment is not encoded (that is, is
   * inline text), libmime will return N + 2 bytes.
   */
  epsilon = ("@mozilla.org/windows-registry-key;1" in Cc) ? 2 : 1;

  // set up our detached/deleted attachments
  var thisFilePath = os.getFileForPath(__file__);

  var detachedFile = os.getFileForPath(os.abspath(detachedName, thisFilePath));
  var detached = create_body_part(
    "Here is a file",
    [create_detached_attachment(detachedFile, "text/plain")]
  );
  var multiple_detached = create_body_part(
    "Here are some files",
    [create_detached_attachment(detachedFile, "text/plain"),
     create_detached_attachment(detachedFile, "text/plain")]
  );

  var missingFile = os.getFileForPath(os.abspath(missingName, thisFilePath));
  var missing = create_body_part(
    "Here is a file (but you deleted the external file, you silly oaf!)",
    [create_detached_attachment(missingFile, "text/plain")]
  );
  var multiple_missing = create_body_part(
    "Here are some files (but you deleted the external files, you silly oaf!)",
    [create_detached_attachment(missingFile, "text/plain"),
     create_detached_attachment(missingFile, "text/plain")]
  );

  var deleted = create_body_part(
    "Here is a file that you deleted",
    [create_deleted_attachment(deletedName, "text/plain")]
  );
  var multiple_deleted = create_body_part(
    "Here are some files that you deleted",
    [create_deleted_attachment(deletedName, "text/plain"),
     create_deleted_attachment(deletedName, "text/plain")]
  );

  var enclosure_valid_url = create_body_part(
    "My blog has the best enclosure",
    [create_enclosure_attachment("purr.mp3", "audio/mpeg", "http://example.com", 12345678)]
  );
  var enclosure_invalid_url = create_body_part(
    "My blog has the best enclosure with a dead link",
    [create_enclosure_attachment("meow.mp3", "audio/mpeg", "http://example.com/invalid")]
  );
  var multiple_enclosures = create_body_part(
    "My blog has the best 2 cat sound enclosures",
    [create_enclosure_attachment("purr.mp3", "audio/mpeg", "http://example.com", 1234567),
     create_enclosure_attachment("meow.mp3", "audio/mpeg", "http://example.com", 987654321)]
  );
  var multiple_enclosures_one_link_invalid = create_body_part(
    "My blog has the best 2 cat sound enclosures but one is invalid",
    [create_enclosure_attachment("purr.mp3", "audio/mpeg", "http://example.com", 1234567),
     create_enclosure_attachment("meow.mp3", "audio/mpeg", "http://example.com/invalid")]
  );
  var multiple_enclosures_all_links_invalid = create_body_part(
    "My blog has 2 enclosures with 2 bad links",
    [create_enclosure_attachment("purr.mp3", "audio/mpeg", "http://example.com/invalid"),
     create_enclosure_attachment("meow.mp3", "audio/mpeg", "http://example.com/invalid")]
  );

  folder = create_folder("AttachmentMenusA");
  for (let i = 0; i < messages.length; i++) {
    // First, add any missing info to the message object.
    switch (messages[i].name) {
      case "detached_attachment":
      case "multiple_attachments_one_detached":
        messages[i].bodyPart = detached;
        break;
      case "multiple_attachments_all_detached":
        messages[i].bodyPart = multiple_detached;
        break;
      case "detached_attachment_with_missing_file":
      case "multiple_attachments_one_detached_with_missing_file":
        messages[i].bodyPart = missing;
        break;
      case "multiple_attachments_all_detached_with_missing_files":
        messages[i].bodyPart = multiple_missing;
        break;
      case "deleted_attachment":
      case "multiple_attachments_one_deleted":
        messages[i].bodyPart = deleted;
        break;
      case "multiple_attachments_all_deleted":
        messages[i].bodyPart = multiple_deleted;
        break;
      case "link_enclosure_valid":
        messages[i].bodyPart = enclosure_valid_url;
        break;
      case "link_enclosure_invalid":
        messages[i].bodyPart = enclosure_invalid_url;
        break;
      case "link_multiple_enclosures":
        messages[i].bodyPart = multiple_enclosures;
        break;
      case "link_multiple_enclosures_one_invalid":
        messages[i].bodyPart = multiple_enclosures_one_link_invalid;
        break;
      case "link_multiple_enclosures_all_invalid":
        messages[i].bodyPart = multiple_enclosures_all_links_invalid;
        break;
    }

    add_message_to_folder(folder, create_message(messages[i]));
  }
}

/**
 * Ensure that the specified element is visible/hidden
 *
 * @param id the id of the element to check
 * @param visible true if the element should be visible, false otherwise
 */
function assert_shown(id, visible) {
  if (mc.e(id).hidden == visible)
    throw new Error('"' + id + '" should be ' +
                    (visible ? "visible" : "hidden"));
}

/**
 * Ensure that the specified element is enabled/disabled
 *
 * @param id the id of the element to check
 * @param enabled true if the element should be enabled, false otherwise
 */
function assert_enabled(id, enabled) {
  if (mc.e(id).disabled == enabled)
    throw new Error('"' + id + '" should be ' +
                    (enabled ? "enabled" : "disabled"));
}

/**
 * Check that the menu states in the "save" toolbar button are correct.
 *
 * @param expected a dictionary containing the expected states
 */
function check_toolbar_menu_states_single(expected) {
  assert_shown("attachmentSaveAllSingle", true);
  assert_shown("attachmentSaveAllMultiple", false);

  if (expected.save === false) {
    assert_enabled("attachmentSaveAllSingle", false);
  } else {
    assert_enabled("attachmentSaveAllSingle", true);
    mc.click(mc.aid("attachmentSaveAllSingle",
                    {"class": "toolbarbutton-menubutton-dropmarker"}));
    wait_for_popup_to_open(mc.e("attachmentSaveAllSingleMenu"));

    try {
      assert_enabled("button-openAttachment", expected.open);
      assert_enabled("button-saveAttachment", expected.save);
      assert_enabled("button-detachAttachment", expected.detach);
      assert_enabled("button-deleteAttachment", expected.delete_);
    } catch (e) {
      throw e;
    } finally {
      close_popup(mc, mc.eid("attachmentSaveAllSingleMenu"));
    }
  }
}

/**
 * Check that the menu states in the "save all" toolbar button are correct.
 *
 * @param expected a dictionary containing the expected states
 */
function check_toolbar_menu_states_multiple(expected) {
  assert_shown("attachmentSaveAllSingle", false);
  assert_shown("attachmentSaveAllMultiple", true);

  if (expected.save === false) {
    assert_enabled("attachmentSaveAllMultiple", false);
  } else {
    assert_enabled("attachmentSaveAllMultiple", true);
    mc.click(mc.aid("attachmentSaveAllMultiple",
                    {"class": "toolbarbutton-menubutton-dropmarker"}));
    wait_for_popup_to_open(mc.e("attachmentSaveAllMultipleMenu"));

    try {
      assert_enabled("button-openAllAttachments", expected.open);
      assert_enabled("button-saveAllAttachments", expected.save);
      assert_enabled("button-detachAllAttachments", expected.detach);
      assert_enabled("button-deleteAllAttachments", expected.delete_);
    } catch (e) {
      throw e;
    } finally {
      close_popup(mc, mc.eid("attachmentSaveAllMultipleMenu"));
    }
  }
}

/**
 * Check that the menu states in the single item context menu are correct
 *
 * @param expected a dictionary containing the expected states
 */
function check_menu_states_single(index, expected) {
  let attachmentList = mc.e("attachmentList");
  let node = attachmentList.getItemAtIndex(index);

  attachmentList.selectItem(node);
  let menu = mc.getMenu("#attachmentItemContext");
  menu.open(new elib.Elem(node));
  wait_for_popup_to_open(mc.e("attachmentItemContext"));

  try {
    assert_shown("context-openAttachment", true);
    assert_shown("context-saveAttachment", true);
    assert_shown("context-menu-separator", true);
    assert_shown("context-detachAttachment", true);
    assert_shown("context-deleteAttachment", true);

    assert_enabled("context-openAttachment", expected.open);
    assert_enabled("context-saveAttachment", expected.save);
    assert_enabled("context-detachAttachment", expected.detach);
    assert_enabled("context-deleteAttachment", expected.delete_);
  } catch (e) {
    throw e;
  } finally {
    menu.close();
  }
}

/**
 * Check that the menu states in the all items context menu are correct
 *
 * @param expected a dictionary containing the expected states
 */
function check_menu_states_all(expected) {
  // Using a rightClick here is unsafe, because we need to hit the empty area
  // beside the attachment items and that seems to be different per platform.
  // Using DOM methods to open the popup works fine.
  mc.e("attachmentListContext").openPopup(mc.e("attachmentList"));
  wait_for_popup_to_open(mc.e("attachmentListContext"));

  try {
    assert_shown("context-openAllAttachments", true);
    assert_shown("context-saveAllAttachments", true);
    assert_shown("context-menu-separator-all", true);
    assert_shown("context-detachAllAttachments", true);
    assert_shown("context-deleteAllAttachments", true);

    assert_enabled("context-openAllAttachments", expected.open);
    assert_enabled("context-saveAllAttachments", expected.save);
    assert_enabled("context-detachAllAttachments", expected.detach);
    assert_enabled("context-deleteAllAttachments", expected.delete_);
  } catch (e) {
    throw e;
  } finally {
    close_popup(mc, mc.eid("attachmentListContext"));
  }
}

function help_test_attachment_menus(index) {
  be_in_folder(folder);
  select_click_row(index);
  let expectedStates = messages[index].menuStates;

  mc.window.toggleAttachmentList(true);

  for (let attachment of mc.window.currentAttachments) {
    // Ensure all attachments are resolved; other than external they already
    // should be.
    attachment.isEmpty();
  }

  // Test funcs are generated in the global scope, and there isn't a way to
  // do this async (like within an async add_task in xpcshell) so await can
  // force serial execution of each test. Wait here for the fetch() to complete.
  controller.sleep(1000);

  if (expectedStates.length == 1)
    check_toolbar_menu_states_single(messages[index].allMenuStates);
  else
    check_toolbar_menu_states_multiple(messages[index].allMenuStates);

  check_menu_states_all(messages[index].allMenuStates);
  for (let i = 0; i < expectedStates.length; i++)
    check_menu_states_single(i, expectedStates[i]);
}

// Generate a test for each message in |messages|.
for (let [i, message] of messages.entries()) {
  let index = i; // make a copy to avoid passing a reference to i
  this["test_" + message.name] = function() {
    help_test_attachment_menus(index);
  };
}
