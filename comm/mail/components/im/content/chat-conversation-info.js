/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {Services} = ChromeUtils.import("resource:///modules/imServices.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

ChromeUtils.defineModuleGetter(this, "OTR", "resource:///modules/OTR.jsm");
ChromeUtils.defineModuleGetter(this, "OTRUI", "resource:///modules/OTRUI.jsm");

/* globals MozElements MozXULElement */

const gNotification = {};
XPCOMUtils.defineLazyGetter(gNotification, "notificationbox", () => {
  return new MozElements.NotificationBox(element => {
    element.setAttribute("flex", "1");
    document.getElementById("otr-notification-box").append(element);
  });
});

/**
 * The MozChatConversationInfo widget displays information about a chat:
 * e.g. the channel name and topic of an IRC channel, or nick, user image and
 * status of a conversation partner.
 * It is typically shown at the top right of the chat UI.
 * @extends {MozXULElement}
 */
class MozChatConversationInfo extends MozXULElement {
  static get inheritedAttributes() {
    return {
      ".userIconHolder": "userIcon",
      ".userIcon": "src=userIcon",
      ".statusTypeIcon": "status,typing,tooltiptext=statusTypeTooltiptext",
      ".displayName": "value=displayName",
      ".prplIcon": "src=prplIcon",
      ".statusMessage": "value=statusMessage,tooltiptext=statusTooltiptext,editable=topicEditable,editing,noTopic",
      ".statusMessageInput": "value=statusMessage,tooltiptext=statusTooltiptext,editable=topicEditable,editing,noTopic",
    };
  }

  connectedCallback() {
    if (this.hasChildNodes() || this.delayConnectedCallback()) {
      return;
    }
    this.setAttribute("orient", "vertical");

    this.appendChild(MozXULElement.parseXULToFragment(`
      <linkset>
        <html:link rel="localization" href="messenger/otr/chat.ftl"/>
      </linkset>

      <hbox class="displayUserAccount" flex="1">
        <stack class="statusImageStack">
          <box class="userIconHolder">
            <image class="userIcon" mousethrough="always"></image>
          </box>
          <image class="statusTypeIcon"></image>
        </stack>
        <stack class="displayNameAndstatusMessageStack" mousethrough="always" flex="1">
          <hbox align="center" flex="1">
            <description class="displayName" flex="1" crop="end">
            </description>
            <image class="prplIcon"></image>
          </hbox>
          <description class="statusMessage" mousethrough="never" crop="end" flex="100000"/>
          <textbox class="statusMessageInput" mousethrough="never" crop="end" flex="100000" collapsed="true"/>
        </stack>
      </hbox>
      <hbox class="otr-container" align="left" valign="middle" hidden="true">
        <label class="otr-label" crop="end" data-l10n-id="state-label" flex="1"/>
        <toolbarbutton id="otrButton"
                       mode="dialog"
                       class="otr-button toolbarbutton-1"
                       type="menu"
                       label="Insecure"
                       data-l10n-id="start-tooltip">
          <menupopup class="otr-menu-popup">
            <menuitem class="otr-start" data-l10n-id="start-label"
                      oncommand='this.closest("chat-conversation-info").onOtrStartClicked();'/>
            <menuitem class="otr-end" data-l10n-id="end-label"
                      oncommand='this.closest("chat-conversation-info").onOtrEndClicked();'/>
            <menuitem class="otr-auth" data-l10n-id="auth-label"
                      oncommand='this.closest("chat-conversation-info").onOtrAuthClicked();'/>
          </menupopup>
        </toolbarbutton>
      </hbox>
      <hbox id="otr-notification-box"></hbox>
    `));

    this.topic.addEventListener("click", this.startEditTopic.bind(this));

    if (Services.prefs.getBoolPref("chat.otr.enable")) {
      let otrButton = this.querySelector(".otr-button");
      otrButton.addEventListener("command", this.otrButtonClicked);
      OTRUI.setNotificationBox(gNotification.notificationbox);
    }
    this.initializeAttributeInheritance();
  }

  get topic() {
    return this.querySelector(".statusMessage");
  }

  get topicInput() {
    return this.querySelector(".statusMessageInput");
  }

  finishEditTopic(save) {
    if (!this.hasAttribute("editing")) {
      return;
    }

    let panel = document.getElementById("conversationsDeck").selectedPanel;

    let topic = this.topic;
    let topicInput = this.topicInput;
    topic.setAttribute("collapsed", "false");
    topicInput.setAttribute("collapsed", "true");
    if (save) {
      // apply the new topic only if it is different from the current one
      if (topicInput.value != topicInput.getAttribute("value")) {
        panel._conv.topic = topicInput.value;
      }
    }
    this.removeAttribute("editing");
    topicInput.removeEventListener("keypress", this._topicKeyPress, true);
    delete this._topicKeyPress;
    topicInput.removeEventListener("blur", this._topicBlur);
    delete this._topicBlur;

    // After removing the "editing" attribute, the focus is on an element
    // that can't receive keyboard events, so move it to somewhere else.
    panel.editor.focus();
  }

  topicKeyPress(event) {
    switch (event.keyCode) {
      case event.DOM_VK_RETURN:
        this.finishEditTopic(true);
        break;

      case event.DOM_VK_ESCAPE:
        this.finishEditTopic(false);
        event.stopPropagation();
        event.preventDefault();
        break;
    }
  }

  topicBlur(event) {
    if (event.originalTarget == this.topicInput.inputField) {
      this.finishEditTopic(true);
    }
  }

  startEditTopic() {
    let topic = this.topic;
    let topicInput = this.topicInput;
    if (!topic.hasAttribute("editable") || this.hasAttribute("editing")) {
      return;
    }

    this.setAttribute("editing", "true");
    topicInput.setAttribute("collapsed", "false");
    topic.setAttribute("collapsed", "true");
    this._topicKeyPress = this.topicKeyPress.bind(this);
    topicInput.addEventListener("keypress", this._topicKeyPress);
    this._topicBlur = this.topicBlur.bind(this);
    topicInput.addEventListener("blur", this._topicBlur);
    topicInput.getBoundingClientRect();
    if (this.hasAttribute("noTopic")) {
      topicInput.value = "";
    } else {
      topicInput.value = topic.value;
    }
    topicInput.inputField.select();
  }

  otrButtonClicked(aEvent) {
    aEvent.preventDefault();
    let otrMenu = this.querySelector(".otr-menu-popup");
    otrMenu.openPopup(otrMenu.parentNode, "after_start");
  }

  onOtrStartClicked() {
    // check if start-menu-command is disabled, if yes exit
    let convBinding = document.getElementById("conversationsDeck").selectedPanel;
    let uiConv = convBinding._conv;
    let conv = uiConv.target;
    let context = OTR.getContext(conv);
    let bundleId = "alert-" + (
      context.msgstate === OTR.getMessageState().OTRL_MSGSTATE_ENCRYPTED ?
        "refresh" : "start");
    OTRUI.sendSystemAlert(uiConv, conv, bundleId);
    OTR.sendQueryMsg(conv);
  }

  onOtrEndClicked() {
    let convBinding = document.getElementById("conversationsDeck").selectedPanel;
    let uiConv = convBinding._conv;
    let conv = uiConv.target;
    OTR.disconnect(conv, false);
    let bundleId = "alert-gone_insecure";
    OTRUI.sendSystemAlert(uiConv, conv, bundleId);
  }

  onOtrAuthClicked() {
    let convBinding = document.getElementById("conversationsDeck").selectedPanel;
    let uiConv = convBinding._conv;
    let conv = uiConv.target;
    OTRUI.openAuth(window, conv.normalizedName, "start", uiConv);
  }
}
customElements.define("chat-conversation-info", MozChatConversationInfo);
