/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The ext-* files are imported into the same scopes.
/* import-globals-from ext-mail.js */
this.windows = class extends ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { windowManager } = extension;

    return {
      windows: {
        onCreated: new WindowEventManager({
          context,
          name: "windows.onCreated",
          event: "domwindowopened",
          listener: (fire, window) => {
            fire.async(windowManager.convert(window));
          },
        }).api(),

        onRemoved: new WindowEventManager({
          context,
          name: "windows.onRemoved",
          event: "domwindowclosed",
          listener: (fire, window) => {
            fire.async(windowTracker.getId(window));
          },
        }).api(),

        onFocusChanged: new EventManager({
          context,
          name: "windows.onFocusChanged",
          register: fire => {
            // Keep track of the last windowId used to fire an onFocusChanged event
            let lastOnFocusChangedWindowId;

            let listener = event => {
              // Wait a tick to avoid firing a superfluous WINDOW_ID_NONE
              // event when switching focus between two Firefox windows.
              Promise.resolve().then(() => {
                let window = Services.focus.activeWindow;
                let windowId = window ? windowTracker.getId(window) : Window.WINDOW_ID_NONE;
                if (windowId !== lastOnFocusChangedWindowId) {
                  fire.async(windowId);
                  lastOnFocusChangedWindowId = windowId;
                }
              });
            };
            windowTracker.addListener("focus", listener);
            windowTracker.addListener("blur", listener);
            return () => {
              windowTracker.removeListener("focus", listener);
              windowTracker.removeListener("blur", listener);
            };
          },
        }).api(),

        get(windowId, getInfo) {
          let window = windowTracker.getWindow(windowId, context);
          if (!window) {
            return Promise.reject({ message: `Invalid window ID: ${windowId}` });
          }
          return Promise.resolve(windowManager.convert(window, getInfo));
        },

        getCurrent(getInfo) {
          let window = context.currentWindow || windowTracker.topWindow;
          return Promise.resolve(windowManager.convert(window, getInfo));
        },

        getLastFocused(getInfo) {
          let window = windowTracker.topWindow;
          return Promise.resolve(windowManager.convert(window, getInfo));
        },

        getAll(getInfo) {
          let doNotCheckTypes = !getInfo || !getInfo.windowTypes;

          let windows = Array.from(windowManager.getAll(), win => win.convert(getInfo))
            .filter(win => doNotCheckTypes || getInfo.windowTypes.includes(win.type));
          return Promise.resolve(windows);
        },

        create(createData) {
          let needResize = (createData.left !== null || createData.top !== null ||
                            createData.width !== null || createData.height !== null);

          if (needResize) {
            if (createData.state && createData.state != "normal") {
              return Promise.reject({ message: `"state": "${createData.state}" may not be combined with "left", "top", "width", or "height"` });
            }
            createData.state = "normal";
          }

          let createWindowArgs = (urls) => {
            let args = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
            let actionData = {
              action: "open",
              tabs: urls.map(url => ({ tabType: "contentTab", tabParams: { contentPage: url } })),
            };
            actionData.wrappedJSObject = actionData;
            args.appendElement(null);
            args.appendElement(actionData);
            return args;
          };

          let window;
          let wantNormalWindow = createData.type === null || createData.type == "normal";
          let features = ["chrome"];
          if (wantNormalWindow) {
            features.push("dialog=no", "all", "status", "toolbar");

            if (createData.incognito) {
              // A private mode mail window isn't useful for Thunderbird
              return Promise.reject({ message: "`incognito` is currently not supported for normal windows" });
            }
          } else {
            // All other types create "popup"-type windows by default.
            features.push("dialog", "resizable", "minimizable", "centerscreen", "titlebar", "close");

            if (createData.incognito) {
              features.push("private");
            }
          }

          if (createData.tabId) {
            if (createData.url) {
              return Promise.reject({ message: "`tabId` may not be used in conjunction with `url`" });
            }

            if (createData.allowScriptsToClose) {
              return Promise.reject({ message: "`tabId` may not be used in conjunction with `allowScriptsToClose`" });
            }

            let nativeTabInfo = tabTracker.getTab(createData.tabId);
            let tabmail = getTabBrowser(nativeTabInfo).ownerDocument.getElementById("tabmail");
            let targetType = wantNormalWindow ? null : "popup";
            window = tabmail.replaceTabWithWindow(nativeTabInfo, targetType)[0];
          } else if (createData.url) {
            let uris = Array.isArray(createData.url) ? createData.url : [createData.url];
            let args = createWindowArgs(uris);
            window = Services.ww.openWindow(null, "chrome://messenger/content/", "_blank", features.join(","), args);
          } else {
            let args = null;
            if (!wantNormalWindow) {
              args = createWindowArgs(["about:blank"]);
            }
            window = Services.ww.openWindow(null, "chrome://messenger/content/", "_blank", features.join(","), args);
          }

          let win = windowManager.getWrapper(window);
          win.updateGeometry(createData);

          // TODO: focused, type

          return new Promise(resolve => {
            window.addEventListener("load", () => {
              resolve();
            }, { once: true });
          }).then(() => {
            if (["minimized", "fullscreen", "docked", "normal", "maximized"].includes(createData.state)) {
              win.state = createData.state;
            }
            return win.convert({ populate: true });
          });
        },

        update(windowId, updateInfo) {
          if (updateInfo.state && updateInfo.state != "normal") {
            if (updateInfo.left !== null || updateInfo.top !== null ||
                updateInfo.width !== null || updateInfo.height !== null) {
              return Promise.reject({ message: `"state": "${updateInfo.state}" may not be combined with "left", "top", "width", or "height"` });
            }
          }

          let win = windowManager.get(windowId, context);
          if (updateInfo.focused) {
            Services.focus.activeWindow = win.window;
          }

          if (updateInfo.state) {
            win.state = updateInfo.state;
          }

          if (updateInfo.drawAttention) {
            // Bug 1257497 - Firefox can't cancel attention actions.
            win.window.getAttention();
          }

          win.updateGeometry(updateInfo);

          if (updateInfo.titlePreface) {
            win.setTitlePreface(updateInfo.titlePreface);
            win.window.gBrowser.updateTitlebar();
          }

          // TODO: All the other properties, focused=false...

          return Promise.resolve(win.convert());
        },

        remove(windowId) {
          let window = windowTracker.getWindow(windowId, context);
          window.close();

          return new Promise(resolve => {
            let listener = () => {
              windowTracker.removeListener("domwindowclosed", listener);
              resolve();
            };
            windowTracker.addListener("domwindowclosed", listener);
          });
        },
      },
    };
  }
};
