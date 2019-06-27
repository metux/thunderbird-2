"use strict";

module.exports = {
  "globals": {
    // These are defined in the WebExtension script scopes by ExtensionCommon.jsm.
    // From toolkit/components/extensions/.eslintrc.js.
    "ExtensionAPI": true,
    "ExtensionCommon": true,
    "ExtensionUtils": true,
    "extensions": true,
    "global": true,
    "Services": true,

    // From toolkit/components/extensions/parent/.eslintrc.js.
    "CONTAINER_STORE": true,
    "DEFAULT_STORE": true,
    "EventEmitter": true,
    "EventManager": true,
    "InputEventManager": true,
    "PRIVATE_STORE": true,
    "TabBase": true,
    "TabManagerBase": true,
    "TabTrackerBase": true,
    "WindowBase": true,
    "WindowManagerBase": true,
    "WindowTrackerBase": true,
    "getContainerForCookieStoreId": true,
    "getCookieStoreIdForContainer": true,
    "getCookieStoreIdForTab": true,
    "isContainerCookieStoreId": true,
    "isDefaultCookieStoreId": true,
    "isPrivateCookieStoreId": true,
    "isValidCookieStoreId": true,

    // These are defined in ext-mail.js.
    "ExtensionError": true,
    "Tab": true,
    "Window": true,
    "WindowEventManager": true,
    "convertFolder": true,
    "convertMessage": true,
    "folderPathToURI": true,
    "folderURIToPath": true,
    "getTabBrowser": true,
    "makeWidgetId": true,
    "messageListTracker": true,
    "messageTracker": true,
    "tabGetSender": true,
    "tabTracker": true,
    "windowTracker": true,

    // ext-browserAction.js
    "browserActionFor": true,
  },
};
