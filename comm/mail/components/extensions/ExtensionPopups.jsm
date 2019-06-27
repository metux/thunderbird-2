/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

/* This file is a much-modified copy of browser/components/extensions/ExtensionPopups.jsm. */

var EXPORTED_SYMBOLS = ["BasePopup", "ViewPopup"];

ChromeUtils.defineModuleGetter(this, "ExtensionParent",
                               "resource://gre/modules/ExtensionParent.jsm");
var {ExtensionUtils} = ChromeUtils.import("resource://gre/modules/ExtensionUtils.jsm");
var {ExtensionCommon} = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");

var {
  DefaultWeakMap,
  promiseEvent,
} = ExtensionUtils;

var {
  makeWidgetId,
} = ExtensionCommon;

class BasePopup {
  constructor(extension, viewNode, popupURL, browserStyle, fixedWidth = false, blockParser = false) {
    this.extension = extension;
    this.popupURL = popupURL;
    this.viewNode = viewNode;
    this.browserStyle = browserStyle;
    this.window = viewNode.ownerGlobal;
    this.destroyed = false;
    this.fixedWidth = fixedWidth;
    this.blockParser = blockParser;

    extension.callOnClose(this);

    this.contentReady = new Promise(resolve => {
      this._resolveContentReady = resolve;
    });

    this.window.addEventListener("unload", this);
    this.viewNode.addEventListener("popuphiding", this);
    this.panel.addEventListener("popuppositioned", this, {once: true, capture: true});

    this.browser = null;
    this.browserLoaded = new Promise((resolve, reject) => {
      this.browserLoadedDeferred = {resolve, reject};
    });
    this.browserReady = this.createBrowser(viewNode, popupURL);

    BasePopup.instances.get(this.window).set(extension, this);
  }

  static for(extension, window) {
    return BasePopup.instances.get(window).get(extension);
  }

  destroy() {
    this.extension.forgetOnClose(this);

    this.window.removeEventListener("unload", this);

    this.destroyed = true;
    this.browserLoadedDeferred.reject(new Error("Popup destroyed"));
    // Ignore unhandled rejections if the "attach" method is not called.
    this.browserLoaded.catch(() => {});

    BasePopup.instances.get(this.window).delete(this.extension);

    return this.browserReady.then(() => {
      if (this.browser) {
        this.destroyBrowser(this.browser, true);
        this.browser.parentNode.remove();
      }
      if (this.stack) {
        this.stack.remove();
      }

      if (this.viewNode) {
        this.viewNode.removeEventListener("popuphiding", this);
        delete this.viewNode.customRectGetter;
      }

      let {panel} = this;
      if (panel) {
        panel.removeEventListener("popuppositioned", this, {capture: true});
        panel.style.removeProperty("--arrowpanel-background");
        panel.style.removeProperty("--arrowpanel-border-color");
      }

      this.browser = null;
      this.stack = null;
      this.viewNode = null;
    });
  }

  destroyBrowser(browser, finalize = false) {
    let mm = browser.messageManager;
    // If the browser has already been removed from the document, because the
    // popup was closed externally, there will be no message manager here, so
    // just replace our receiveMessage method with a stub.
    if (mm) {
      mm.removeMessageListener("DOMTitleChanged", this);
      mm.removeMessageListener("Extension:BrowserBackgroundChanged", this);
      mm.removeMessageListener("Extension:BrowserContentLoaded", this);
      mm.removeMessageListener("Extension:BrowserResized", this);
      mm.removeMessageListener("Extension:DOMWindowClose", this);
    } else if (finalize) {
      this.receiveMessage = () => {};
    }
  }

  get panel() {
    return this.viewNode;
  }

  receiveMessage({name, data}) {
    switch (name) {
      case "DOMTitleChanged":
        this.viewNode.setAttribute("aria-label", this.browser.contentTitle);
        break;

      case "Extension:BrowserBackgroundChanged":
        this.setBackground(data.background);
        break;

      case "Extension:BrowserContentLoaded":
        this.browserLoadedDeferred.resolve();
        break;

      case "Extension:BrowserResized":
        this._resolveContentReady();
        if (this.ignoreResizes) {
          this.dimensions = data;
        } else {
          this.resizeBrowser(data);
        }
        break;

      case "Extension:DOMWindowClose":
        this.closePopup();
        break;
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "unload":
      case "popuphiding":
        if (!this.destroyed) {
          this.destroy();
        }
        break;
      case "popuppositioned":
        if (!this.destroyed) {
          this.browserLoaded.then(() => {
            if (this.destroyed) {
              return;
            }
            this.browser.messageManager.sendAsyncMessage("Extension:GrabFocus", {});
          }).catch(() => {
            // If the panel closes too fast an exception is raised here and tests will fail.
          });
        }
        break;
    }
  }

  createBrowser(viewNode, popupURL = null) {
    let document = viewNode.ownerDocument;

    let stack = document.createXULElement("stack");
    stack.setAttribute("class", "webextension-popup-stack");

    let browser = document.createXULElement("browser");
    browser.setAttribute("type", "content");
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("transparent", "true");
    browser.setAttribute("class", "webextension-popup-browser");
    browser.setAttribute("webextension-view-type", "popup");
    browser.setAttribute("tooltip", "aHTMLTooltip");
    browser.setAttribute("contextmenu", "contentAreaContextMenu");
    browser.setAttribute("autocompletepopup", "PopupAutoComplete");
    browser.setAttribute("selectmenulist", "ContentSelectDropdown");
    browser.setAttribute("selectmenuconstrained", "false");
    browser.sameProcessAsFrameLoader = this.extension.groupFrameLoader;

    // We only need flex sizing for the sake of the slide-in sub-views of the
    // main menu panel, so that the browser occupies the full width of the view,
    // and also takes up any extra height that's available to it.
    browser.setAttribute("flex", "1");
    stack.setAttribute("flex", "1");

    // Note: When using noautohide panels, the popup manager will add width and
    // height attributes to the panel, breaking our resize code, if the browser
    // starts out smaller than 30px by 10px. This isn't an issue now, but it
    // will be if and when we popup debugging.

    this.browser = browser;
    this.stack = stack;

    let readyPromise = promiseEvent(browser, "load");

    stack.appendChild(browser);
    viewNode.appendChild(stack);

    ExtensionParent.apiManager.emit("extension-browser-inserted", browser);

    let setupBrowser = browser => {
      let mm = browser.messageManager;
      mm.addMessageListener("DOMTitleChanged", this);
      mm.addMessageListener("Extension:BrowserBackgroundChanged", this);
      mm.addMessageListener("Extension:BrowserContentLoaded", this);
      mm.addMessageListener("Extension:BrowserResized", this);
      mm.addMessageListener("Extension:DOMWindowClose", this, true);
      return browser;
    };

    if (!popupURL) {
      return setupBrowser(browser);
    }

    return readyPromise.then(() => {
      setupBrowser(browser);
      let mm = browser.messageManager;

      // Sets the context information for context menus.
      mm.loadFrameScript("chrome://browser/content/content.js", true, true);

      mm.loadFrameScript(
        "chrome://extensions/content/ext-browser-content.js", false, true);

      mm.sendAsyncMessage("Extension:InitBrowser", {
        allowScriptsToClose: true,
        blockParser: this.blockParser,
        fixedWidth: this.fixedWidth,
        maxWidth: 800,
        maxHeight: 600,
        stylesheets: [],
      });

      browser.loadURI(popupURL, {triggeringPrincipal: this.extension.principal});
    });
  }

  resizeBrowser({width, height, detail}) {
    if (this.fixedWidth) {
      // Figure out how much extra space we have on the side of the panel
      // opposite the arrow.
      let side = this.panel.getAttribute("side") == "top" ? "bottom" : "top";
      let maxHeight = this.viewHeight + this.extraHeight[side];

      height = Math.min(height, maxHeight);
      this.browser.style.height = `${height}px`;

      // Used by the panelmultiview code to figure out sizing without reparenting
      // (which would destroy the browser and break us).
      this.lastCalculatedInViewHeight = Math.max(height, this.viewHeight);
    } else {
      this.browser.style.width = `${width}px`;
      this.browser.style.minWidth = `${width}px`;
      this.browser.style.height = `${height}px`;
      this.browser.style.minHeight = `${height}px`;
    }

    this.panel.adjustArrowPosition();

    let event = new this.window.CustomEvent("WebExtPopupResized", {detail});
    this.browser.dispatchEvent(event);
  }

  setBackground(background) {
    // Panels inherit the applied theme (light, dark, etc) and there is a high
    // likelihood that most extension authors will not have tested with a dark theme.
    // If they have not set a background-color, we force it to white to ensure visibility
    // of the extension content. Passing `null` should be treated the same as no argument,
    // which is why we can't use default parameters here.
    if (!background) {
      background = "#fff";
    }
    if (this.panel.id != "widget-overflow") {
      this.panel.style.setProperty("--arrowpanel-background", background);
    }
    if (background == "#fff") {
      // Set a usable default color that work with the default background-color.
      this.panel.style.setProperty("--arrowpanel-border-color", "hsla(210,4%,10%,.15)");
    }
    this.background = background;
  }
}

class ViewPopup extends BasePopup {
  constructor(extension, window, popupURL, browserStyle, fixedWidth, blockParser) {
    let document = window.document;

    let panel = document.createXULElement("panel");
    panel.setAttribute("id", makeWidgetId(extension.id) + "-panel");
    panel.setAttribute("class", "mail-extension-panel");
    panel.setAttribute("type", "arrow");
    panel.setAttribute("role", "group");
    document.getElementById("mainPopupSet").appendChild(panel);

    super(extension, panel, popupURL, browserStyle, fixedWidth, blockParser);

    this.ignoreResizes = true;

    this.shown = false;
    this.tempPanel = panel;
    this.tempBrowser = this.browser;

    this.browser.classList.add("webextension-preload-browser");
  }

  removeTempPanel() {
    if (this.tempPanel) {
      this.tempPanel.remove();
      this.tempPanel = null;
    }
    if (this.tempBrowser) {
      this.tempBrowser.parentNode.remove();
      this.tempBrowser = null;
    }
  }

  destroy() {
    return super.destroy().then(() => {
      this.removeTempPanel();
    });
  }

  closePopup() {
    if (this.shown) {
      this.viewNode.hidePopup();
    } else {
      this.destroy();
    }
  }
}

/**
 * A map of active popups for a given browser window.
 *
 * WeakMap[window -> WeakMap[Extension -> BasePopup]]
 */
BasePopup.instances = new DefaultWeakMap(() => new WeakMap());
