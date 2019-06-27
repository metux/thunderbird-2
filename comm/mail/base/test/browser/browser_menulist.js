/* import-globals-from ../../content/utilityOverlay.js */

add_task(async () => {
  let TEST_DOCUMENT_URL = getRootDirectory(gTestPath) + "files/menulist.xul";
  let testDocument = await new Promise(resolve => {
    Services.obs.addObserver(function documentLoaded(subject) {
      if (subject.URL == TEST_DOCUMENT_URL) {
        Services.obs.removeObserver(documentLoaded, "chrome-document-loaded");
        resolve(subject);
      }
    }, "chrome-document-loaded");
    openContentTab(TEST_DOCUMENT_URL);
  });
  ok(testDocument.URL == TEST_DOCUMENT_URL);
  let testWindow = testDocument.ownerGlobal;
  let MENULIST_CLASS = testWindow.customElements.get("menulist");
  let MENULIST_EDITABLE_CLASS = testWindow.customElements.get("menulist-editable");

  let menulists = testDocument.querySelectorAll("menulist");
  is(menulists.length, 3);

  // Menulist 0 is an ordinary, non-editable menulist.
  ok(menulists[0] instanceof MENULIST_CLASS);
  ok(!(menulists[0] instanceof MENULIST_EDITABLE_CLASS));
  ok(!("editable" in menulists[0]));

  // Menulist 1 is an editable menulist, but not in editing mode.
  ok(menulists[1] instanceof MENULIST_CLASS);
  ok(menulists[1] instanceof MENULIST_EDITABLE_CLASS);
  ok("editable" in menulists[1]);
  ok(!menulists[1].editable);

  // Menulist 2 is an editable menulist, in editing mode.
  ok(menulists[2] instanceof MENULIST_CLASS);
  ok(menulists[2] instanceof MENULIST_EDITABLE_CLASS);
  ok("editable" in menulists[2]);
  ok(menulists[2].editable);

  // Okay, let's check the focus order.
  let testBrowser = document.getElementById("tabmail").currentTabInfo.browser;
  EventUtils.synthesizeMouseAtCenter(testBrowser, { clickCount: 1 });
  await new Promise(resolve => setTimeout(resolve));

  let beforeButton = testDocument.querySelector("button#before");
  beforeButton.focus();
  is(testDocument.activeElement, beforeButton);

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: false }, testWindow);
  is(testDocument.activeElement, menulists[0]);

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: false }, testWindow);
  is(testDocument.activeElement, menulists[1]);

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: false }, testWindow);
  is(testDocument.activeElement, menulists[2]);

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: false }, testWindow);
  is(testDocument.activeElement.closest("textbox"), menulists[2]._inputField);

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: false }, testWindow);
  is(testDocument.activeElement, testDocument.querySelector("button#after"));

  // Now go back again.
  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, testWindow);
  is(testDocument.activeElement.closest("textbox"), menulists[2]._inputField);

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, testWindow);
  is(testDocument.activeElement, menulists[2]);

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, testWindow);
  is(testDocument.activeElement, menulists[1]);

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, testWindow);
  is(testDocument.activeElement, menulists[0]);

  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, testWindow);
  is(testDocument.activeElement, beforeButton);

  // The dropmarker should open and close the popup.
  EventUtils.synthesizeMouseAtCenter(menulists[2]._dropmarker, { clickCount: 1 }, testWindow);
  await new Promise(resolve => setTimeout(resolve));
  ok(menulists[2].hasAttribute("open"));

  EventUtils.synthesizeMouseAtCenter(menulists[2]._dropmarker, { clickCount: 1 }, testWindow);
  await new Promise(resolve => setTimeout(resolve));
  ok(!menulists[2].hasAttribute("open"));

  // Open the popup and choose an item.
  EventUtils.synthesizeMouseAtCenter(menulists[2]._dropmarker, { clickCount: 1 }, testWindow);
  await new Promise(resolve => setTimeout(resolve));
  ok(menulists[2].hasAttribute("open"));

  await new Promise(resolve => {
    menulists[2].addEventListener("select", () => setTimeout(resolve), { once: true });
    EventUtils.synthesizeMouseAtCenter(
      menulists[2].querySelectorAll("menuitem")[0],
      { clickCount: 1 },
      testWindow
    );
  });
  ok(!menulists[2].hasAttribute("open"));
  is(testDocument.activeElement.closest("textbox"), menulists[2]._inputField);
  is(menulists[2]._inputField.value, "foo");
  is(menulists[2].value, "foo");
  is(menulists[2].getAttribute("value"), "foo");

  // Again.
  EventUtils.synthesizeMouseAtCenter(menulists[2]._dropmarker, { clickCount: 1 }, testWindow);
  await new Promise(resolve => setTimeout(resolve));
  ok(menulists[2].hasAttribute("open"));

  await new Promise(resolve => {
    menulists[2].addEventListener("select", () => setTimeout(resolve), { once: true });
    EventUtils.synthesizeMouseAtCenter(
      menulists[2].querySelectorAll("menuitem")[1],
      { clickCount: 1 },
      testWindow
    );
  });
  ok(!menulists[2].hasAttribute("open"));
  is(testDocument.activeElement.closest("textbox"), menulists[2]._inputField);
  is(menulists[2]._inputField.value, "bar");
  is(menulists[2].value, "bar");
  is(menulists[2].getAttribute("value"), "bar");

  // Type in a value.
  is(menulists[2]._inputField.selectionStart, 0);
  is(menulists[2]._inputField.selectionEnd, 3);
  EventUtils.sendString("quux", testWindow);
  await new Promise(resolve => {
    menulists[2].addEventListener("change", (event) => {
      is(event.target, menulists[2]);
      resolve();
    }, { once: true });
    EventUtils.synthesizeKey("VK_TAB", { shiftKey: false }, testWindow);
  });
  is(menulists[2].value, "quux");
  is(menulists[2].getAttribute("value"), "quux");

  // Open the popup and choose an item.
  EventUtils.synthesizeMouseAtCenter(menulists[2]._dropmarker, { clickCount: 1 }, testWindow);
  await new Promise(resolve => setTimeout(resolve));
  ok(menulists[2].hasAttribute("open"));

  await new Promise(resolve => {
    menulists[2].addEventListener("select", () => setTimeout(resolve), { once: true });
    EventUtils.synthesizeMouseAtCenter(
      menulists[2].querySelectorAll("menuitem")[0],
      { clickCount: 1 },
      testWindow
    );
  });
  ok(!menulists[2].hasAttribute("open"));
  is(testDocument.activeElement.closest("textbox"), menulists[2]._inputField);
  is(menulists[2]._inputField.value, "foo");
  is(menulists[2].value, "foo");
  is(menulists[2].getAttribute("value"), "foo");
});
