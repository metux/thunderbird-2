/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../base/content/utilityOverlay.js */

async function openNewPrefsTab(paneID, tabID, otherArgs) {
  let tabmail = document.getElementById("tabmail");
  let prefsTabMode = tabmail.tabModes.preferencesTab;

  is(prefsTabMode.tabs.length, 0, "Prefs tab is not open");

  let prefsDocument = await new Promise(resolve => {
    Services.obs.addObserver(function documentLoaded(subject) {
      if (subject.URL == "about:preferences") {
        Services.obs.removeObserver(documentLoaded, "chrome-document-loaded");
        resolve(subject);
      }
    }, "chrome-document-loaded");
    openPreferencesTab(paneID, tabID, otherArgs);
  });
  ok(prefsDocument.URL == "about:preferences", "Prefs tab is open");

  let prefsWindow = prefsDocument.ownerGlobal;
  if (paneID) {
    if (prefsWindow.getCurrentPaneID() != paneID) {
      let pane = prefsDocument.getElementById(paneID);
      await new Promise(resolve => {
        pane.addEventListener("paneSelected", resolve, { once: true });
      });
    }

    await new Promise(resolve => setTimeout(resolve));
    is(prefsWindow.getCurrentPaneID(), paneID, `Selected pane is ${paneID}`);
    if (tabID) {
      is(prefsDocument.querySelector(`#${paneID} tab[selected]`).id, tabID, `Selected tab is ${tabID}`);
    }
  } else {
    // If we don't wait here for other scripts to run, they
    // could be in a bad state if our test closes the tab.
    await new Promise(resolve => setTimeout(resolve));
  }

  registerCleanupOnce();

  return { prefsDocument, prefsWindow };
}

async function openExistingPrefsTab(paneID, tabID, otherArgs) {
  let tabmail = document.getElementById("tabmail");
  let prefsTabMode = tabmail.tabModes.preferencesTab;

  is(prefsTabMode.tabs.length, 1, "Prefs tab is open");

  let prefsDocument = prefsTabMode.tabs[0].browser.contentDocument;
  let prefsWindow = prefsDocument.ownerGlobal;

  if (paneID && prefsWindow.getCurrentPaneID() != paneID) {
    await new Promise(resolve => {
      prefsDocument.addEventListener("paneSelected", resolve, { once: true });
      openPreferencesTab(paneID, tabID, otherArgs);
    });
  } else {
    openPreferencesTab(paneID, tabID, otherArgs);
  }

  await new Promise(resolve => setTimeout(resolve));
  is(prefsWindow.getCurrentPaneID(), paneID, `Selected pane is ${paneID}`);
  if (tabID) {
    is(prefsDocument.querySelector(`#${paneID} tab[selected]`).id, tabID, `Selected tab is ${tabID}`);
  }

  registerCleanupOnce();

  return { prefsDocument, prefsWindow };
}

function registerCleanupOnce() {
  if (registerCleanupOnce.alreadyRegistered) {
    return;
  }
  registerCleanupFunction(closePrefsTab);
  registerCleanupOnce.alreadyRegistered = true;
}

async function closePrefsTab() {
  info("Closing prefs tab");
  let tabmail = document.getElementById("tabmail");
  let prefsTab = tabmail.tabModes.preferencesTab.tabs[0];
  if (prefsTab) {
    tabmail.closeTab(prefsTab);
  }
}

/**
 * Tests a checkbox sets the preference is set in the right state when the preferences tab opens,
 * that the preference it relates to is set properly, and any UI elements that should be disabled
 * by it are disabled.
 *
 * Each of the tests arguments is an object describing a test, containing:
 *   checkboxID - the ID of the checkbox to test
 *   pref - the name of a preference,
 *   prefValues - an array of two values: pref value when not checked, pref value when checked
 *                (optional, defaults to [false, true])
 *   enabledElements - an array of CSS selectors (optional)
 *   enabledInverted - if the elements should be disabled when the checkbox is checked (optional)
 */
async function testCheckboxes(paneID, tabID, ...tests) {
  for (let initiallyChecked of [true, false]) {
    info(`Opening ${paneID} with prefs set to ${initiallyChecked}`);

    for (let test of tests) {
      let wantedValue = initiallyChecked;
      if (test.prefValues) {
        wantedValue = wantedValue ? test.prefValues[1] : test.prefValues[0];
      }
      if (typeof wantedValue == "number") {
        Services.prefs.setIntPref(test.pref, wantedValue);
      } else {
        Services.prefs.setBoolPref(test.pref, wantedValue);
      }
    }

    let { prefsDocument, prefsWindow } = await openNewPrefsTab(paneID, tabID);

    let testUIState = function(test, checked) {
      let wantedValue = checked;
      if (test.prefValues) {
        wantedValue = wantedValue ? test.prefValues[1] : test.prefValues[0];
      }
      let checkbox = prefsDocument.getElementById(test.checkboxID);
      is(checkbox.checked, checked, "Checkbox " + (checked ? "is" : "isn't") + " checked");
      if (typeof wantedValue == "number") {
        is(Services.prefs.getIntPref(test.pref, -999), wantedValue, `Pref is ${wantedValue}`);
      } else {
        is(Services.prefs.getBoolPref(test.pref), wantedValue, `Pref is ${wantedValue}`);
      }

      if (test.enabledElements) {
        let disabled = checked;
        if (test.enabledInverted) {
          disabled = !disabled;
        }
        for (let selector of test.enabledElements) {
          let elements = prefsDocument.querySelectorAll(selector);
          ok(elements.length >= 1, `At least one element matched '${selector}'`);
          for (let element of elements) {
            is(element.disabled, !disabled, "Element " + (disabled ? "isn't" : "is") + " disabled");
          }
        }
      }
    };

    for (let test of tests) {
      info(`Checking ${test.checkboxID}`);

      let checkbox = prefsDocument.getElementById(test.checkboxID);
      testUIState(test, initiallyChecked);

      EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
      testUIState(test, !initiallyChecked);

      EventUtils.synthesizeMouseAtCenter(checkbox, {}, prefsWindow);
      testUIState(test, initiallyChecked);
    }

    await closePrefsTab();
  }
}

/**
 * Tests a set of radio buttons is in the right state when the preferences tab opens, and when
 * the selected button changes that the preference it relates to is set properly, and any related
 * UI elements that should be disabled are disabled.
 *
 * Each of the tests arguments is an object describing a test, containing:
 *   pref - the name of an integer preference,
 *   states - an array with each element describing a radio button:
 *     id - the ID of the button to test,
 *     prefValue - the value the pref should be set to
 *     enabledElements - an array of CSS selectors to elements that should be enabled when this
 *                       radio button is selected (optional)
 */
async function testRadioButtons(paneID, tabID, ...tests) {
  for (let { pref, states } of tests) {
    for (let initialState of states) {
      info(`Opening ${paneID} with ${pref} set to ${initialState.prefValue}`);

      if (typeof initialState.prefValue == "number") {
        Services.prefs.setIntPref(pref, initialState.prefValue);
      } else if (typeof initialState.prefValue == "boolean") {
        Services.prefs.setBoolPref(pref, initialState.prefValue);
      } else {
        Services.prefs.setCharPref(pref, initialState.prefValue);
      }

      let { prefsDocument, prefsWindow } = await openNewPrefsTab(paneID, tabID);

      let testUIState = function(currentState) {
        info(`Testing with ${pref} set to ${currentState.prefValue}`);
        for (let state of states) {
          let isCurrentState = (state == currentState);
          let radio = prefsDocument.getElementById(state.id);
          is(radio.selected, isCurrentState);

          if (state.enabledElements) {
            for (let selector of state.enabledElements) {
              let elements = prefsDocument.querySelectorAll(selector);
              ok(elements.length >= 1, `At least one element matched '${selector}'`);
              for (let element of elements) {
                is(element.disabled, !isCurrentState, "Element " + (isCurrentState ? "isn't" : "is") + " disabled");
              }
            }
          }
        }
        if (typeof initialState.prefValue == "number") {
          is(Services.prefs.getIntPref(pref, -999), currentState.prefValue, `Pref is ${currentState.prefValue}`);
        } else if (typeof initialState.prefValue == "boolean") {
          is(Services.prefs.getBoolPref(pref), currentState.prefValue, `Pref is ${currentState.prefValue}`);
        } else {
          is(Services.prefs.getCharPref(pref, "FAKE VALUE"), currentState.prefValue, `Pref is ${currentState.prefValue}`);
        }
      };

      // Check the initial setup is correct.
      testUIState(initialState);
      // Cycle through possible values, checking each one.
      for (let state of states) {
        if (state == initialState) {
          continue;
        }
        let radio = prefsDocument.getElementById(state.id);
        EventUtils.synthesizeMouseAtCenter(radio, {}, prefsWindow);
        testUIState(state);
      }
      // Go back to the initial value.
      let initialRadio = prefsDocument.getElementById(initialState.id);
      EventUtils.synthesizeMouseAtCenter(initialRadio, {}, prefsWindow);
      testUIState(initialState);

      await closePrefsTab();
    }
  }
}
