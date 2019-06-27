/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  await testCheckboxes("paneCompose", "generalTab", {
    checkboxID: "addExtension",
    pref: "mail.forward_add_extension",
  }, {
    checkboxID: "autoSave",
    pref: "mail.compose.autosave",
    enabledElements: ["#autoSaveInterval"],
  }, {
    checkboxID: "mailWarnOnSendAccelKey",
    pref: "mail.warn_on_send_accel_key",
  }, {
    checkboxID: "attachment_reminder_label",
    pref: "mail.compose.attachment_reminder",
    enabledElements: ["#attachment_reminder_button"],
  }, {
    checkboxID: "useReaderDefaults",
    pref: "msgcompose.default_colors",
    enabledInverted: true,
    enabledElements: [
      "#textColorLabel",
      "#textColorButton",
      "#backgroundColorLabel",
      "#backgroundColorButton",
    ],
  }, {
    checkboxID: "defaultToParagraph",
    pref: "mail.compose.default_to_paragraph",
  });

  await testCheckboxes("paneCompose", "addressingTab", {
    checkboxID: "addressingAutocomplete",
    pref: "mail.enable_autocomplete",
  }, {
    checkboxID: "autocompleteLDAP",
    pref: "ldap_2.autoComplete.useDirectory",
    enabledElements: ["#directoriesList", "#editButton"],
  }, {
    checkboxID: "emailCollectionOutgoing",
    pref: "mail.collect_email_address_outgoing",
    enabledElements: ["#localDirectoriesList"],
  });

  await testCheckboxes("paneCompose", "spellingTab", {
    checkboxID: "spellCheckBeforeSend",
    pref: "mail.SpellCheckBeforeSend",
  }, {
    checkboxID: "inlineSpellCheck",
    pref: "mail.spellcheck.inline",
  });
});
