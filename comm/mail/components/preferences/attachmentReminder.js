/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gAttachmentReminderOptionsDialog = {
  keywordListBox: null,
  bundle: null,

  init() {
    this.keywordListBox = document.getElementById("keywordList");
    this.bundle = document.getElementById("bundlePreferences");
    this.buildKeywordList();
  },

  buildKeywordList() {
    var keywordsInCsv = Services.prefs
      .getComplexValue("mail.compose.attachment_reminder_keywords",
                       Ci.nsIPrefLocalizedString);
    if (!keywordsInCsv)
      return;
    keywordsInCsv = keywordsInCsv.data;
    var keywordsInArr = keywordsInCsv.split(",");
    for (let i = 0; i < keywordsInArr.length; i++) {
      if (keywordsInArr[i])
        this.keywordListBox.appendItem(keywordsInArr[i], keywordsInArr[i]);
    }
    if (keywordsInArr.length)
      this.keywordListBox.selectedIndex = 0;
  },

  addKeyword() {
    var input = {value: ""}; // Default to empty.
    var ok = Services.prompt.prompt(window,
                                    this.bundle.getString("attachmentReminderNewDialogTitle"),
                                    this.bundle.getString("attachmentReminderNewText"),
                                    input, null, {value: 0});
    if (ok && input.value) {
      let newKey = this.keywordListBox.appendItem(input.value, input.value);
      this.keywordListBox.ensureElementIsVisible(newKey);
      this.keywordListBox.selectItem(newKey);
    }
  },

  editKeyword() {
    if (this.keywordListBox.selectedIndex < 0)
      return;
    var keywordToEdit = this.keywordListBox.selectedItem;
    var input = {value: keywordToEdit.getAttribute("value")};
    var ok = Services.prompt.prompt(window,
                                    this.bundle.getString("attachmentReminderEditDialogTitle"),
                                    this.bundle.getString("attachmentReminderEditText"),
                                    input, null, {value: 0});
    if (ok && input.value) {
      this.keywordListBox.selectedItem.value = input.value;
      this.keywordListBox.selectedItem.label = input.value;
    }
  },

  removeKeyword() {
    if (this.keywordListBox.selectedIndex < 0)
      return;
    this.keywordListBox.selectedItem.remove();
  },

  saveKeywords() {
    var keywordList = "";
    for (var i = 0; i < this.keywordListBox.getRowCount(); i++) {
      keywordList += this.keywordListBox.getItemAtIndex(i).getAttribute("value");
      if (i != this.keywordListBox.getRowCount() - 1)
        keywordList += ",";
    }

    Services.prefs.setStringPref("mail.compose.attachment_reminder_keywords",
                                 keywordList);
  },
};

document.addEventListener("dialogaccept", () => gAttachmentReminderOptionsDialog.saveKeywords());
