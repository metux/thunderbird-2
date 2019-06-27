/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Checks various remote content policy workings, including:
 *
 * - Images
 * - Video
 *
 * In:
 *
 * - Messages
 * - Reply email compose window
 * - Forward email compose window
 * - Content tab
 * - Feed message
 */

"use strict";

/* import-globals-from ../shared-modules/test-compose-helpers.js */
/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-keyboard-helpers.js */
/* import-globals-from ../shared-modules/test-notificationbox-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-general-content-policy";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "compose-helpers",
  "content-tab-helpers",
  "keyboard-helpers",
  "notificationbox-helpers",
];

var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");
var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

var folder = null;
var gMsgNo = 0;

// RELATIVE_ROOT messes with the collector, so we have to bring the path back
// so we get the right path for the resources.
var url = collector.addHttpResource("../content-policy/html", "content");

/**
 * The TESTS array is constructed from objects containing the following:
 *
 * type:            The type of the test being run.
 * body:            The html to be inserted into the body of the message under
 *                  test. Note: the element under test for content
 *                  allowed/disallowed should have id 'testelement'.
 * webPage:         The web page to load during the content tab part of the
 *                  test.
 * checkForAllowed: A function that is passed the element with id 'testelement'
 *                  to check for remote content being allowed/disallowed.
 *                  This function should return true if remote content was
 *                  allowed, false otherwise.
 */
var TESTS = [
  {
    type: "Image",
    checkDenied: true,
    body: '<img id="testelement" src="' + url + 'pass.png"/>\n',
    webPage: "remoteimage.html",
    checkForAllowed: function img_checkAllowed(element) {
      return element.QueryInterface(Ci.nsIImageLoadingContent)
                    .imageBlockingStatus == Ci.nsIContentPolicy.ACCEPT;
    },
  },
  {
    type: "Video",
    checkDenied: true,
    body: '<video id="testelement" src="' + url + 'video.ogv"/>\n',
    webPage: "remotevideo.html",
    checkForAllowed: function video_checkAllowed(element) {
      return element.networkState != element.NETWORK_NO_SOURCE;
    },
  },
  {
    type: "Image-Data",
    checkDenied: false,
    body: '<img id="testelement" src="data:image/png,%89PNG%0D%0A%1A%0A%00%00%00%0DIHDR%00%00%002%00%00%00%14%08%02%00%00%00%40%A8%F9%CD%00%00%02%A3IDATH%C7%ED%96%3D%2C%2CQ%14%C7%FF3K%22H4%3Ev%13%1F%DDR%10QP%09BT%22%0A%C2F%23HhD%B2%09%A5NB%88%C4%2B%25%0A%0At%14%14%04%85%CFD%82H%14%3E%12%8A-h%84B%7Cd%AD%FD%BDb%5E%26c%F7%3D%3B%5E%A5pr%8A%B9%E7%FE%EE%B9%FF%DCs%EE%CC%18%80%BE%9F%99%FA%96%F6%23%EB%3Fd%15%A9%C8%90%E1%F4d%25g%2B%BBNu%EBZ%8FYs%AB%5B%8F%3C%86%8C%90B%F1%19%8Fu%1CP%20W%B9%C9JNRR%8Er*U%19T0%AC%B0%7B%C6%B0Z%BEHE%17%BA%18%D7%B8%24DD%91%7B%DD%1F%E8%60G%3B%A6%CC-mU%AA%D2N%3A%A9%C9%A0%82%92%C646%A8A%A7%A6%3D%ED%D5%AA%D6%23O%9B%DA%FC%F2G%14%09)t%A0%83S%9D%3E%EA1%5D%E9.%19%01%40!%85%E2%CF%B3%D3%26%98%10j%A5%D5%19%2C%A7%DC%83G%A8%8C%B2%18%BE%91F%A1%0D6b%E2W%5C%BD%F1%E6%9EI%20%EB%81%07%A1%12J%EC%C8%25%97B%DDt%7B%F1%0A%9Ds%EE%E4%8B)%16z%E5%95%7F%9B%1B%26A%CB%A7*U%92%E9%B8%19%F3%9A%97%14P%A0E-%92%16%B4%E0%E4%F3%95%2FiF3%9F%E4t%C3%248%AD%13N%9CE%8C%12%F5%E3%CF%24%F3%8D%B7m%B6%85%FC%F8%A3Dm~%8B-%AB%BE%0D4%2C%B1%F4%CCs%7CN7%CCg%B2%DEyo%A6Yh%99e%2Br%C8%A1P%0F%3D%D6%AC%0F%9F%D0%11G%CEUk%AC%15P%20%24%94FZ%3B%ED%FB%EC%C7dN%C8%7C%90u%C6%99%E5\'%9C%2C%B0PM%B5P%1F%7D%F6y%04%09%0A%AD%B3n%0D%FB%E9%17%1Ad0f%D70%E1%25%96%02%04%D2I%B7%F6%EE%A2%2BL%D8%3D%F3A%96%ED%26%A6%0F_%13M%2B%AC%D8%9A%22D%7C%F8%AC%0AZ%91%5Dv%85%F2%C8%7B%E7%FD%AF%9D%FB%C4%D34%D3%D6%E5%18a%C4%3D%93%A0%B7%9C%B6%C9%A6S%BA%D3w%D8%F9d%E1%11GB%15T%B8g%BE%F0%F1%99%D3%9C!cO%7Bg%3A%B3%7DHC%F1%F71%C6JT%22%E9U%AF_%60%5C%9E%D6%0B%2F%19d%D4P%13%13%BF%E1%C6%C4%CC%22%CB%AA%EC%2F~%5Dq%15%C3%AC%B0b%BD%EA%AC%A1%1B%C6%AD%ACE%16%85%A6%98%8A%9F%AA%A7%5Eh%95U%3BO)%A5%BD%F4%0E3%3C%CAh\'%9D)%A4d%91u%CD%B5s%AF%CF%19%B7%B2ZhI%22%E9%8E%BB%F8%A9Yf%85%3A%E8%006%D8%18%60%A0%8A*%2F%5E%0F%1E%133%9F%FC%5EzC%84l%DE%0Dc%FC%FC%9D~%C1~%03%97%96%03%F2QP%E0%18%00%00%00%00IEND%AEB%60%82"/>\n',
    webPage: "remoteimagedata.html",
    checkForAllowed: function img_checkAllowed(element) {
      return element.QueryInterface(Ci.nsIImageLoadingContent)
                    .imageBlockingStatus == Ci.nsIContentPolicy.ACCEPT;
    },
  },
];

// These two constants are used to build the message body.
var msgBodyStart = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">\n' +
"<html>\n" +
"<head>\n" +
"\n" +
'<meta http-equiv="content-type" content="text/html; charset=ISO-8859-1">\n' +
"</head>\n" +
'<body bgcolor="#ffffff" text="#000000">\n';

var msgBodyEnd = "</body>\n</html>\n";

function setupModule(module) {
  for (let dep of MODULE_REQUIRES) {
    collector.getModule(dep).installInto(module);
  }

  folder = create_folder("generalContentPolicy");
}

function addToFolder(aSubject, aBody, aFolder) {
  let msgId = Cc["@mozilla.org/uuid-generator;1"]
                          .getService(Ci.nsIUUIDGenerator)
                          .generateUUID() + "@mozillamessaging.invalid";

  let source = "From - Sat Nov  1 12:39:54 2008\n" +
               "X-Mozilla-Status: 0001\n" +
               "X-Mozilla-Status2: 00000000\n" +
               "Message-ID: <" + msgId + ">\n" +
               "Date: Wed, 11 Jun 2008 20:32:02 -0400\n" +
               "From: Tester <tests@mozillamessaging.invalid>\n" +
               "User-Agent: Thunderbird 3.0a2pre (Macintosh/2008052122)\n" +
               "MIME-Version: 1.0\n" +
               "To: recipient@mozillamessaging.invalid\n" +
               "Subject: " + aSubject + "\n" +
               "Content-Type: text/html; charset=ISO-8859-1\n" +
               "Content-Transfer-Encoding: 7bit\n" +
               "\n" + aBody + "\n";

  aFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  aFolder.gettingNewMessages = true;

  aFolder.addMessage(source);
  aFolder.gettingNewMessages = false;

  return aFolder.msgDatabase.getMsgHdrForMessageID(msgId);
}

function addMsgToFolderAndCheckContent(folder, test) {
  let msgDbHdr = addToFolder(test.type + " test message " + gMsgNo,
                             msgBodyStart + test.body + msgBodyEnd, folder);

  // select the newly created message
  let msgHdr = select_click_row(gMsgNo);

  if (msgDbHdr != msgHdr)
    throw new Error("Selected Message Header is not the same as generated header");

  assert_selected_and_displayed(gMsgNo);

  // Now check that the content hasn't been loaded
  if (test.checkDenied) {
    if (test.checkForAllowed(mc.window.content.document.getElementById("testelement"))) {
      throw new Error(test.type + " has not been blocked in message content as expected.");
    }
  } else if (!test.checkForAllowed(mc.window.content.document.getElementById("testelement"))) {
    throw new Error(test.type + " has been unexpectedly blocked in message content.");
  }

  ++gMsgNo;
}

/**
 * Check remote content in a compose window.
 *
 * @param test        The test from TESTS that is being performed.
 * @param replyType   The type of the compose window, set to true for "reply",
 *                    false for "forward".
 * @param loadAllowed Whether or not the load is expected to be allowed.
 */
function checkComposeWindow(test, replyType, loadAllowed) {
  let replyWindow = replyType ? open_compose_with_reply() :
                                open_compose_with_forward();

  if (test.checkForAllowed(
        replyWindow.window.document.getElementById("content-frame")
          .contentDocument.getElementById("testelement")) != loadAllowed)
    throw new Error(test.type + " has not been " +
                    (loadAllowed ? "allowed" : "blocked") +
                    " in reply window as expected.");

  close_compose_window(replyWindow);
}

/**
 * Check remote content in stand-alone message window, and reload
 */
function checkStandaloneMessageWindow(test, loadAllowed) {
  plan_for_new_window("mail:messageWindow");
  // Open it
  set_open_message_behavior("NEW_WINDOW");
  open_selected_message();
  let msgc = wait_for_new_window("mail:messageWindow");
  wait_for_message_display_completion(msgc, true);
  if (test.checkForAllowed(
          msgc.window.content.document.getElementById("testelement")) != loadAllowed)
    throw new Error(test.type + " has not been blocked in message content as expected.");

  // Clean up, close the window
  close_message_window(msgc);
}

/**
 * Check remote content in stand-alone message window loaded from .eml file.
 * Make sure there's a notification bar.
 */
 function checkEMLMessageWindow(test, emlFile) {
  let msgc = open_message_from_file(emlFile);
  if (!msgc.e("mail-notification-top"))
    throw new Error(test.type + " has no content notification bar.");
  if (msgc.e("mail-notification-top").collapsed)
    throw new Error(test.type + " content notification bar not shown.");

  // Clean up, close the window
  close_message_window(msgc);
}

/**
 * Helper method to save one of the test files as an .eml file.
 * @return the file the message was safed to
 */
function saveAsEMLFile(msgNo) {
  let msgHdr = select_click_row(msgNo);
  let messenger = Cc["@mozilla.org/messenger;1"]
                      .createInstance(Ci.nsIMessenger);
  let profD = Services.dirsvc.get("ProfD", Ci.nsIFile);
  let file = os.getFileForPath(
    os.abspath("./content-policy-test-" + msgNo + ".eml", profD));
  messenger.saveAs(msgHdr.folder.getUriForMsg(msgHdr), true, null, file.path, true);
  // no listener for saveAs, though we should add one.
  mc.sleep(5000);
  return file;
}

function allowRemoteContentAndCheck(test) {
  addMsgToFolderAndCheckContent(folder, test);

  plan_for_message_display(mc);

  // Click on the allow remote content button
  const kBoxId = "mail-notification-top";
  const kNotificationValue = "remoteContent";
  wait_for_notification_to_show(mc, kBoxId, kNotificationValue);
  let prefButton = get_notification_button(mc, kBoxId, kNotificationValue,
                                           { popup: "remoteContentOptions" });
  mc.click(new elib.Elem(prefButton));
  mc.click_menus_in_sequence(mc.e("remoteContentOptions"),
                             [{id: "remoteContentOptionAllowForMsg"}]);
  wait_for_notification_to_stop(mc, kBoxId, kNotificationValue);

  wait_for_message_display_completion(mc, true);

  if (!test.checkForAllowed(mc.window.content.document
                              .getElementById("testelement")))
    throw new Error(test.type + " has been unexpectedly blocked in message content");
}

function checkContentTab(test) {
  // To open a tab we're going to have to cheat and use tabmail so we can load
  // in the data of what we want.
  let preCount = mc.tabmail.tabContainer.childNodes.length;

  let newTab = open_content_tab_with_url(url + test.webPage);

  if (!test.checkForAllowed(mc.window.content.document
                              .getElementById("testelement")))
    throw new Error(test.type + " has been unexpectedly blocked in content tab");

  mc.tabmail.closeTab(newTab);

  if (mc.tabmail.tabContainer.childNodes.length != preCount)
    throw new Error("The content tab didn't close");
}

/**
 * Check remote content is not blocked in feed message (flagged with
 * nsMsgMessageFlags::FeedMsg)
 */
function checkAllowFeedMsg(test) {
  let msgDbHdr = addToFolder(test.type + " test feed message " + gMsgNo,
                             msgBodyStart + test.body + msgBodyEnd, folder);
  msgDbHdr.OrFlags(Ci.nsMsgMessageFlags.FeedMsg);

  // select the newly created message
  let msgHdr = select_click_row(gMsgNo);

  assert_equals(msgDbHdr, msgHdr);
  assert_selected_and_displayed(gMsgNo);

  // Now check that the content hasn't been blocked
  if (!test.checkForAllowed(mc.window.content.document.getElementById("testelement"))) {
    throw new Error(test.type + " has been unexpectedly blocked in feed message content.");
  }

  ++gMsgNo;
}

/**
 * Check remote content is not blocked for a sender with permissions.
 */
function checkAllowForSenderWithPerms(test) {
  let msgDbHdr = addToFolder(test.type + " priv sender test message " + gMsgNo,
                             msgBodyStart + test.body + msgBodyEnd, folder);

  let addresses = {};
  MailServices.headerParser.parseHeadersWithArray(msgDbHdr.author, addresses, {}, {});
  let authorEmailAddress = addresses.value[0];

  let uri = Services.io.newURI("chrome://messenger/content/email=" + authorEmailAddress);
  Services.perms.add(uri, "image", Services.perms.ALLOW_ACTION);
  assert_true(Services.perms.testPermission(uri, "image") ==
              Services.perms.ALLOW_ACTION);

  // select the newly created message
  let msgHdr = select_click_row(gMsgNo);

  assert_equals(msgDbHdr, msgHdr);
  assert_selected_and_displayed(gMsgNo);

  // Now check that the content hasn't been blocked
  if (!test.checkForAllowed(mc.window.content.document.getElementById("testelement"))) {
    throw new Error(`${test.type} has been unexpectedly blocked for sender=${authorEmailAddress}`);
  }

  // Clean up after ourselves, and make sure that worked as expected.
  Services.perms.remove(uri, "image");
  assert_true(Services.perms.testPermission(uri, "image") ==
              Services.perms.UNKNOWN_ACTION);

  ++gMsgNo;
}

/**
 * Check remote content is not blocked for a hosts with permissions.
 */
function checkAllowForHostsWithPerms(test) {
  let msgDbHdr = addToFolder(test.type + " priv host test message " + gMsgNo,
                             msgBodyStart + test.body + msgBodyEnd, folder);

  // Select the newly created message.
  let msgHdr = select_click_row(gMsgNo);
  assert_equals(msgDbHdr, msgHdr);
  assert_selected_and_displayed(gMsgNo);

  let src = mc.window.content.document.getElementById("testelement").src;

  if (!src.startsWith("http"))
    return; // just test http in this test

  let uri = Services.io.newURI(src);
  Services.perms.add(uri, "image", Services.perms.ALLOW_ACTION);
  assert_true(Services.perms.testPermission(uri, "image") ==
              Services.perms.ALLOW_ACTION);

  // Click back one msg, then the original again, which should now allow loading.
  select_click_row(gMsgNo - 1);
  // Select the newly created message.
  msgHdr = select_click_row(gMsgNo);
  assert_equals(msgDbHdr, msgHdr);
  assert_selected_and_displayed(gMsgNo);

  // Now check that the content hasn't been blocked.
  if (!test.checkForAllowed(mozmill.getMail3PaneController()
           .window.content.document.getElementById("testelement")))
    throw new Error(test.type + " has been unexpectedly blocked for url=" +
                    uri.spec);

  // Clean up after ourselves, and make sure that worked as expected.
  Services.perms.remove(uri, "image");
  assert_true(Services.perms.testPermission(uri, "image") ==
              Services.perms.UNKNOWN_ACTION);

  ++gMsgNo;
}

function test_generalContentPolicy() {
  be_in_folder(folder);

  assert_nothing_selected();

  for (let i = 0; i < TESTS.length; ++i) {
    // Check for denied in mail
    addMsgToFolderAndCheckContent(folder, TESTS[i]);

    if (TESTS[i].checkDenied) {
      // Check denied in reply window
      checkComposeWindow(TESTS[i], true, false);

      // Check denied in forward window
      checkComposeWindow(TESTS[i], false, false);

      if (i == 0) {
        // Now check that image is visible after site is whitelisted.
        // We do the first test which is the one with the image.

        // Add the site to the whitelist.
        let src = mc.window.content.document.getElementById("testelement").src;

        let uri = Services.io.newURI(src);
        Services.perms.add(uri, "image", Services.perms.ALLOW_ACTION);
        assert_equals(Services.perms.testPermission(uri, "image"),
                      Services.perms.ALLOW_ACTION);

        // Check allowed in reply window
        checkComposeWindow(TESTS[i], true, true);

        // Check allowed in forward window
        checkComposeWindow(TESTS[i], false, true);

        // Clean up after ourselves, and make sure that worked as expected.
        Services.perms.remove(uri, "image");
        assert_equals(Services.perms.testPermission(uri, "image"),
                      Services.perms.UNKNOWN_ACTION);
      }

      // Check denied in standalone message window
      checkStandaloneMessageWindow(TESTS[i], false);

      // Now allow the remote content and check result
      allowRemoteContentAndCheck(TESTS[i]);
    }

    // Check allowed in reply window
    checkComposeWindow(TESTS[i], true, true);

    // Check allowed in forward window
    checkComposeWindow(TESTS[i], false, true);

    // Check allowed in standalone message window
    checkStandaloneMessageWindow(TESTS[i], true);

    // Check allowed in content tab
    checkContentTab(TESTS[i]);

    // Check allowed in a feed message
    checkAllowFeedMsg(TESTS[i]);

    // Check per sender privileges.
    checkAllowForSenderWithPerms(TESTS[i]);

    // Check per host privileges.
    checkAllowForHostsWithPerms(TESTS[i]);

    // Only want to do this for the first test case, which is a remote image.
    if (i == 0) {
      let emlFile = saveAsEMLFile(i);
      checkEMLMessageWindow(TESTS[i], emlFile);
      emlFile.remove(false);
    }
  }
}

// Copied from test-blocked-content.js.
function putHTMLOnClipboard(html) {
  let trans = Cc["@mozilla.org/widget/transferable;1"]
                .createInstance(Ci.nsITransferable);

  // Register supported data flavors
  trans.init(null);
  trans.addDataFlavor("text/html");

  let wapper = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
  wapper.data = html;
  trans.setTransferData("text/html", wapper, wapper.data.length * 2);

  Services.clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
}

function subtest_insertImageIntoReplyForward(aReplyType) {
  let msgDbHdr = addToFolder("Test insert image into reply or forward",
                             "Stand by for image insertion ;-)",
                             folder);
  gMsgNo++;

  // Select the newly created message.
  be_in_folder(folder);
  let msgHdr = select_click_row(gMsgNo);

  if (msgDbHdr != msgHdr)
    throw new Error("Selected Message Header is not the same as generated header");

  assert_selected_and_displayed(gMsgNo);

  let replyWindow = aReplyType ? open_compose_with_reply() :
                                 open_compose_with_forward();

  // Now insert the image
  // (copied from test-compose-mailto.js:test_checkInsertImage()).

  // First focus on the editor element
  replyWindow.e("content-frame").focus();

  // Now open the image window
  plan_for_modal_dialog("imageDlg",
    function insert_image(mwc) {
      // Insert the url of the image.
      let srcloc = mwc.window.document.getElementById("srcInput");
      srcloc.focus();

      input_value(mwc, url + "pass.png");
      mwc.sleep(0);

      // Don't add alternate text
      mwc.click(mwc.eid("noAltTextRadio"));

      // Accept the dialog
      mwc.window.document.getElementById("imageDlg").acceptDialog();
    });
  replyWindow.click(replyWindow.eid("insertImage"));

  wait_for_modal_dialog();
  wait_for_window_close();

  // Paste an image.
  putHTMLOnClipboard("<img id='tmp-img' src='" + url + "pass.png' />");

  // Ctrl+V = Paste
  replyWindow.keypress(null, "v", {shiftKey: false, accelKey: true});

  // Now wait for the paste.
  replyWindow.waitFor(function() {
    let img = replyWindow.e("content-frame").contentDocument.getElementById("tmp-img");
    return (img != null);
  }, "Timeout waiting for pasted tmp image to be loaded ok");

  // Test that the image load has not been denied
  let childImages = replyWindow.e("content-frame").contentDocument.getElementsByTagName("img");

  if (childImages.length != 2)
    throw new Error("Expecting one image in document, actually have " + childImages.length);

  // Check both images.
  if (childImages[0].QueryInterface(Ci.nsIImageLoadingContent)
                    .imageBlockingStatus != Ci.nsIContentPolicy.ACCEPT)
    throw new Error("Loading of image has been unexpectedly blocked (1)");
  if (childImages[1].QueryInterface(Ci.nsIImageLoadingContent)
                    .imageBlockingStatus != Ci.nsIContentPolicy.ACCEPT)
    throw new Error("Loading of image has been unexpectedly blocked (2)");

  close_compose_window(replyWindow);
}

function test_insertImageIntoReply() {
  subtest_insertImageIntoReplyForward(true);
}

function test_insertImageIntoForward() {
  subtest_insertImageIntoReplyForward(false);
}

