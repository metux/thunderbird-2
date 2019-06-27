/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// toolkit/content/preferencesBindings.js
/* globals Preferences */
// toolkit/mozapps/preferences/fontbuilder.js
/* globals FontBuilder */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

var kDefaultFontType          = "font.default.%LANG%";
var kFontNameFmtSerif         = "font.name.serif.%LANG%";
var kFontNameFmtSansSerif     = "font.name.sans-serif.%LANG%";
var kFontNameFmtMonospace     = "font.name.monospace.%LANG%";
var kFontNameListFmtSerif     = "font.name-list.serif.%LANG%";
var kFontNameListFmtSansSerif = "font.name-list.sans-serif.%LANG%";
var kFontNameListFmtMonospace = "font.name-list.monospace.%LANG%";
var kFontSizeFmtVariable      = "font.size.variable.%LANG%";
var kFontSizeFmtFixed         = "font.size.monospace.%LANG%";
var kFontMinSizeFmt           = "font.minimum-size.%LANG%";

Preferences.addAll([
  { id: "font.language.group", type: "wstring" },
  { id: "browser.display.use_document_fonts", type: "int" },
  { id: "mail.fixed_width_messages", type: "bool" },
  { id: "mailnews.send_default_charset", type: "wstring" },
  { id: "mailnews.view_default_charset", type: "wstring" },
  { id: "mailnews.reply_in_default_charset", type: "bool" },
]);

var gFontsDialog = {
  _selectLanguageGroupPromise: Promise.resolve(),

  _selectLanguageGroup(aLanguageGroup) {
   this._selectLanguageGroupPromise = (async () => {
    // Avoid overlapping language group selections by awaiting the resolution
    // of the previous one.  We do this because this function is re-entrant,
    // as inserting <preference> elements into the DOM sometimes triggers a call
    // back into this function.  And since this function is also asynchronous,
    // that call can enter this function before the previous run has completed,
    // which would corrupt the font menulists.  Awaiting the previous call's
    // resolution avoids that fate.
    await this._selectLanguageGroupPromise;

    var prefs = [{ format: kDefaultFontType,          type: "string",   element: "defaultFontType", fonttype: null     },
                 { format: kFontNameFmtSerif,         type: "fontname", element: "serif",      fonttype: "serif"       },
                 { format: kFontNameFmtSansSerif,     type: "fontname", element: "sans-serif", fonttype: "sans-serif"  },
                 { format: kFontNameFmtMonospace,     type: "fontname", element: "monospace",  fonttype: "monospace"   },
                 { format: kFontNameListFmtSerif,     type: "unichar",  element: null,         fonttype: "serif"       },
                 { format: kFontNameListFmtSansSerif, type: "unichar",  element: null,         fonttype: "sans-serif"  },
                 { format: kFontNameListFmtMonospace, type: "unichar",  element: null,         fonttype: "monospace"   },
                 { format: kFontSizeFmtVariable,      type: "int",      element: "sizeVar",    fonttype: null          },
                 { format: kFontSizeFmtFixed,         type: "int",      element: "sizeMono",   fonttype: null          },
                 { format: kFontMinSizeFmt,           type: "int",      element: "minSize",    fonttype: null          }];
    for (var i = 0; i < prefs.length; ++i) {
      var name = prefs[i].format.replace(/%LANG%/, aLanguageGroup);
      var preference = Preferences.get(name);
      if (!preference) {
        preference = Preferences.add({ id: name, type: prefs[i].type });
      }

      if (!prefs[i].element)
        continue;

      var element = document.getElementById(prefs[i].element);
      if (element) {
        element.setAttribute("preference", preference.id);

        if (prefs[i].fonttype)
          await FontBuilder.buildFontList(aLanguageGroup, prefs[i].fonttype, element);
        preference.setElementValue(element);
      }
    }
   })()
    .catch(Cu.reportError);
  },

  readFontLanguageGroup() {
    var languagePref = Preferences.get("font.language.group");
    this._selectLanguageGroup(languagePref.value);
    return undefined;
  },

  readUseDocumentFonts() {
    var preference = Preferences.get("browser.display.use_document_fonts");
    return preference.value == 1;
  },

  writeUseDocumentFonts() {
    var useDocumentFonts = document.getElementById("useDocumentFonts");
    return useDocumentFonts.checked ? 1 : 0;
  },

  readFixedWidthForPlainText() {
    var preference = Preferences.get("mail.fixed_width_messages");
    return preference.value == 1;
  },

  writeFixedWidthForPlainText() {
    var mailFixedWidthMessages = document.getElementById("mailFixedWidthMessages");
    return mailFixedWidthMessages.checked;
  },

  /**
   * Both mailnews.send_default_charset and mailnews.view_default_charset
   * are nsIPrefLocalizedString. Its default value is different depending
   * on the user locale (see bug 48842).
   */
  ondialogaccept() {
    var sendCharsetStr = Services.prefs.getComplexValue(
      "mailnews.send_default_charset", Ci.nsIPrefLocalizedString).data;

    var viewCharsetStr = Services.prefs.getComplexValue(
      "mailnews.view_default_charset", Ci.nsIPrefLocalizedString).data;

    var defaultPrefs = Services.prefs.getDefaultBranch("mailnews.");

    // Here we compare preference's stored value with default one and,
    // if needed, show it as "default" on Config Editor instead of "user set".
    if (sendCharsetStr === defaultPrefs.getComplexValue(
          "send_default_charset", Ci.nsIPrefLocalizedString).data)
      Services.prefs.clearUserPref("mailnews.send_default_charset");

    if (viewCharsetStr === defaultPrefs.getComplexValue(
          "view_default_charset", Ci.nsIPrefLocalizedString).data)
      Services.prefs.clearUserPref("mailnews.view_default_charset");
  },
};

document.addEventListener("dialogaccept", () => gFontsDialog.ondialogaccept());
