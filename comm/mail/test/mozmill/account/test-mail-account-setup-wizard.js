/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../shared-modules/test-account-manager-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-keyboard-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-mail-account-setup-wizard";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "account-manager-helpers",
  "keyboard-helpers",
];

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");

var user = {
  name: "Yamato Nadeshiko",
  email: "yamato.nadeshiko@example.com",
  password: "abc12345",
  incomingHost: "testin.example.com",
  outgoingHost: "testout.example.com",
};

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

// Remove an account in the Account Manager, but not via the UI.
function remove_account_internal(amc, aAccount, aOutgoing) {
  let win = amc.window;

  try {
    // Remove the account and incoming server
    let serverId = aAccount.incomingServer.serverURI;
    MailServices.accounts.removeAccount(aAccount);
    if (serverId in win.accountArray)
      delete win.accountArray[serverId];
    win.selectServer(null, null);

    // Remove the outgoing server
    MailServices.smtp.deleteServer(aOutgoing);
    win.replaceWithDefaultSmtpServer(aOutgoing.key);
  } catch (ex) {
    throw new Error("failure to remove account: " + ex + "\n");
  }
}

function test_mail_account_setup() {
  // Set the pref to load a local autoconfig file.
  let pref_name = "mailnews.auto_config_url";
  let url = collector.addHttpResource("../account/xml", "autoconfig");
  Services.prefs.setCharPref(pref_name, url);

  // Force .com MIME-Type to text/xml
  collector.httpd.registerContentType("com", "text/xml");

  open_mail_account_setup_wizard(function(awc) {
    // Input user's account information
    awc.click(awc.eid("realname"));
    if (awc.e("realname").value) {
      // If any realname is already filled, clear it out, we have our own.
      delete_all_existing(awc, awc.eid("realname"));
    }
    input_value(awc, user.name);
    awc.keypress(null, "VK_TAB", {});
    input_value(awc, user.email);
    awc.keypress(null, "VK_TAB", {});
    input_value(awc, user.password);

    // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
    awc.click(awc.eid("next_button"));

    // XXX: This should probably use a notification, once we fix bug 561143.
    awc.waitFor(() => awc.window.gEmailConfigWizard._currentConfig != null,
                "Timeout waiting for current config to become non-null",
                8000, 600);

    // Open the advanced settings (Account Manager) to create the account
    // immediately.  We use an invalid email/password so the setup will fail
    // anyway.
    open_advanced_settings_from_account_wizard(subtest_verify_account, awc);

    // Clean up
    Services.prefs.clearUserPref(pref_name);
  });
}

function subtest_verify_account(amc) {
  amc.waitFor(() => amc.window.currentAccount != null,
              "Timeout waiting for currentAccount to become non-null");
  let account = amc.window.currentAccount;
  let identity = account.defaultIdentity;
  let incoming = account.incomingServer;
  let outgoing = MailServices.smtp.getServerByKey(identity.smtpServerKey);

  let config = {
    "incoming server username": {
      actual: incoming.username, expected: user.email.split("@")[0],
    },
    "outgoing server username": {
      actual: outgoing.username, expected: user.email,
    },
    "incoming server hostname": {
      // Note: N in the hostName is uppercase
      actual: incoming.hostName, expected: user.incomingHost,
    },
    "outgoing server hostname": {
      // And this is lowercase
      actual: outgoing.hostname, expected: user.outgoingHost,
    },
    "user real name": { actual: identity.fullName, expected: user.name },
    "user email address": { actual: identity.email, expected: user.email },
  };

  try {
    for (let i in config) {
      if (config[i].actual != config[i].expected) {
        throw new Error("Configured " + i + " is " + config[i].actual +
                        ". It should be " + config[i].expected + ".");
      }
    }
  } finally {
    remove_account_internal(amc, account, outgoing);
  }
}

/**
 * Make sure that we don't re-set the information we get from the config
 * file if the password is incorrect.
 */
function test_bad_password_uses_old_settings() {
  // Set the pref to load a local autoconfig file, that will fetch the
  // ../account/xml/example.com which contains the settings for the
  // @example.com email account (see the 'user' object).
  let pref_name = "mailnews.auto_config_url";
  let url = collector.addHttpResource("../account/xml", "autoconfig");
  Services.prefs.setCharPref(pref_name, url);

  // Force .com MIME-Type to text/xml
  collector.httpd.registerContentType("com", "text/xml");

  mc.sleep(0);
  open_mail_account_setup_wizard(function(awc) {
    try {
      // Input user's account information
      awc.click(awc.eid("realname"));
      if (awc.e("realname").value) {
        // If any realname is already filled, clear it out, we have our own.
        delete_all_existing(awc, awc.eid("realname"));
      }
      input_value(awc, user.name);
      awc.keypress(null, "VK_TAB", {});
      input_value(awc, user.email);
      awc.keypress(null, "VK_TAB", {});
      input_value(awc, user.password);

      // Load the autoconfig file from http://localhost:433**/autoconfig/example.com
      awc.e("next_button").click();

      awc.waitFor(function() { return !this.disabled && !this.hidden; },
                  "Timeout waiting for create button to be visible and active",
                  8000, 600, awc.e("create_button"));
      awc.e("create_button").click();

      awc.waitFor(function() { return !this.disabled; },
                  "Timeout waiting for create button to be visible and active",
                  8000, 600, awc.e("create_button"));
      awc.e("create_button").click();
      awc.e("manual-edit_button").click();

      // Make sure all the values are the same as in the user object.
      awc.sleep(1000);
      assert_equals(awc.e("outgoing_hostname").value, user.outgoingHost,
                    "Outgoing server changed!");
      assert_equals(awc.e("incoming_hostname").value, user.incomingHost,
                    "incoming server changed!");
    } finally {
      // Clean up
      Services.prefs.clearUserPref(pref_name);
      awc.e("cancel_button").click();
    }
  });
}

function test_remember_password() {
  remember_password_test(true);
  remember_password_test(false);
}

/**
 * Test remember_password checkbox behavior with
 * signon.rememberSignons set to "aPrefValue"
 */
function remember_password_test(aPrefValue) {
  // save the pref for backup purpose
  let rememberSignons_pref_save =
      Services.prefs.getBoolPref("signon.rememberSignons", true);

  Services.prefs.setBoolPref("signon.rememberSignons", aPrefValue);

  // without this, it breaks the test, don't know why
  mc.sleep(0);
  open_mail_account_setup_wizard(function(awc) {
    try {
      let password = new elementslib.ID(awc.window.document, "password");
      let rememberPassword =
          new elementslib.ID(awc.window.document, "remember_password");

      // type something in the password field
      awc.e("password").focus();
      input_value(awc, "testing");

      awc.assertProperty(rememberPassword, "disabled", !aPrefValue);
      if (aPrefValue) {
        awc.assertChecked(rememberPassword);
      } else {
        awc.assertNotChecked(rememberPassword);
      }

      // empty the password field
      delete_all_existing(awc, password);

      // restore the saved signon.rememberSignons value
      Services.prefs.setBoolPref("signon.rememberSignons", rememberSignons_pref_save);
    } finally {
      // close the wizard
      awc.e("cancel_button").click();
    }
  });
}

