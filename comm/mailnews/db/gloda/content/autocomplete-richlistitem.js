/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, MozElements */
{
  let {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
  let {StringBundle} = ChromeUtils.import("resource:///modules/StringBundle.js");
  let gGlodaCompleteStrings = new StringBundle("chrome://messenger/locale/glodaComplete.properties");

  /**
   * The MozGlodacompleteBaseRichlistitem widget is the
   * abstract base class for all the gloda autocomplete items.
   *
   * @abstract
   * @extends {MozElements.MozRichlistitem}
   */
  class MozGlodacompleteBaseRichlistitem extends MozElements.MozRichlistitem {
    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }
      this._boundaryCutoff = null;
    }

    get boundaryCutoff() {
      if (!this._boundaryCutoff) {
        this._boundaryCutoff =
          Services.prefs.getIntPref("toolkit.autocomplete.richBoundaryCutoff");
      }
      return this._boundaryCutoff;
    }

    _getBoundaryIndices(aText, aSearchTokens) {
      // Short circuit for empty search ([""] == "")
      if (aSearchTokens == "") {
        return [0, aText.length];
      }

      // Find which regions of text match the search terms.
      let regions = [];
      for (let search of aSearchTokens) {
        let matchIndex;
        let startIndex = 0;
        let searchLen = search.length;

        // Find all matches of the search terms, but stop early for perf.
        let lowerText = aText.toLowerCase().substr(0, this.boundaryCutoff);
        while ((matchIndex = lowerText.indexOf(search, startIndex)) >= 0) {
          // Start the next search from where this one finished.
          startIndex = matchIndex + searchLen;
          regions.push([matchIndex, startIndex]);
        }
      }

      // Sort the regions by start position then end position.
      regions = regions.sort(function(a, b) {
        let start = a[0] - b[0];
        return (start == 0) ? a[1] - b[1] : start;
      });

      // Generate the boundary indices from each region.
      let start = 0;
      let end = 0;
      let boundaries = [];
      for (let i = 0; i < regions.length; i++) {
        // We have a new boundary if the start of the next is past the end.
        let region = regions[i];
        if (region[0] > end) {
          // First index is the beginning of match.
          boundaries.push(start);
          // Second index is the beginning of non-match.
          boundaries.push(end);

          // Track the new region now that we've stored the previous one.
          start = region[0];
        }

        // Push back the end index for the current or new region.
        end = Math.max(end, region[1]);
      }

      // Add the last region.
      boundaries.push(start);
      boundaries.push(end);

      // Put on the end boundary if necessary.
      if (end < aText.length) {
        boundaries.push(aText.length);
      }

      // Skip the first item because it's always 0.
      return boundaries.slice(1);
    }

    _getSearchTokens(aSearch) {
      let search = aSearch.toLowerCase();
      return search.split(/\s+/);
    }

    _needsAlternateEmphasis(aText) {
      for (let i = aText.length; --i >= 0;) {
        let charCode = aText.charCodeAt(i);
        // Arabic, Syriac, Indic languages are likely to have ligatures
        // that are broken when using the main emphasis styling.
        if (0x0600 <= charCode && charCode <= 0x109F) {
          return true;
        }
      }

      return false;
    }

    _setUpDescription(aDescriptionElement, aText) {
      // Get rid of all previous text.
      while (aDescriptionElement.hasChildNodes()) {
        aDescriptionElement.lastChild.remove();
      }

      // Get the indices that separate match and non-match text.
      let search = this.getAttribute("text");
      let tokens = this._getSearchTokens(search);
      let indices = this._getBoundaryIndices(aText, tokens);

      // If we're searching for something that needs alternate emphasis,
      // we'll need to check the text that we match.
      let checkAlt = this._needsAlternateEmphasis(search);

      let next;
      let start = 0;
      let len = indices.length;
      // Even indexed boundaries are matches, so skip the 0th if it's empty.
      for (let i = indices[0] == 0 ? 1 : 0; i < len; i++) {
        next = indices[i];
        let text = aText.substr(start, next - start);
        start = next;

        if (i % 2 == 0) {
          // Emphasize the text for even indices
          let span = aDescriptionElement.appendChild(
            document.createElementNS("http://www.w3.org/1999/xhtml", "span"));
          span.className = checkAlt && this._needsAlternateEmphasis(text) ?
            "ac-emphasize-alt" : "ac-emphasize-text";
          span.textContent = text;
        } else {
          // Otherwise, it's plain text
          aDescriptionElement.appendChild(document.createTextNode(text));
        }
      }
    }

    _setUpOverflow(aParentBox, aEllipsis) {
      // Hide the ellipsis in case there's just enough to not underflow.
      aEllipsis.hidden = true;

      // Start with the parent's width and subtract off its children.
      let tooltip = [];
      let children = aParentBox.childNodes;
      let widthDiff = aParentBox.getBoundingClientRect().width;

      for (let i = 0; i < children.length; i++) {
        // Only consider a child if it actually takes up space.
        let childWidth = children[i].getBoundingClientRect().width;
        if (childWidth > 0) {
          // Subtract a little less to account for subpixel rounding.
          widthDiff -= childWidth - .5;

          // Add to the tooltip if it's not hidden and has text.
          let childText = children[i].textContent;
          if (childText) {
            tooltip.push(childText);
          }
        }
      }

      // If the children take up more space than the parent.. overflow!
      if (widthDiff < 0) {
        // Re-show the ellipsis now that we know it's needed.
        aEllipsis.hidden = false;

        // Separate text components with a ndash --
        aParentBox.tooltipText = tooltip.join(" \u2013 ");
      }
    }

    _doUnderflow(aName) {
      // Hide the ellipsis right when we know we're underflowing instead of
      // waiting for the timeout to trigger the _setUpOverflow calculations.
      this[aName + "Box"].tooltipText = "";
      this[aName + "OverflowEllipsis"].hidden = true;
    }
  }

  MozXULElement.implementCustomInterface(
    MozGlodacompleteBaseRichlistitem, [Ci.nsIDOMXULSelectControlItemElement]
  );

  customElements.define("glodacomplete-base-richlistitem",
    MozGlodacompleteBaseRichlistitem, { extends: "richlistitem" });

  /**
   * The MozGlodaContactChunk widget displays an autocomplete item with
   * contact chunk: e.g. image, name and description of the contact.
   *
   * @extends MozGlodacompleteBaseRichlistitem
   */
  class MozGlodaContactChunk extends MozGlodacompleteBaseRichlistitem {
    static get inheritedAttributes() {
      return {
        "description.ac-comment": "selected",
        "label.ac-comment": "selected",
        "description.ac-url-text": "selected",
        "label.ac-url-text": "selected",
      };
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this.appendChild(MozXULElement.parseXULToFragment(`
        <image class="ac-type-picture"></image>
        <vbox>
          <hbox>
            <hbox class="ac-title" flex="1" onunderflow="_doUnderflow('_name');">
              <description class="ac-normal-text ac-comment"></description>
            </hbox>
            <label class="ac-ellipsis-after ac-comment" hidden="true"></label>
          </hbox>
          <hbox>
            <hbox class="ac-url" flex="1" onunderflow="_doUnderflow('_identity');">
              <description class="ac-normal-text ac-url-text"></description>
            </hbox>
            <label class="ac-ellipsis-after ac-url-text" hidden="true"></label>
            <image class="ac-type-icon"></image>
          </hbox>
        </vbox>
      `));

      let ellipsis = "\u2026";
      try {
        ellipsis = Services.prefs.getComplexValue("intl.ellipsis",
          Ci.nsIPrefLocalizedString).data;
      } catch (ex) {
        // Do nothing.. we already have a default.
      }

      this._identityOverflowEllipsis = this.querySelector("label.ac-url-text");
      this._nameOverflowEllipsis = this.querySelector("label.ac-comment");

      this._identityOverflowEllipsis.value = ellipsis;
      this._nameOverflowEllipsis.value = ellipsis;

      this._typeImage = this.querySelector(".ac-type-icon");

      this._identityBox = this.querySelector(".ac-url");
      this._identity = this.querySelector("description.ac-url-text");

      this._nameBox = this.querySelector(".ac-title");
      this._name = this.querySelector("description.ac-comment");

      this._picture = this.querySelector(".ac-type-picture");

      this._adjustAcItem();

      this.initializeAttributeInheritance();
    }

    get label() {
      let identity = this.obj;
      return identity.accessibleLabel;
    }

    _adjustAcItem() {
      let contact = this.obj;

      if (contact == null) {
        return;
      }

      let identity = contact.identities[0];

      // I guess we should get the picture size from CSS or something?
      this._picture.src = identity.pictureURL(32);

      // Emphasize the matching search terms for the description.
      this._setUpDescription(this._name, contact.name);
      this._setUpDescription(this._identity, identity.value);

      // Set up overflow on a timeout because the contents of the box
      // might not have a width yet even though we just changed them.
      setTimeout(this._setUpOverflow, 0, this._nameBox, this._nameOverflowEllipsis);
      setTimeout(this._setUpOverflow, 0, this._identityBox, this._identityOverflowEllipsis);
    }
  }

  customElements.define("gloda-contact-chunk", MozGlodaContactChunk, { extends: "richlistitem" });

  /**
   * The MozGlodaFulltextAll widget displays an autocomplete full text of
   * all the items: e.g. full text explanation of the item.
   *
   * @extends MozGlodacompleteBaseRichlistitem
   */
  class MozGlodaFulltextAll extends MozGlodacompleteBaseRichlistitem {
    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this._explanation = document.createXULElement("description");
      this._explanation.classList.add("explanation");
      let label = gGlodaCompleteStrings.get("glodaComplete.messagesMentioningMany.label");
      this._explanation.setAttribute("value", label.replace("#1", this.row.words.join(", ")));
      this.appendChild(this._explanation);
    }

    get label() {
      return "full text search: " + this.row.item; // what is this for? l10n?
    }
  }

  MozXULElement.implementCustomInterface(
    MozGlodaFulltextAll, [Ci.nsIDOMXULSelectControlItemElement]
  );

  customElements.define("gloda-fulltext-all", MozGlodaFulltextAll, { extends: "richlistitem" });

  /**
   * The MozGlodaFulltextAll widget displays an autocomplete full text
   * of single item: e.g. full text explanation of the item.
   *
   * @extends MozGlodacompleteBaseRichlistitem
   */
  class MozGlodaFulltextSingle extends MozGlodacompleteBaseRichlistitem {
    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this._explanation = document.createXULElement("description");
      this._explanation.classList.add("explanation", "gloda-fulltext-single");
      this._parameters = document.createXULElement("description");

      this.appendChild(this._explanation);
      this.appendChild(this._parameters);

      let label = gGlodaCompleteStrings.get("glodaComplete.messagesMentioning.label");
      this._explanation.setAttribute("value", label.replace("#1", this.row.item));
    }

    get label() {
      return "full text search: " + this.row.item;
    }
  }

  MozXULElement.implementCustomInterface(
    MozGlodaFulltextSingle, [Ci.nsIDOMXULSelectControlItemElement]
  );

  customElements.define("gloda-fulltext-single", MozGlodaFulltextSingle,
    { extends: "richlistitem" });

  /**
   * The MozGlodaMulti widget displays an autocomplete description of multiple
   * type items: e.g. explanation of the items.
   *
   * @extends MozGlodacompleteBaseRichlistitem
   */
  class MozGlodaMulti extends MozGlodacompleteBaseRichlistitem {
    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this._explanation = document.createXULElement("description");
      this._identityHolder = document.createXULElement("hbox");
      this._identityHolder.setAttribute("flex", "1");

      this.appendChild(this._explanation);
      this.appendChild(this._identityHolder);
      this._adjustAcItem();
    }

    get label() {
      return this._explanation.value;
    }

    renderItem(aObj) {
      let node = document.createXULElement("richlistitem");

      node.obj = aObj;
      node.setAttribute("type", "gloda-" + this.row.nounDef.name + "-chunk");

      this._identityHolder.appendChild(node);
    }

    _adjustAcItem() {
      // clear out any lingering children.
      while (this._identityHolder.hasChildNodes()) {
        this._identityHolder.lastChild.remove();
      }

      let row = this.row;
      if (row == null) {
        return;
      }

      this._explanation.value = row.nounDef.name + "s " +
        row.criteriaType + "ed " + row.criteria;

      // render anyone already in there.
      for (let item of row.collection.items) {
        this.renderItem(item);
      }
      // listen up, yo.
      row.renderer = this;
    }
  }

  MozXULElement.implementCustomInterface(
    MozGlodaMulti, [Ci.nsIDOMXULSelectControlItemElement]
  );

  customElements.define("gloda-multi", MozGlodaMulti, { extends: "richlistitem" });

  /**
   * The MozGlodaSingleIdentity widget displays an autocomplete item with
   * single identity: e.g. image, name and description of the item.
   *
   * @extends MozGlodacompleteBaseRichlistitem
   */
  class MozGlodaSingleIdentity extends MozGlodacompleteBaseRichlistitem {
    static get inheritedAttributes() {
      return {
        "description.ac-comment": "selected",
        "label.ac-comment": "selected",
        "description.ac-url-text": "selected",
        "label.ac-url-text": "selected",
      };
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.appendChild(MozXULElement.parseXULToFragment(`
        <hbox class="gloda-single-identity">
          <image class="picture"></image>
          <vbox>
            <hbox>
              <hbox class="ac-title" flex="1" onunderflow="_doUnderflow('_name');">
                <description class="ac-normal-text ac-comment"></description>
              </hbox>
              <label class="ac-ellipsis-after ac-comment" hidden="true"></label>
            </hbox>
            <hbox>
              <hbox class="ac-url" flex="1" onunderflow="_doUnderflow('_identity');">
                <description class="ac-normal-text ac-url-text" inherits="selected"></description>
              </hbox>
              <label class="ac-ellipsis-after ac-url-text" hidden="true"></label>
              <image class="ac-type-icon"></image>
            </hbox>
          </vbox>
        </hbox>
      `));

      let ellipsis = "\u2026";
      try {
        ellipsis = Services.prefs.getComplexValue("intl.ellipsis",
          Ci.nsIPrefLocalizedString).data;
      } catch (ex) {
        // Do nothing.. we already have a default.
      }

      this._identityOverflowEllipsis = this.querySelector("label.ac-url-text");
      this._nameOverflowEllipsis = this.querySelector("label.ac-comment");

      this._identityOverflowEllipsis.value = ellipsis;
      this._nameOverflowEllipsis.value = ellipsis;

      this._typeImage = this.querySelector(".ac-type-icon");

      this._identityBox = this.querySelector(".ac-url");
      this._identity = this.querySelector("description.ac-url-text");

      this._nameBox = this.querySelector(".ac-title");
      this._name = this.querySelector("description.ac-comment");

      this._picture = this.querySelector(".picture");

      this._adjustAcItem();

      this.initializeAttributeInheritance();
    }

    get label() {
      let identity = this.row.item;
      return identity.accessibleLabel;
    }

    _adjustAcItem() {
      let identity = this.row.item;

      if (identity == null) {
        return;
      }

      // I guess we should get the picture size from CSS or something?
      this._picture.src = identity.pictureURL(32);

      // Emphasize the matching search terms for the description.
      this._setUpDescription(this._name, identity.contact.name);
      this._setUpDescription(this._identity, identity.value);

      // Set up overflow on a timeout because the contents of the box
      // might not have a width yet even though we just changed them.
      setTimeout(this._setUpOverflow, 0, this._nameBox, this._nameOverflowEllipsis);
      setTimeout(this._setUpOverflow, 0, this._identityBox, this._identityOverflowEllipsis);
    }
  }

  MozXULElement.implementCustomInterface(
    MozGlodaSingleIdentity, [Ci.nsIDOMXULSelectControlItemElement]
  );

  customElements.define("gloda-single-identity", MozGlodaSingleIdentity,
    { extends: "richlistitem" });

  /**
   * The MozGlodaSingleTag widget displays an autocomplete item with
   * single tag: e.g. explanation of the item.
   *
   * @extends MozGlodacompleteBaseRichlistitem
   */
  class MozGlodaSingleTag extends MozGlodacompleteBaseRichlistitem {
    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this._explanation = document.createXULElement("description");
      this._explanation.classList.add("explanation", "gloda-single");
      this.appendChild(this._explanation);
      let label = gGlodaCompleteStrings.get("glodaComplete.messagesTagged.label");
      this._explanation.setAttribute("value", label.replace("#1", this.row.item.tag));
    }

    get label() {
      return "tag " + this.row.item.tag;
    }
  }

  MozXULElement.implementCustomInterface(
    MozGlodaSingleTag, [Ci.nsIDOMXULSelectControlItemElement]
  );

  customElements.define("gloda-single-tag", MozGlodaSingleTag, { extends: "richlistitem" });
}
