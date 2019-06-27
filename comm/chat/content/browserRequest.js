/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource:///modules/imServices.jsm");

var wpl = Ci.nsIWebProgressListener;

var reporterListener = {
  _isBusy: false,
  get statusMeter() {
    delete this.statusMeter;
    return this.statusMeter = document.getElementById("statusbar-icon");
  },
  get securityButton() {
    delete this.securityButton;
    return this.securityButton = document.getElementById("security-button");
  },
  get securityLabel() {
    delete this.securityLabel;
    return this.securityLabel = document.getElementById("security-status");
  },
  get securityDisplay() {
    delete this.securityDisplay;
    return this.securityDisplay = document.getElementById("security-display");
  },

  QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener",
                                          "nsISupportsWeakReference"]),

  onStateChange(/* in nsIWebProgress */ aWebProgress,
                /* in nsIRequest */ aRequest,
                /* in unsigned long */ aStateFlags,
                /* in nsresult */ aStatus) {
    if (aStateFlags & wpl.STATE_START &&
        aStateFlags & wpl.STATE_IS_NETWORK) {
      this.statusMeter.value = 0;
      this.statusMeter.parentNode.collapsed = false;
      this.securityLabel.collapsed = true;
    }
    else if (aStateFlags & wpl.STATE_STOP &&
             aStateFlags & wpl.STATE_IS_NETWORK) {
      this.statusMeter.parentNode.collapsed = true;
      this.securityLabel.collapsed = false;
    }
  },

  onProgressChange(/* in nsIWebProgress */ aWebProgress,
                   /* in nsIRequest */ aRequest,
                   /* in long */ aCurSelfProgress,
                   /* in long */ aMaxSelfProgress,
                   /* in long */ aCurTotalProgress,
                   /* in long */ aMaxTotalProgress) {
    if (aMaxTotalProgress > 0) {
      let percentage = (aCurTotalProgress * 100) / aMaxTotalProgress;
      this.statusMeter.value = percentage;
    }
  },

  onLocationChange(/* in nsIWebProgress */ aWebProgress,
                   /* in nsIRequest */ aRequest,
                   /* in nsIURI */ aLocation) {
    this.securityDisplay.setAttribute("label", aLocation.host);
  },

  onStatusChange(/* in nsIWebProgress */ aWebProgress,
                 /* in nsIRequest */ aRequest,
                 /* in nsresult */ aStatus,
                 /* in wstring */ aMessage) {
  },

  onSecurityChange(/* in nsIWebProgress */ aWebProgress,
                   /* in nsIRequest */ aRequest,
                   /* in unsigned long */ aState) {
    const wpl_security_bits = wpl.STATE_IS_SECURE |
                              wpl.STATE_IS_BROKEN |
                              wpl.STATE_IS_INSECURE;
    let browser = document.getElementById("requestFrame");
    let level;

    switch (aState & wpl_security_bits) {
      case wpl.STATE_IS_SECURE:
        level = "high";
        break;
      case wpl.STATE_IS_BROKEN:
        level = "broken";
        break;
    }
    if (level) {
      this.securityButton.setAttribute("level", level);
      this.securityButton.hidden = false;
      this.securityLabel.setAttribute("label", browser.securityUI.tooltipText);
    } else {
      this.securityButton.hidden = true;
      this.securityButton.removeAttribute("level");
    }
    this.securityButton.setAttribute("tooltiptext",
                                     browser.securityUI.tooltipText);
  },

  onContentBlockingEvent(/* in nsIWebProgress */ aWebProgress,
                         /* in nsIRequest */ aRequest,
                         /* in unsigned long */ aEvent) {
  },
};

function cancelRequest()
{
  reportUserClosed();
  window.close();
}

function reportUserClosed()
{
  let request = window.arguments[0];
  request.QueryInterface(Ci.prplIRequestBrowser);
  request.cancelled();
}

function loadRequestedUrl()
{
  let request = window.arguments[0];
  request.QueryInterface(Ci.prplIRequestBrowser);
  document.getElementById("headerMessage").textContent = request.promptText;
  let account = request.account;
  document.getElementById("headerLabel").value =
    account.protocol.name + " - " + account.name;
  document.getElementById("headerImage").src =
    account.protocol.iconBaseURI + "icon48.png";

  let browser = document.getElementById("requestFrame");
  browser.docShell.allowPlugins = false;

  if (Services.prefs.getBoolPref("chat.browserRequest.disableJavascript"))
    browser.docShell.allowJavascript = false;

  browser.addProgressListener(reporterListener,
                              Ci.nsIWebProgress.NOTIFY_ALL);
  let url = request.url;
  if (url != "")
    browser.setAttribute("src", url);
  request.loaded(window, browser.webProgress);
}
