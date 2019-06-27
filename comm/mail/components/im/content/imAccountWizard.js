/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// chat/content/imAccountOptionsHelper.js
/* globals accountOptionsHelper */

var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

var PREF_EXTENSIONS_GETMOREPROTOCOLSURL = "extensions.getMoreProtocolsURL";

var accountWizard = {
  onload() {
    document.documentElement.addEventListener("wizardfinish", this.createAccount.bind(this));
    let accountProtocolPage = document.getElementById("accountprotocol");
    accountProtocolPage.addEventListener("pageadvanced", this.selectProtocol.bind(this));
    let accountUsernamePage = document.getElementById("accountusername");
    accountUsernamePage.addEventListener("pageshow", this.showUsernamePage.bind(this));
    accountUsernamePage.addEventListener("pagehide", this.hideUsernamePage.bind(this));
    let accountAdvancedPage = document.getElementById("accountadvanced");
    accountAdvancedPage.addEventListener("pageshow", this.showAdvanced.bind(this));
    let accountSummaryPage = document.getElementById("accountsummary");
    accountSummaryPage.addEventListener("pageshow", this.showSummary.bind(this));

    // Ensure the im core is initialized before we get a list of protocols.
    Services.core.init();

    accountWizard.setGetMoreProtocols();

    var protoList = document.getElementById("protolist");
    var protos = [];
    for (let proto of this.getProtocols())
      protos.push(proto);
    protos.sort((a, b) => {
      if (a.name < b.name)
        return -1;
      return a.name > b.name ? 1 : 0;
    });
    protos.forEach(function(proto) {
      let image = document.createXULElement("image");
      image.setAttribute("src", proto.iconBaseURI + "icon.png");

      let label = document.createXULElement("label");
      label.setAttribute("value", proto.name);

      let item = document.createXULElement("richlistitem");
      item.setAttribute("value", proto.id);
      item.appendChild(image);
      item.appendChild(label);
      protoList.appendChild(item);
    });

    // there is a strange selection bug without this timeout
    setTimeout(function() {
      protoList.selectedIndex = 0;
    }, 0);

    Services.obs.addObserver(this, "prpl-quit");
    window.addEventListener("unload", this.unload);
  },
  unload() {
    Services.obs.removeObserver(accountWizard, "prpl-quit");
  },
  observe(aObject, aTopic, aData) {
    if (aTopic == "prpl-quit") {
      // libpurple is being uninitialized. We can't create any new
      // account so keeping this wizard open would be pointless, close it.
      window.close();
    }
  },

  getUsername() {
    // If the first username textbox is empty, make sure we return an empty
    // string so that it blocks the 'next' button of the wizard.
    if (!this.userNameBoxes[0].value)
      return "";

    return this.userNameBoxes.reduce((prev, elt) => prev + elt.value, "");
  },

  checkUsername() {
    var wizard = document.getElementById("accountWizard");
    var name = accountWizard.getUsername();
    var duplicateWarning = document.getElementById("duplicateAccount");
    if (!name) {
      wizard.canAdvance = false;
      duplicateWarning.hidden = true;
      return;
    }

    var exists = accountWizard.proto.accountExists(name);
    wizard.canAdvance = !exists;
    duplicateWarning.hidden = !exists;
  },

  selectProtocol() {
    var protoList = document.getElementById("protolist");
    var id = protoList.selectedItem.value;
    this.proto = Services.core.getProtocolById(id);
  },


  insertUsernameField(aName, aLabel, aParent, aDefaultValue) {
    var hbox = document.createXULElement("hbox");
    hbox.setAttribute("id", aName + "-hbox");
    hbox.setAttribute("align", "baseline");
    hbox.setAttribute("equalsize", "always");

    var label = document.createXULElement("label");
    label.setAttribute("value", aLabel);
    label.setAttribute("control", aName);
    label.setAttribute("id", aName + "-label");
    hbox.appendChild(label);

    var textbox = document.createXULElement("textbox");
    textbox.setAttribute("id", aName);
    textbox.setAttribute("flex", 1);
    if (aDefaultValue)
      textbox.setAttribute("value", aDefaultValue);
    textbox.addEventListener("input", accountWizard.checkUsername);
    hbox.appendChild(textbox);

    aParent.appendChild(hbox);
    return textbox;
  },

  showUsernamePage() {
    var proto = this.proto.id;
    if ("userNameBoxes" in this && this.userNameProto == proto) {
      this.checkUsername();
      return;
    }

    var bundle = document.getElementById("accountsBundle");
    var usernameInfo;
    var emptyText = this.proto.usernameEmptyText;
    if (emptyText) {
      usernameInfo =
        bundle.getFormattedString("accountUsernameInfoWithDescription",
                                  [emptyText, this.proto.name]);
    } else {
      usernameInfo =
        bundle.getFormattedString("accountUsernameInfo", [this.proto.name]);
    }
    document.getElementById("usernameInfo").textContent = usernameInfo;

    var vbox = document.getElementById("userNameBox");
    // remove anything that may be there for another protocol
    while (vbox.hasChildNodes())
      vbox.lastChild.remove();

    var splits = [];
    for (let split of this.getProtoUserSplits())
      splits.push(split);

    var label = bundle.getString("accountUsername");
    this.userNameBoxes = [this.insertUsernameField("name", label, vbox)];
    this.userNameBoxes[0].emptyText = emptyText;

    for (let i = 0; i < splits.length; ++i) {
      this.userNameBoxes.push({value: splits[i].separator});
      label = bundle.getFormattedString("accountColon", [splits[i].label]);
      let defaultVal = splits[i].defaultValue;
      this.userNameBoxes.push(this.insertUsernameField("username-split-" + i,
                                                       label, vbox,
                                                       defaultVal));
    }
    this.userNameBoxes[0].focus();
    this.userNameProto = proto;
    this.checkUsername();
  },

  hideUsernamePage() {
    document.getElementById("accountWizard").canAdvance = true;
    var next = "account" +
      (this.proto.noPassword ? "advanced" : "password");
    document.getElementById("accountusername").next = next;
  },

  showAdvanced() {
    // ensure we don't destroy user data if it's not necessary
    var id = this.proto.id;
    if ("protoSpecOptId" in this && this.protoSpecOptId == id)
      return;
    this.protoSpecOptId = id;

    this.populateProtoSpecificBox();

    let alias = document.getElementById("alias");
    alias.focus();
  },

  populateProtoSpecificBox() {
    let haveOptions =
      accountOptionsHelper.addOptions(this.proto.id + "-", this.getProtoOptions());
    document.getElementById("protoSpecificGroupbox").hidden = !haveOptions;
    if (haveOptions) {
      var bundle = document.getElementById("accountsBundle");
      document.getElementById("protoSpecificCaption").label =
        bundle.getFormattedString("protoOptions", [this.proto.name]);
    }
  },

  createSummaryRow(aLabel, aValue) {
    var hbox = document.createXULElement("hbox");
    hbox.setAttribute("align", "baseline");
    hbox.setAttribute("equalsize", "always");

    var label = document.createXULElement("label");
    label.setAttribute("class", "header");
    if (aLabel.length > 20) {
      aLabel = aLabel.substring(0, 20);
      aLabel += "…";
    }

    label.setAttribute("value", aLabel);
    var hboxWrapper = document.createXULElement("hbox");
    hboxWrapper.appendChild(label);
    hbox.appendChild(hboxWrapper);

    var textbox = document.createXULElement("textbox");
    textbox.setAttribute("value", aValue);
    textbox.setAttribute("class", "plain");
    textbox.setAttribute("readonly", true);
    hbox.appendChild(textbox);

    return hbox;
  },

  showSummary() {
    var rows = document.getElementById("summaryRows");
    var bundle = document.getElementById("accountsBundle");
    while (rows.hasChildNodes())
      rows.lastChild.remove();

    var label = document.getElementById("protoLabel").value;
    rows.appendChild(this.createSummaryRow(label, this.proto.name));
    this.username = this.getUsername();
    label = bundle.getString("accountUsername");
    rows.appendChild(this.createSummaryRow(label, this.username));
    if (!this.proto.noPassword) {
      this.password = this.getValue("password");
      if (this.password) {
        label = document.getElementById("passwordLabel").value;
        var pass = "";
        for (let i = 0; i < this.password.length; ++i)
          pass += "*";
        rows.appendChild(this.createSummaryRow(label, pass));
      }
    }
    this.alias = this.getValue("alias");
    if (this.alias) {
      label = document.getElementById("aliasLabel").value;
      rows.appendChild(this.createSummaryRow(label, this.alias));
    }

    /* FIXME
    if (this.proto.newMailNotification)
      rows.appendChild(this.createSummaryRow("Notify of new mails:",
                                             this.getValue("newMailNotification")));
    */

    var id = this.proto.id;
    this.prefs = [ ];
    for (let opt of this.getProtoOptions()) {
      let name = opt.name;
      let eltName = id + "-" + name;
      let val = this.getValue(eltName);
      // The value will be undefined if the proto specific groupbox has never been opened
      if (val === undefined)
        continue;
      switch (opt.type) {
      case opt.typeBool:
        if (val != opt.getBool())
          this.prefs.push({opt, name, value: !!val});
        break;
      case opt.typeInt:
        if (val != opt.getInt())
          this.prefs.push({opt, name, value: val});
        break;
      case opt.typeString:
        if (val != opt.getString())
          this.prefs.push({opt, name, value: val});
        break;
      case opt.typeList:
        if (val != opt.getListDefault())
          this.prefs.push({opt, name, value: val});
        break;
      default:
        throw new Error("unknown preference type " + opt.type);
      }
    }

    for (let i = 0; i < this.prefs.length; ++i) {
      let opt = this.prefs[i];
      let label = bundle.getFormattedString("accountColon", [opt.opt.label]);
      rows.appendChild(this.createSummaryRow(label, opt.value));
    }
  },

  createAccount() {
    var acc = Services.accounts.createAccount(this.username, this.proto.id);
    if (!this.proto.noPassword && this.password)
      acc.password = this.password;
    if (this.alias)
      acc.alias = this.alias;

    for (let i = 0; i < this.prefs.length; ++i) {
      let option = this.prefs[i];
      let opt = option.opt;
      switch (opt.type) {
      case opt.typeBool:
        acc.setBool(option.name, option.value);
        break;
      case opt.typeInt:
        acc.setInt(option.name, option.value);
        break;
      case opt.typeString:
      case opt.typeList:
        acc.setString(option.name, option.value);
        break;
      default:
        throw new Error("unknown type");
      }
    }
    var autologin = this.getValue("connectNow");
    acc.autoLogin = autologin;

    acc.save();

    try {
      if (autologin)
        acc.connect();
    } catch (e) {
      // If the connection fails (for example if we are currently in
      // offline mode), we still want to close the account wizard
    }

    if (window.opener) {
      var am = window.opener.gAccountManager;
      if (am)
        am.selectAccount(acc.id);
    }

    var inServer =
      MailServices.accounts.createIncomingServer(this.username,
                                                 this.proto.id, // hostname
                                                 "im");
    inServer.wrappedJSObject.imAccount = acc;

    var account = MailServices.accounts.createAccount();
    // Avoid new folder notifications.
    inServer.valid = false;
    account.incomingServer = inServer;
    inServer.valid = true;
    MailServices.accounts.notifyServerLoaded(inServer);

    return true;
  },

  getValue(aId) {
    var elt = document.getElementById(aId);
    if ("selectedItem" in elt)
      return elt.selectedItem.value;
    if ("checked" in elt)
      return elt.checked;
    if ("value" in elt)
      return elt.value;
    // If the groupbox has never been opened, the binding isn't attached
    // so the attributes don't exist. The calling code in showSummary
    // has a special handling of the undefined value for this case.
    return undefined;
  },

  * getIter(aEnumerator) {
    while (aEnumerator.hasMoreElements())
      yield aEnumerator.getNext();
  },
  getProtocols() {
    return this.getIter(Services.core.getProtocols());
  },
  getProtoOptions() {
    return this.getIter(this.proto.getOptions());
  },
  getProtoUserSplits() {
    return this.getIter(this.proto.getUsernameSplit());
  },

  onGroupboxKeypress(aEvent) {
    var target = aEvent.target;
    var code = aEvent.charCode || aEvent.keyCode;
    if (code == KeyEvent.DOM_VK_SPACE ||
        (code == KeyEvent.DOM_VK_LEFT && !target.hasAttribute("closed")) ||
        (code == KeyEvent.DOM_VK_RIGHT && target.hasAttribute("closed")))
        this.toggleGroupbox(target.id);
  },

  toggleGroupbox(id) {
    var elt = document.getElementById(id);
    if (elt.hasAttribute("closed")) {
      elt.removeAttribute("closed");
      if (elt.flexWhenOpened)
        elt.flex = elt.flexWhenOpened;
    } else {
      elt.setAttribute("closed", "true");
      if (elt.flex) {
        elt.flexWhenOpened = elt.flex;
        elt.flex = 0;
      }
    }
  },

  /* Check for correctness and set URL for the "Get more protocols..."-link
   *  Stripped down code from preferences/themes.js
   */
  setGetMoreProtocols() {
    let prefURL = PREF_EXTENSIONS_GETMOREPROTOCOLSURL;
    var getMore = document.getElementById("getMoreProtocols");
    var showGetMore = false;
    const nsIPrefBranch = Ci.nsIPrefBranch;

    if (Services.prefs.getPrefType(prefURL) != nsIPrefBranch.PREF_INVALID) {
      try {
        var getMoreURL = Services.urlFormatter.formatURLPref(prefURL);
        getMore.setAttribute("getMoreURL", getMoreURL);
        showGetMore = getMoreURL != "about:blank";
      } catch (e) {}
    }
    getMore.hidden = !showGetMore;
  },

  openURL(aURL) {
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .loadURI(Services.io.newURI(aURL));
  },
};
