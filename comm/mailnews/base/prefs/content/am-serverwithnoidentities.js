/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {BrowserUtils} = ChromeUtils.import("resource://gre/modules/BrowserUtils.jsm");

var gAccount;
var gOriginalStoreType;

/**
 * Called when the store type menu is clicked.
 * @param {Object} aStoreTypeElement - store type menu list element.
 */
function clickStoreTypeMenu(aStoreTypeElement) {
  if (aStoreTypeElement.value == gOriginalStoreType) {
    return;
  }

  // Response from migration dialog modal. If the conversion is complete
  // 'response.newRootFolder' will hold the path to the new account root folder,
  // otherwise 'response.newRootFolder' will be null.
  let response = { newRootFolder: null };
  // Send 'response' as an argument to converterDialog.xhtml.
  window.openDialog("converterDialog.xhtml", "mailnews:mailstoreconverter",
                    "modal,centerscreen,resizable=no,width=700,height=130",
                    gAccount.incomingServer,
                    aStoreTypeElement.value, response);
  changeStoreType(response);
}

/**
 * Revert store type to the original store type if converter modal closes
 * before migration is complete, otherwise change original store type to
 * currently selected store type.
 * @param {Object} aResponse - response from migration dialog modal.
 */
function changeStoreType(aResponse) {
  if (aResponse.newRootFolder) {
    // The conversion is complete.
    // Set local path to the new account root folder which is present
    // in 'aResponse.newRootFolder'.
    document.getElementById("server.localPath").value = aResponse.newRootFolder;
    gOriginalStoreType = document.getElementById("server.storeTypeMenulist")
                                 .value;
    BrowserUtils.restartApplication();
  } else {
    // The conversion failed or was cancelled.
    // Restore selected item to what was selected before conversion.
    document.getElementById("server.storeTypeMenulist").value =
      gOriginalStoreType;
  }
}

function onInit(aPageId, aServerId) {
  // UI for account store type
  let storeTypeElement = document.getElementById("server.storeTypeMenulist");
  // set the menuitem to match the account
  let currentStoreID = document.getElementById("server.storeContractID")
                               .getAttribute("value");
  let targetItem = storeTypeElement.getElementsByAttribute("value", currentStoreID);
  storeTypeElement.selectedItem = targetItem[0];
  // Disable store type change if store has not been used yet.
  storeTypeElement.setAttribute("disabled",
    gAccount.incomingServer.getBoolValue("canChangeStoreType") ?
      "false" : !Services.prefs.getBoolPref("mail.store_conversion_enabled"));
  // Initialise 'gOriginalStoreType' to the item that was originally selected.
  gOriginalStoreType = storeTypeElement.value;
}

function onPreInit(account, accountValues) {
  gAccount = account;
}

function onSave() {
  let storeContractID = document.getElementById("server.storeTypeMenulist")
                                .selectedItem
                                .value;
  document.getElementById("server.storeContractID")
          .setAttribute("value", storeContractID);
}

