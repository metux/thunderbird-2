/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that we load and display embedded images in messages.
 */

"use strict";

/* import-globals-from ../shared-modules/test-compose-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-image-display";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers", "compose-helpers"];

var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");
var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");
var {IOUtils} = ChromeUtils.import("resource:///modules/IOUtils.js");

var gImageFolder;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
  gImageFolder = create_folder("ImageFolder");
}

/**
 * Check dimensions of the embedded image and whether it could be loaded.
 */
function check_image_size(aController, aImage, aSrcStart) {
  assert_not_equals(null, aImage);
  aController.waitFor(() => aImage.complete);
  // There should not be a cid: URL now.
  assert_false(aImage.src.startsWith("cid:"));
  if (aSrcStart)
    assert_true(aImage.src.startsWith(aSrcStart));

  // Check if there are height and width attributes forcing the image to a size.
  let id = aImage.id;
  assert_true(aImage.hasAttribute("height"), "Image " + id + " is missing a required attribute");
  assert_true(aImage.hasAttribute("width"), "Image " + id + " is missing a required attribute");

  assert_true(aImage.height > 0, "Image " + id + " is missing a required attribute");
  assert_true(aImage.width > 0, "Image " + id + " is missing a required attribute");

  // If the image couldn't be loaded, the naturalWidth and Height are zero.
  assert_true(aImage.naturalHeight > 0, "Loaded image " + id + " is of zero size");
  assert_true(aImage.naturalWidth > 0, "Loaded image " + id + " is of zero size");
}

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message from file will work.
 */
function test_cid_image_load() {
  let file = os.getFileForPath(os.abspath("./content-utf8-rel-only.eml",
                               os.getFileForPath(__file__)));

  // Make sure there is a cid: referenced image in the message.
  let msgSource = IOUtils.loadFileToString(file);
  assert_true(msgSource.includes('<img src="cid:'));

  // Our image should be in the loaded eml document.
  let msgc = open_message_from_file(file);
  let messageDoc = msgc.e("messagepane").contentDocument;
  let image = messageDoc.getElementById("cidImage");
  check_image_size(msgc, image, "mailbox://");
  image = messageDoc.getElementById("cidImageOrigin");
  check_image_size(msgc, image, "mailbox://");

  // Copy the message to a folder.
  let documentChild = messageDoc.firstChild;
  msgc.rightClick(new elib.Elem(documentChild));
  msgc.click_menus_in_sequence(msgc.e("mailContext"), [
    {id: "mailContext-copyMenu"},
    {label: "Local Folders"},
    {label: gImageFolder.prettyName },
  ]);
  close_window(msgc);
}

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message in a folder with work.
 */
function test_cid_image_view() {
  // Preview the message in the folder.
  be_in_folder(gImageFolder);
  let msg = select_click_row(0);
  assert_selected_and_displayed(mc, msg);

  // Check image in the preview.
  let messageDoc = mc.e("messagepane").contentDocument;
  let image = messageDoc.getElementById("cidImage");
  check_image_size(mc, image, gImageFolder.server.localStoreType + "://");
  image = messageDoc.getElementById("cidImageOrigin");
  check_image_size(mc, image, gImageFolder.server.localStoreType + "://");
}

/**
 * Bug 1352701 and bug 1360443
 * Test that showing an image with cid: URL in a HTML message will work
 * in a composition.
 */
function test_cid_image_compose() {
  // Our image should also be in composition when the message is forwarded/replied.
  for (let msgOperation of [open_compose_with_forward, open_compose_with_reply]) {
    let cwc = msgOperation();
    let image = cwc.e("content-frame").contentDocument.getElementById("cidImage");
    check_image_size(cwc, image, "data:");
    image = cwc.e("content-frame").contentDocument.getElementById("cidImageOrigin");
    check_image_size(cwc, image, "data:");
    close_compose_window(cwc);
  }
}
