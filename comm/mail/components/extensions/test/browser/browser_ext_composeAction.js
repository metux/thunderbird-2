/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gAccount;

async function openComposeWindow() {
  let params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                 .createInstance(Ci.nsIMsgComposeParams);
  let composeFields = Cc["@mozilla.org/messengercompose/composefields;1"]
                        .createInstance(Ci.nsIMsgCompFields);

  params.identity = gAccount.defaultIdentity;
  params.composeFields = composeFields;

  await new Promise(resolve => {
    let observer = {
      observe(subject, topic, data) {
        Services.ww.unregisterNotification(observer);
        subject.addEventListener("load", () => {
          promiseAnimationFrame().then(resolve);
        }, { once: true });
      },
    };
    Services.ww.registerNotification(observer);
    MailServices.compose.OpenComposeWindowWithParams(null, params);
  });
  return Services.wm.getMostRecentWindow("msgcompose");
}

async function test_it(extensionDetails, toolbarId) {
  let extension = ExtensionTestUtils.loadExtension(extensionDetails);
  let buttonId = "test1_mochi_test-composeAction-toolbarbutton";

  await extension.startup();
  await extension.awaitMessage();

  let composeWindow = await openComposeWindow();
  let composeDocument = composeWindow.document;
  await promiseAnimationFrame(composeWindow);

  try {
    let toolbar = composeDocument.getElementById(toolbarId);
    ok(!toolbar.getAttribute("currentset"), "No toolbar current set");

    let button = composeDocument.getElementById(buttonId);
    ok(button, "Button created");
    is(getComputedStyle(button).MozBinding,
      `url("chrome://global/content/bindings/toolbarbutton.xml#toolbarbutton-badged")`);
    is(toolbar.id, button.parentNode.id, "Button added to toolbar");
    ok(toolbar.currentSet.split(",").includes(buttonId), "Button added to toolbar current set");

    let icon = composeDocument.getAnonymousElementByAttribute(button, "class", "toolbarbutton-icon");
    is(getComputedStyle(icon).listStyleImage,
       `url("chrome://messenger/content/extension.svg")`, "Default icon");
    let label = composeDocument.getAnonymousElementByAttribute(
      button, "class", "toolbarbutton-text"
    );
    is(label.value, "This is a test", "Correct label");

    EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 }, composeWindow);
    await extension.awaitFinish("composeAction");
    await promiseAnimationFrame(composeWindow);

    is(composeDocument.getElementById(buttonId), button);
    label = composeDocument.getAnonymousElementByAttribute(
      button, "class", "toolbarbutton-text"
    );
    is(label.value, "New title", "Correct label");
  } finally {
    await extension.unload();
    await promiseAnimationFrame(composeWindow);
    ok(!composeDocument.getElementById(buttonId), "Button destroyed");
    composeWindow.close();
  }
}

add_task(async function setup() {
  gAccount = createAccount();
  addIdentity(gAccount);
  let rootFolder = gAccount.incomingServer.rootFolder;

  window.gFolderTreeView.selectFolder(rootFolder);
  await new Promise(resolve => executeSoon(resolve));
});

add_task(async function the_test() {
  async function background_nopopup() {
    browser.test.log("nopopup background script ran");
    browser.composeAction.onClicked.addListener(async () => {
      await browser.composeAction.setTitle({ title: "New title" });
      await new Promise(setTimeout);
      browser.test.notifyPass("composeAction");
    });
    browser.test.sendMessage();
  }

  async function background_popup() {
    browser.test.log("popup background script ran");
    browser.runtime.onMessage.addListener(async (msg) => {
      browser.test.assertEq("popup.html", msg);
      await browser.composeAction.setTitle({ title: "New title" });
      await new Promise(setTimeout);
      browser.test.notifyPass("composeAction");
    });
    browser.test.sendMessage();
  }

  let extensionDetails = {
    background: background_nopopup,
    files: {
      "popup.html": `<html>
          <head>
            <meta charset="utf-8">
            <script src="popup.js"></script>
          </head>
          <body>popup.js</body>
        </html>`,
      "popup.js": function() {
        window.onload = async () => {
          await browser.runtime.sendMessage("popup.html");
          window.close();
        };
      },
    },
    manifest: {
      applications: {
        gecko: {
          id: "test1@mochi.test",
        },
      },
      compose_action: {
        default_title: "This is a test",
      },
    },
  };

  await test_it(extensionDetails, "composeToolbar2");

  extensionDetails.background = background_popup;
  extensionDetails.manifest.compose_action.default_popup = "popup.html";
  await test_it(extensionDetails, "composeToolbar2");

  extensionDetails.background = background_nopopup;
  extensionDetails.manifest.compose_action.default_area = "formattoolbar";
  delete extensionDetails.manifest.compose_action.default_popup;
  await test_it(extensionDetails, "FormatToolbar");

  extensionDetails.background = background_popup;
  extensionDetails.manifest.compose_action.default_popup = "popup.html";
  await test_it(extensionDetails, "FormatToolbar");
});
