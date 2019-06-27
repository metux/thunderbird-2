/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["FreeTag", "FreeTagNoun"];

const {Log4Moz} = ChromeUtils.import("resource:///modules/gloda/log4moz.js");

const {Gloda} = ChromeUtils.import("resource:///modules/gloda/gloda.js");

function FreeTag(aTagName) {
  this.name = aTagName;
}

FreeTag.prototype = {
  toString() {
    return this.name;
  },
};

/**
 * @namespace Tag noun provider.  Since the tag unique value is stored as a
 *  parameter, we are an odd case and semantically confused.
 */
var FreeTagNoun = {
  _log: Log4Moz.repository.getLogger("gloda.noun.freetag"),

  name: "freetag",
  clazz: FreeTag,
  allowsArbitraryAttrs: false,
  usesParameter: true,

  _listeners: [],
  addListener(aListener) {
    this._listeners.push(aListener);
  },
  removeListener(aListener) {
    let index = this._listeners.indexOf(aListener);
    if (index >= 0)
      this._listeners.splice(index, 1);
  },

  populateKnownFreeTags() {
    for (let attr of this.objectNounOfAttributes) {
      let attrDB = attr.dbDef;
      for (let param in attrDB.parameterBindings) {
        this.getFreeTag(param);
      }
    }
  },

  knownFreeTags: {},
  getFreeTag(aTagName) {
    let tag = this.knownFreeTags[aTagName];
    if (!tag) {
      tag = this.knownFreeTags[aTagName] = new FreeTag(aTagName);
      for (let listener of this._listeners)
        listener.onFreeTagAdded(tag);
    }
    return tag;
  },

  comparator(a, b) {
    if (a == null) {
      if (b == null)
        return 0;
      return 1;
    } else if (b == null) {
      return -1;
    }
    return a.name.localeCompare(b.name);
  },

  toParamAndValue(aTag) {
    return [aTag.name, null];
  },

  toJSON(aTag) {
    return aTag.name;
  },
  fromJSON(aTagName) {
    return this.getFreeTag(aTagName);
  },
};

Gloda.defineNoun(FreeTagNoun);
