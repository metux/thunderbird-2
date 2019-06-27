/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {
  fixIterator,
} = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gOkButton;
var gNameInput;
var gDirectory = null;

var kPersonalAddressbookURI = "moz-abmdbdirectory://abook.mab";
var kCollectedAddressbookURI = "moz-abmdbdirectory://history.mab";
var kAllDirectoryRoot = "moz-abdirectory://";
var kPABDirectory = 2; // defined in nsDirPrefs.h

document.addEventListener("dialogaccept", abNameOKButton);

function abNameOnLoad() {
  // Get the document elements.
  gOkButton = document.documentElement.getButton("accept");
  gNameInput = document.getElementById("name");

  // look in arguments[0] for parameters to see if we have a directory or not
  if ("arguments" in window && window.arguments[0] &&
      "selectedDirectory" in window.arguments[0]) {
    gDirectory = window.arguments[0].selectedDirectory;
    gNameInput.value = gDirectory.dirName;
  }

  // Work out the window title (if we have a directory specified, then it's a
  // rename).
  var bundle = document.getElementById("bundle_addressBook");

  if (gDirectory) {
    let oldListName = gDirectory.dirName;
    document.title = bundle.getFormattedString("addressBookTitleEdit", [oldListName]);
  } else {
    document.title = bundle.getString("addressBookTitleNew");
  }

  if (gDirectory &&
     (gDirectory.URI == kCollectedAddressbookURI ||
       gDirectory.URI == kPersonalAddressbookURI ||
       gDirectory.URI == kAllDirectoryRoot + "?")) {
    // Address book name is not editable, therefore disable the field and
    // only have an ok button that doesn't do anything.
    gNameInput.readOnly = true;
    document.documentElement.buttons = "accept";
    document.documentElement.removeAttribute("ondialogaccept");
  } else {
    gNameInput.focus();
    abNameDoOkEnabling();
  }
}

function abNameOKButton(event) {
  var newName = gNameInput.value.trim();

  // Do not allow an already existing name.
  for (let ab of fixIterator(MailServices.ab.directories,
                             Ci.nsIAbDirectory)) {
    if ((ab.dirName.toLowerCase() == newName.toLowerCase()) &&
        (!gDirectory || (ab.URI != gDirectory.URI))) {
      const kAlertTitle = document.getElementById("bundle_addressBook")
                                  .getString("duplicateNameTitle");
      const kAlertText = document.getElementById("bundle_addressBook")
                                 .getFormattedString("duplicateNameText", [ab.dirName]);
      Services.prompt.alert(window, kAlertTitle, kAlertText);
      event.preventDefault();
      return;
    }
  }

  // Either create a new directory or update an existing one depending on what
  // we were given when we started.
  if (gDirectory)
    gDirectory.dirName = newName;
  else
    MailServices.ab.newAddressBook(newName, "", kPABDirectory);
}

function abNameDoOkEnabling() {
  gOkButton.disabled = gNameInput.value.trim() == "";
}
