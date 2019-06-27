/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

var kACR = Ci.nsIAutoCompleteResult;
var kSupportedTypes = new Set(["addr_newsgroups", "addr_followup"]);

function nsNewsAutoCompleteResult(aSearchString) {
  // Can't create this in the prototype as we'd get the same array for
  // all instances
  this._searchResults = [];
  this.searchString = aSearchString;
}

nsNewsAutoCompleteResult.prototype = {
  _searchResults: null,

  // nsIAutoCompleteResult

  searchString: null,
  searchResult: kACR.RESULT_NOMATCH,
  defaultIndex: -1,
  errorDescription: null,

  get matchCount() {
    return this._searchResults.length;
  },

  getValueAt(aIndex) {
    return this._searchResults[aIndex].value;
  },

  getLabelAt(aIndex) {
    return this._searchResults[aIndex].value;
  },

  getCommentAt(aIndex) {
    return this._searchResults[aIndex].comment;
  },

  getStyleAt(aIndex) {
    return "subscribed-news";
  },

  getImageAt(aIndex) {
    return "";
  },

  getFinalCompleteValueAt(aIndex) {
    return this.getValueAt(aIndex);
  },

  removeValueAt(aRowIndex, aRemoveFromDB) {
  },

  // nsISupports

  QueryInterface: ChromeUtils.generateQI([kACR]),
};

function nsNewsAutoCompleteSearch() {}

nsNewsAutoCompleteSearch.prototype = {
  // For component registration
  classDescription: "Newsgroup Autocomplete",
  classID: Components.ID("e9bb3330-ac7e-11de-8a39-0800200c9a66"),

  cachedAccountKey: "",
  cachedServer: null,

  /**
   * Find the newsgroup server associated with the given accountKey.
   *
   * @param accountKey  The key of the account.
   * @return            The incoming news server (or null if one does not exist).
   */
  _findServer(accountKey) {
    let account = MailServices.accounts.getAccount(accountKey);

    if (account.incomingServer.type == "nntp")
      return account.incomingServer;
    return null;
  },

  // nsIAutoCompleteSearch
  startSearch(aSearchString, aSearchParam, aPreviousResult, aListener) {
    let params = aSearchParam ? JSON.parse(aSearchParam) : {};
    let result = new nsNewsAutoCompleteResult(aSearchString);
    if (!("type" in params) || !("accountKey" in params) ||
        !kSupportedTypes.has(params.type)) {
      result.searchResult = kACR.RESULT_IGNORED;
      aListener.onSearchResult(this, result);
      return;
    }

    if (("accountKey" in params) && (params.accountKey != this.cachedAccountKey)) {
      this.cachedAccountKey  = params.accountKey;
      this.cachedServer = this._findServer(params.accountKey);
    }

    if (this.cachedServer) {
      let groups = this.cachedServer.rootFolder.subFolders;
      while (groups.hasMoreElements()) {
        let curr = groups.getNext().QueryInterface(Ci.nsIMsgFolder);
        if (curr.prettyName.includes(aSearchString)) {
          result._searchResults.push({
            value: curr.prettyName,
            comment: this.cachedServer.prettyName,
          });
        }
      }
    }

    if (result.matchCount) {
      result.searchResult = kACR.RESULT_SUCCESS;
      // If the user does not select anything, use the first entry:
      result.defaultIndex = 0;
    }
    aListener.onSearchResult(this, result);
  },

  stopSearch() {
  },

  // nsISupports

  QueryInterface: ChromeUtils.generateQI([Ci.nsIAutoCompleteSearch]),
};

// Module
var NSGetFactory = XPCOMUtils.generateNSGetFactory([nsNewsAutoCompleteSearch]);
