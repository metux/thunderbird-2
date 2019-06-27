/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

ChromeUtils.defineModuleGetter(this, "ToolbarButtonAPI", "resource:///modules/ExtensionToolbarButtons.jsm");

this.composeAction = class extends ToolbarButtonAPI {
  constructor(extension) {
    super(extension);
    this.manifest_name = "compose_action";
    this.manifestName = "composeAction";
    this.windowURLs = ["chrome://messenger/content/messengercompose/messengercompose.xul"];

    let format = extension.manifest.compose_action.default_area == "formattoolbar";
    this.toolboxId = format ? "FormatToolbox" : "compose-toolbox";
    this.toolbarId = format ? "FormatToolbar" : "composeToolbar2";

    if (format) {
      this.paint = this.paintFormatToolbar;
    }
  }

  paintFormatToolbar(window) {
    let {document} = window;
    if (document.getElementById(this.id)) {
        return;
    }

    let toolbar = document.getElementById(this.toolbarId);
    let button = this.makeButton(window);
    let before = toolbar.lastElementChild;
    while (before.localName == "spacer") {
      before = before.previousElementSibling;
    }
    toolbar.insertBefore(button, before.nextElementSibling);
  }
};
