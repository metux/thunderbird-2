/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../base/content/commandglue.js */

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {
  MailViewConstants,
} = ChromeUtils.import("resource:///modules/MailViewManager.jsm");

// these constants are now authoritatively defined in MailViewManager.jsm (above)
// tag views have kViewTagMarker + their key as value
var kViewItemAll         = MailViewConstants.kViewItemAll;
var kViewItemUnread      = MailViewConstants.kViewItemUnread;
var kViewItemTags        = MailViewConstants.kViewItemTags; // former labels used values 2-6
var kViewItemNotDeleted  = MailViewConstants.kViewItemNotDeleted;
// not a real view! a sentinel value to pop up a dialog
var kViewItemVirtual     = MailViewConstants.kViewItemVirtual;
// not a real view! a sentinel value to pop up a dialog
var kViewItemCustomize   = MailViewConstants.kViewItemCustomize;
var kViewItemFirstCustom = MailViewConstants.kViewItemFirstCustom;

var kViewCurrent    = MailViewConstants.kViewCurrent;
var kViewCurrentTag = MailViewConstants.kViewCurrentTag;
var kViewTagMarker  = MailViewConstants.kViewTagMarker;

/**
 * A reference to the nsIMsgMailViewList service that tracks custom mail views.
 */
var gMailViewList = null;

// perform the view/action requested by the aValue string
// and set the view picker label to the aLabel string
function ViewChange(aValue) {
  if (aValue == kViewItemCustomize || aValue == kViewItemVirtual) {
    // restore to the previous view value, in case they cancel
    ViewPickerBinding.updateDisplay();
    if (aValue == kViewItemCustomize)
      LaunchCustomizeDialog();
    else
      gFolderTreeController.newVirtualFolder(
        ViewPickerBinding.currentViewLabel,
        gFolderDisplay.view.search.viewTerms);
    return;
  }

  // tag menuitem values are of the form :<keyword>
  if (isNaN(aValue)) {
    // split off the tag key
    var tagkey = aValue.substr(kViewTagMarker.length);
    gFolderDisplay.view.setMailView(kViewItemTags, tagkey);
  } else {
    var numval = Number(aValue);
    gFolderDisplay.view.setMailView(numval, null);
  }
  ViewPickerBinding.updateDisplay();
}


function ViewChangeByMenuitem(aMenuitem) {
  // Mac View menu menuitems don't have XBL bindings
  ViewChange(aMenuitem.getAttribute("value"));
}

/**
 * Mediates interaction with the #viewPickerPopup.  In theory this should be
 *  an XBL binding, but for the insanity where the view picker may not be
 *  visible at all times (or ever).  No view picker widget, no binding.
 */
var ViewPickerBinding = {
  _init() {
    window.addEventListener(
      "MailViewChanged",
      function(aEvent) { ViewPickerBinding.updateDisplay(aEvent); });
  },

  /**
   * Return true if the view picker is visible.  This is used by the
   *  FolderDisplayWidget to know whether or not to actually use mailviews. (The
   *  idea is that if we are not visible, then it would be confusing to the user
   *  if we filtered their mail since they would have no feedback about this and
   *  no way to change it.)
   */
  get isVisible() {
    return document.getElementById("viewPicker") != null;
  },

  /**
   * Return the string value representing the current mail view value as
   * understood by the view picker widgets.  The value is the index for
   * everything but tags.  for tags it's the ":"-prefixed tagname.
   */
  get currentViewValue() {
    if (gFolderDisplay.view.mailViewIndex == kViewItemTags)
      return kViewTagMarker + gFolderDisplay.view.mailViewData;
    return gFolderDisplay.view.mailViewIndex + "";
  },

  /**
   * @return The label for the current mail view value.
   */
  get currentViewLabel() {
    let viewPicker = document.getElementById("viewPicker");
    return viewPicker.getAttribute("label");
  },

  /**
   * The effective view has changed, update the widget.
   */
  updateDisplay(event) {
    let viewPicker = document.getElementById("viewPicker");
    if (viewPicker) {
      let value = this.currentViewValue;

      let viewPickerPopup = document.getElementById("viewPickerPopup");
      let selectedItem =
        viewPickerPopup.querySelector('[value="' + value + '"]');
      if (!selectedItem) {
        // We may have a new item, so refresh to make it show up.
        RefreshAllViewPopups(viewPickerPopup, true);
        selectedItem = viewPickerPopup.querySelector('[value="' + value + '"]');
      }
      viewPicker.setAttribute("label",
                              selectedItem && selectedItem.getAttribute("label"));
    }
  },
};
ViewPickerBinding._init();

function LaunchCustomizeDialog() {
  OpenOrFocusWindow({}, "mailnews:mailviewlist", "chrome://messenger/content/mailViewList.xul");
}

/**
 * All of these Refresh*ViewPopup* methods have to deal with several menu
 * instances. For example, the "View... Messages" menu, the view picker menu
 * list in the toolbar, in appmenu/View/Messages, etc.
 *
 * @param {Element} viewPopup  A menu popup element.
 */
function RefreshAllViewPopups(viewPopup) {
  RefreshViewPopup(viewPopup);
  let menupopups = viewPopup.getElementsByTagName("menupopup");
  if (menupopups.length > 1) {
    // When we have menupopups, we assume both tags and custom views are there.
    RefreshTagsPopup(menupopups[0]);
    RefreshCustomViewsPopup(menupopups[1]);
  }
}

/**
 * Refresh the view messages popup menu/panel. For example set checked and
 * hidden state on menu items. Used for example for appmenu/View/Messages panel.
 *
 * @param {Element} viewPopup  A menu popup element.
 */
function RefreshViewPopup(viewPopup) {
  // Mark default views if selected.
  let currentViewValue = ViewPickerBinding.currentViewValue;

  let viewAll = viewPopup.querySelector('[value="' + kViewItemAll + '"]');
  viewAll.setAttribute("checked", currentViewValue == kViewItemAll);

  let viewUnread = viewPopup.querySelector('[value="' + kViewItemUnread + '"]');
  viewUnread.setAttribute("checked", currentViewValue == kViewItemUnread);

  let viewNotDeleted =
    viewPopup.querySelector('[value="' + kViewItemNotDeleted + '"]');

  let folderArray = GetSelectedMsgFolders();
  if (folderArray.length == 0) {
    return;
  }

  // Only show the "Not Deleted" item for IMAP servers that are using the IMAP
  // delete model.
  viewNotDeleted.setAttribute("hidden", true);
  var msgFolder = folderArray[0];
  var server = msgFolder.server;
  if (server.type == "imap") {
    let imapServer = server.QueryInterface(Ci.nsIImapIncomingServer);

    if (imapServer.deleteModel == Ci.nsMsgImapDeleteModels.IMAPDelete) {
      viewNotDeleted.setAttribute("hidden", false);
      viewNotDeleted.setAttribute("checked",
        currentViewValue == kViewItemNotDeleted);
    }
  }
}

/**
 * Refresh the contents of the custom views popup menu/panel.
 * Used for example for appmenu/View/Messages/CustomViews panel.
 *
 * @param {Element} parent        Parent element that will recieve the menu items.
 * @param {string} [elementName]  Type of menu items to create (e.g. "menuitem", "toolbarbutton").
 * @param {string} [classes]      Classes to set on the menu items.
 */
function RefreshCustomViewsPopup(parent, elementName = "menuitem", classes) {
  if (!gMailViewList) {
    gMailViewList = Cc["@mozilla.org/messenger/mailviewlist;1"]
                      .getService(Ci.nsIMsgMailViewList);
  }

  // Remove all menu items.
  while (parent.hasChildNodes()) {
    parent.lastChild.remove();
  }

  // Rebuild the list.
  const currentView = ViewPickerBinding.currentViewValue;
  const numItems = gMailViewList.mailViewCount;

  for (let i = 0; i < numItems; ++i) {
    const viewInfo = gMailViewList.getMailViewAt(i);
    const item = document.createXULElement(elementName);

    item.setAttribute("label", viewInfo.prettyName);
    item.setAttribute("value", kViewItemFirstCustom + i);
    item.setAttribute("type", "radio");

    if (classes) {
      item.setAttribute("class", classes);
    }
    if (kViewItemFirstCustom + i == currentView) {
      item.setAttribute("checked", true);
    }
    parent.appendChild(item);
  }
}

/**
 * Refresh the contents of the tags popup menu/panel. For example, used for
 * appmenu/View/Messages/Tags.
 *
 * @param {Element} parent        Parent element that will recieve the menu items.
 * @param {string} [elementName]  Type of menu items to create (e.g. "menuitem", "toolbarbutton").
 * @param {string} [classes]      Classes to set on the menu items.
 */
function RefreshTagsPopup(parent, elementName = "menuitem", classes) {
  // Remove all pre-existing menu items.
  while (parent.hasChildNodes()) {
    parent.lastChild.remove();
  }

  // Create tag menu items.
  const currentTagKey = gFolderDisplay.view.mailViewIndex == kViewItemTags ?
    gFolderDisplay.view.mailViewData : "";

  const tagArray = MailServices.tags.getAllTags({});

  tagArray.forEach(tagInfo => {
    const item = document.createXULElement(elementName);

    item.setAttribute("label", tagInfo.tag);
    item.setAttribute("value", kViewTagMarker + tagInfo.key);
    item.setAttribute("type", "radio");

    if (tagInfo.key == currentTagKey) {
      item.setAttribute("checked", true);
    }
    if (tagInfo.color) {
      item.setAttribute("style", `color: ${tagInfo.color};`);
    }
    if (classes) {
      item.setAttribute("class", classes);
    }
    parent.appendChild(item);
  });
}

function ViewPickerOnLoad() {
  var viewPickerPopup = document.getElementById("viewPickerPopup");
  if (viewPickerPopup)
    RefreshAllViewPopups(viewPickerPopup, true);
}


window.addEventListener("load", ViewPickerOnLoad);
